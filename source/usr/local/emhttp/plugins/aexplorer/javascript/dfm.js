/**
 * dfm.js — Unraid 7 内置文件管理器操作协议封装
 * 对接 /webGui/include/Control.php（mode:file，JSON 协议）
 * 官方 action 编码（与旧版兼容）：
 *   0  create folder    1  delete folder   2  rename folder
 *   3  copy folder      4  move folder     5  move folder (mv)
 *   6  delete file      7  rename file     8  copy file
 *   9  move file       10  move file (mv) 11  change owner
 *  12  change permission 13  download file 14  calculate occupied space
 *  15  search          99  cancel
 */
(function () {
  'use strict';

  const CONTROL = '/webGui/include/Control.php';

  let running = false;
  let watcher = null;

  /** 从页面 meta 取 CSRF token（与 upload.js 一致；官方 upload 协议要求 X-CSRF-Token） */
  function getCsrf() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  /**
   * 提交文件操作到系统 Control.php
   * @param {number} action 动作编码
   * @param {Object} opts {title, source, target, hdlink, sparse, exist, zfs, task}
   */
  function doAction(action, opts = {}) {
    const body = new URLSearchParams();
    body.append('mode', 'file');
    body.append('action', action);
    body.append('title', opts.title || '');
    body.append('source', opts.source || '');
    body.append('target', opts.target || '');
    body.append('hdlink', opts.hdlink || '');
    body.append('sparse', opts.sparse || '');
    body.append('exist', opts.exist || '');
    body.append('zfs', opts.zfs || '');
    if (opts.task) body.append('task', opts.task);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const token = getCsrf();
    if (token) headers['X-CSRF-Token'] = token;
    return fetch(CONTROL, {
      method: 'POST',
      body: body.toString(),
      headers,
      credentials: 'same-origin',
    });
  }

  /** 取消当前任务 */
  function cancel() {
    return doAction(99);
  }

  /**
   * 启动进度监听
   * 优先 nchan WebSocket（/sub/filemanager），不可用则轮询 /var/tmp/file.manager.status
   */
  function subscribe(onMessage, onError) {
    if (typeof NchanSubscriber !== 'undefined') {
      if (watcher) return watcher;
      try {
        watcher = new NchanSubscriber('/sub/filemanager', { subscriber: 'websocket' });
        watcher.on('message', (msg) => {
          let data = {};
          try { data = JSON.parse(msg); } catch (e) { return; }
          if (data.error) {
            if (onError) onError(data.error);
          } else if (onMessage) {
            onMessage(data);
          }
        });
        return watcher;
      } catch (e) { /* fallthrough to polling */ }
    }
    // 轮询 fallback
    if (watcher) { clearInterval(watcher); watcher = null; }
    watcher = setInterval(() => {
      fetch('/var/tmp/file.manager.status', { credentials: 'same-origin' })
        .then((r) => r.text())
        .then((text) => {
          if (text && text.trim()) {
            onMessage({ status: text, done: text.includes('Completed') ? 1 : 0 });
          }
        }).catch(() => {});
    }, 1500);
    return watcher;
  }

  function stopSubscribe() {
    if (watcher) {
      if (typeof watcher.stop === 'function') { try { watcher.stop(); } catch (e) {} }
      else { clearInterval(watcher); }
      watcher = null;
    }
  }

  /** 解析官方进度文本 */
  function parseProgress(text) {
    if (!text) return { file: null, text: '', completed: null };
    const lines = text.split('\n');
    let file = null;
    let status = lines[0] || '';
    if (lines.length > 1) {
      if (/^\/?(mnt|boot)\//.test(lines[1] || '')) {
        file = lines[1];
        status = lines[0] || '';
      } else {
        const m = (lines[1] || '').match(/(\d+)\s*%/);
        if (m) status = m[0];
      }
    }
    return { file, text: status, raw: text };
  }

  window.DFM = {
    doAction,
    cancel,
    subscribe,
    stopSubscribe,
    parseProgress,
    isRunning: () => running,
    setRunning: (v) => { running = v; },
  };
})();
