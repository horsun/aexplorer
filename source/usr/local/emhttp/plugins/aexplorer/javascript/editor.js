/**
 * editor.js — 内置编辑器（官方 ACE + Control.php mode:edit/save）
 * Unraid 7 内置版协议：读 mode:edit（纯文本）/ 存 mode:save
 */
(function () {
  'use strict';

  const CONTROL = '/webGui/include/Control.php';

  let currentPath = null;
  let editor = null;
  let dirty = false;
  let currentBuffer = null;   // 原始字节（arrayBuffer），切换编码时重新解码
  let currentEncoding = 'utf-8';

  /** 从页面 meta 取 CSRF token（与 upload.js/dfm.js 一致） */
  function getCsrf() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function controlFetch(url, body) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const token = getCsrf();
    if (token) headers['X-CSRF-Token'] = token;
    return fetch(url, {
      method: 'POST',
      body: body.toString(),
      headers,
      credentials: 'same-origin',
    });
  }

  /** 按当前编码解码 buffer 并写入编辑器 */
  function decodeAndShow() {
    if (!currentBuffer) return;
    try {
      const text = new TextDecoder(currentEncoding).decode(currentBuffer);
      editor.session.setValue(text);
      dirty = false;
    } catch (e) {
      window.Explorer.toast(t('解码失败: {msg}', { msg: e.message }), true);
    }
  }

  function openEditor(path) {
    const Explorer = window.Explorer;
    currentPath = path;
    dirty = false;
    currentBuffer = null;
    currentEncoding = 'utf-8';

    const encSel = document.getElementById('editor-encoding');
    if (encSel) encSel.value = 'utf-8';

    const mask = document.getElementById('editor-mask');
    document.getElementById('editor-title').textContent = t('加载中: {name}', { name: path.split('/').pop() });
    document.getElementById('editor-box').innerHTML = '';
    mask.style.display = 'flex';

    // 初始化 ACE
    editor = ace.edit('editor-box');
    const modelist = ace.require('ace/ext/modelist');
    editor.session.setMode(modelist.getModeForPath(path).mode);
    editor.setOptions({
      showPrintMargin: false,
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: 'ace/theme/tomorrow_night',
    });

    // 读取内容（内置版 mode:edit 返回纯文本）——按字节取回，支持切换编码查看
    const body = new URLSearchParams();
    body.append('mode', 'edit');
    body.append('file', encodeURIComponent(path));
    controlFetch(CONTROL, body).then((r) => r.arrayBuffer()).then((buf) => {
      currentBuffer = buf;
      decodeAndShow();
      document.getElementById('editor-title').textContent = path.split('/').pop();
      dirty = false;
      editor.focus();
    }).catch((err) => {
      Explorer.toast(t('读取失败: {msg}', { msg: err.message }), true);
      closeEditor();
    });

    editor.session.on('change', () => { dirty = true; });
  }

  function save() {
    const Explorer = window.Explorer;
    if (!currentPath || !editor) return;
    const content = editor.session.getValue();
    // 非 UTF-8 查看时保存会转为 UTF-8（浏览器无原生 GBK/Big5 编码器）
    if (currentEncoding !== 'utf-8' && !confirm(t('当前查看编码为 {enc}，保存后将转换为 UTF-8。继续？', { enc: currentEncoding }))) return;
    document.getElementById('editor-save').disabled = true;
    const body = new URLSearchParams();
    body.append('mode', 'save');
    body.append('file', encodeURIComponent(currentPath));
    body.append('data', encodeURIComponent(content));
    controlFetch(CONTROL, body).then(() => {
      dirty = false;
      Explorer.toast(t('已保存'));
      try { window.Explorer.apiPost('log', { type: 'op', msg: t('保存') + ': ' + currentPath }).catch(() => {}); } catch (e) {}
      Explorer.refresh();
    }).catch((err) => Explorer.toast(t('保存失败: {msg}', { msg: err.message }), true))
      .finally(() => { document.getElementById('editor-save').disabled = false; });
  }

  function closeEditor() {
    if (dirty && !confirm(t('文件有未保存的修改，确定关闭吗？'))) return;
    document.getElementById('editor-mask').style.display = 'none';
    document.getElementById('editor-box').innerHTML = '';
    if (editor) { try { editor.destroy(); } catch (e) {} editor = null; }
    currentPath = null;
    dirty = false;
  }

  function bind() {
    document.getElementById('editor-save').addEventListener('click', save);
    document.getElementById('editor-close').addEventListener('click', closeEditor);
    // 点击遮罩空白处关闭（带 dirty 确认）；点击编辑器内部不关
    document.getElementById('editor-mask').addEventListener('click', (e) => {
      if (e.target === document.getElementById('editor-mask')) closeEditor();
    });
    const encSel = document.getElementById('editor-encoding');
    if (encSel) {
      encSel.addEventListener('change', () => {
        if (!currentPath || !editor) return;
        if (dirty && !confirm(t('切换编码将丢弃当前修改，继续？'))) { encSel.value = currentEncoding; return; }
        currentEncoding = encSel.value;
        decodeAndShow();
      });
    }
  }

  window.openEditor = openEditor;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
