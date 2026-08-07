/**
 * upload.js — 拖拽/文件选择上传
 * 对接 Unraid 7 内置版上传协议：Control.php?mode=upload 原始二进制分片（20MB）
 * 支持：文件拖拽 / 文件夹拖拽（webkitGetAsEntry 递归，Chrome/Edge）/ 文件选择
 * 文件夹上传：先 Browse.php mode=mkdir 递归建子目录，再逐文件分片上传
 */
(function () {
  'use strict';

  const CONTROL = '/webGui/include/Control.php';
  const SLICE = 20971520; // 20MB

  let queue = [];
  let cancelFlag = 0;
  let csrf = '';

  function getCsrf() {
    if (csrf) return csrf;
    // 从页面 meta 或全局变量取（Unraid webGui 注入）
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) { csrf = meta.content; return csrf; }
    const input = document.querySelector('input[name="csrf_token"]');
    if (input) { csrf = input.value; return csrf; }
    return '';
  }

  function triggerUpload() {
    document.getElementById('file-upload').click();
  }

  function bindUpload() {
    const input = document.getElementById('file-upload');
    input.addEventListener('change', () => {
      if (input.files.length) {
        uploadFiles(Array.from(input.files).map((f) => ({ file: f, rel: f.name })));
      }
      input.value = '';
    });

    const listArea = document.getElementById('file-list');
    listArea.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault();
    });
    listArea.addEventListener('drop', (e) => {
      e.preventDefault();
      collectDropItems(e.dataTransfer, (tasks) => {
        if (tasks && tasks.length) uploadFiles(tasks);
      });
    });
  }

  // 收集拖拽内容：优先文件夹递归（webkitGetAsEntry，Chrome/Edge），否则文件列表
  // 返回 [{ file, rel }]，rel 为相对路径（文件夹内带子目录）
  function collectDropItems(dt, cb) {
    const items = Array.from(dt.items || []);
    const entries = items.filter((i) => i.webkitGetAsEntry).map((i) => i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) {
      cb(dt.files && dt.files.length ? Array.from(dt.files).map((f) => ({ file: f, rel: f.name })) : null);
      return;
    }
    const tasks = [];
    let pending = 0;
    let finished = false;
    const maybeDone = () => { if (pending === 0 && finished) cb(tasks); };
    const walk = (entry, relPath) => {
      pending++;
      if (entry.isFile) {
        entry.file((f) => {
          tasks.push({ file: f, rel: relPath ? relPath + '/' + f.name : f.name });
          pending--; maybeDone();
        }, () => { pending--; maybeDone(); });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => {
          reader.readEntries((ents) => {
            if (!ents.length) { pending--; maybeDone(); return; }
            ents.forEach((en) => walk(en, relPath ? relPath + '/' + entry.name : entry.name));
            readBatch(); // 大目录分批读取
          }, () => { pending--; maybeDone(); });
        };
        readBatch();
      } else { pending--; maybeDone(); }
    };
    entries.forEach((en) => walk(en, ''));
    finished = true;
    maybeDone();
  }

  function uploadFiles(tasks) {
    const Explorer = window.Explorer;
    if (!Explorer) return;
    const cwd = Explorer.getState().cwd;
    queue.push(...tasks.map((t) => ({ file: t.file, rel: t.rel, done: false })));
    processQueue(cwd);
  }

  function uploadChunk(file, start, filePath, onProgress) {
    return new Promise((resolve, reject) => {
      const slice = file.slice(start, start + SLICE);
      const url = CONTROL + '?mode=upload&file=' + encodeURIComponent(filePath) + '&start=' + start + '&cancel=' + cancelFlag;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      const token = getCsrf();
      if (token) xhr.setRequestHeader('X-CSRF-Token', token);
      xhr.timeout = Math.max(600000, SLICE / 1024 * 60);

      xhr.onload = () => {
        if (cancelFlag === 1) { resolve('stop'); return; }
        if (xhr.status < 200 || xhr.status >= 300) { reject(new Error('http:' + xhr.status)); return; }
        const reply = xhr.responseText;
        if (reply === 'stop') { resolve('stop'); return; }
        if (reply.indexOf('error') === 0) { reject(new Error(reply)); return; }
        if (start + SLICE < file.size) {
          uploadChunk(file, start + SLICE, filePath, onProgress).then(resolve, reject);
        } else {
          resolve('done');
        }
        onProgress(Math.min(100, Math.round(((start + SLICE) / file.size) * 100)));
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(slice);
    });
  }

  async function processQueue(cwd) {
    const Explorer = window.Explorer;
    let done = 0;
    const total = queue.length;
    Explorer.showProgress(0, t('上传 {a}/{b}', { a: 0, b: total }));

    for (const item of queue) {
      if (item.done) continue;
      item.done = true;
      cancelFlag = 0;
      try {
        const rel = item.rel || item.file.name;
        const idx = rel.lastIndexOf('/');
        if (idx > 0) {
          // 子目录先递归创建（已存在则忽略错误）
          await Explorer.apiPost('mkdir', { dir: cwd, sub: rel.slice(0, idx) }).catch(() => {});
        }
        const filePath = cwd.replace(/\/+$/, '') + '/' + rel;
        const result = await uploadChunk(item.file, 0, filePath, (pct) => {
          Explorer.showProgress(Math.round(((done + pct / 100) / total) * 100), t('上传 {name} {pct}% ({n}/{total})', { name: rel, pct: pct, n: done + 1, total: total }));
        });
        if (result === 'stop') { Explorer.toast(t('上传已取消')); break; }
      } catch (err) {
        Explorer.toast(t('上传失败: {name} ({msg})', { name: item.rel || item.file.name, msg: err.message }), true);
      }
      done++;
      Explorer.showProgress(Math.round((done / total) * 100), t('上传中 {a}/{b}', { a: done, b: total }));
    }

    queue = [];
    Explorer.hideProgress();
    Explorer.refresh();
    Explorer.toast(t('上传完成 {a}/{b}', { a: done, b: total }));
    try { window.Explorer.apiPost('log', { type: 'op', msg: t('上传') + ': ' + (item.rel || item.file.name) + ' → ' + dir }).catch(() => {}); } catch (e) {}
  }

  window.triggerUpload = triggerUpload;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUpload);
  } else {
    bindUpload();
  }
})();
