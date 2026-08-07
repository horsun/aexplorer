/**
 * contextmenu.js — 自定义右键菜单
 */
(function () {
  'use strict';

  const menu = document.getElementById('context-menu');

  function render(items) {
    menu.innerHTML = '';
    items.forEach((item) => {
      if (item.type === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'ex-ctx-sep';
        menu.appendChild(sep);
        return;
      }
      const div = document.createElement('div');
      div.className = 'ex-ctx-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '');
      div.innerHTML = `<span class="ctx-ico">${item.icon || ''}</span><span>${item.label}</span>`;
      if (!item.disabled) {
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          hide();
          item.action();
        });
      }
      menu.appendChild(div);
    });
  }

  function show(x, y, items) {
    render(items);
    menu.classList.add('open');
    window.__ctxJustOpened = Date.now(); // 打开时间戳：同一事件的 document contextmenu 不误关
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let px = x, py = y;
    if (px + rect.width > vw - 8) px = Math.max(8, vw - rect.width - 8);
    if (py + rect.height > vh - 8) py = Math.max(8, vh - rect.height - 8);
    menu.style.left = px + 'px';
    menu.style.top = py + 'px';
  }

  function hide() {
    menu.classList.remove('open');
  }

  window.showContextMenu = show;
  window.hideContextMenu = hide;

  menu.addEventListener('contextmenu', (e) => e.preventDefault());
  // 点击菜单外部关闭（菜单项点击已 stopPropagation）
  document.addEventListener('click', (e) => {
    if (menu.classList.contains('open') && !e.target.closest('#context-menu')) hide();
  });
  document.addEventListener('contextmenu', (e) => {
    // 100ms 窗口内 = 刚打开的同一次事件（不关）；之后的外部右键才关闭
    if (menu.classList.contains('open') && !e.target.closest('#context-menu') && (Date.now() - (window.__ctxJustOpened || 0)) > 100) hide();
  });
})();
