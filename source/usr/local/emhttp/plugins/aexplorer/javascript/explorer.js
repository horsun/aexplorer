/**
 * explorer.js — Unraid Explorer 主引擎 v3（官方后端 + Windows UI）
 *
 * 数据源：官方 Browse.php 新增的 list_json / tree_json 模式
 * 操作：官方 FileManager.php 动作协议（见 dfm.js）+ nchan 实时进度
 * 编辑：官方 ACE 编辑器（mode=edit/save）
 */
(function () {
  'use strict';

  const CFG = window.EXPLORER_CONFIG || { root: '/plugins/aexplorer' };
  // 列表/树数据源：插件自己的 Browse.php（官方逻辑 + list_json/tree_json 扩展）
  const BROWSE = CFG.root + '/include/Browse.php';

  // 虚拟滚动参数
  const ROW_H = { list: 33, detail: 33, grid: 100 };
  const GRID_W = 100;
  const BUFFER = 10;

  // 移动端检测：窄屏（≤768px）即移动体验，与 CSS media query 一致（真机/DevTools 模拟同样生效；
  // 长按菜单依赖 touch 事件，桌面窄窗口无 touch 不触发，右键菜单仍可用）
  const IS_MOBILE = () => window.innerWidth <= 768;
  if (IS_MOBILE()) { ROW_H.list = 44; ROW_H.detail = 44; } // 触屏最小可点行高

  // ============ 国际化 ============
  // 中文文案即 key（zh 字典省略，fallback 原文）；AE_LOCALE 由 AExplorer.page 注入（unraid 会话语言）
  const I18N = {
    en: {
      // 导航
      '后退 (Alt+←)': 'Back (Alt+←)', '前进 (Alt+→)': 'Forward (Alt+→)', '上级目录 (Backspace)': 'Up (Backspace)', '目录': 'Folders', '全屏': 'Fullscreen', '退出全屏': 'Exit fullscreen', '切换排序': 'Change sort',
      '输入路径回车直达': 'Type a path, press Enter', '搜索… (Ctrl+F)': 'Search… (Ctrl+F)', '列表 (Ctrl+1)': 'List (Ctrl+1)', '大图标 (Ctrl+2)': 'Grid (Ctrl+2)', '详细 (Ctrl+4)': 'Details (Ctrl+4)',
      // 工具栏
      '新建': 'New', '上传': 'Upload', '下载': 'Download', '复制': 'Copy', '移动': 'Move', '重命名': 'Rename', '属主': 'Owner', '权限': 'Permissions', '属性': 'Properties', '删除': 'Delete', '搜索': 'Search', '刷新': 'Refresh', '更多操作': 'More',
      // 侧边栏
      '星标': 'Starred', '快捷': 'Quick', '存储': 'Storage',
      // 工具栏（data-i18n key 含 emoji）
      '📁 新建': '📁 New', '⬆ 上传': '⬆ Upload', '⬇ 下载': '⬇ Download', '⧉ 复制': '⧉ Copy', '➡ 移动': '➡ Move', '✏ 重命名': '✏ Rename',
      '👤 属主': '👤 Owner', '🔒 权限': '🔒 Permissions', 'ℹ️ 属性': 'ℹ️ Properties', '🗑 删除': '🗑 Delete', '🔍 搜索': '🔍 Search', '⟳ 刷新': '⟳ Refresh',
      // 侧边栏（emoji key）
      '⭐ 星标': '⭐ Starred', '⚡ 快捷': '⚡ Quick', '💾 存储': '💾 Storage',
      // 编辑器（emoji key）
      '💾 保存': '💾 Save', '✕ 关闭': '✕ Close',
      // 列表列头
      '名称': 'Name', '大小': 'Size', '修改时间': 'Modified', '位置': 'Location',
      // 状态栏 / 空状态
      '加载中…': 'Loading…', '已选 {n} 项 ({s})': '{n} selected ({s})', '可用': 'free', '共 {n} 项': '{n} items',
      '加载失败': 'Load failed', '共 {s}': 'Total {s}', '此文件夹为空': 'This folder is empty',
      '{n} 个项目': '{n} items', '{n} 个结果': '{n} results', '可用 {a} / {b} ({p}% 可用)': 'Free {a} / {b} ({p}% free)',
      // 未知类型弹窗
      '未知类型': 'Unknown type', '无法预览': 'Cannot preview', '无法直接打开预览': 'cannot be previewed directly', '可下载后使用本地应用查看': 'Download to view with a local app', '未找到可预览的图片。': 'No previewable images found.',
 // 弹窗表单
 '当前': 'Current', '新名称': 'New name', '复制 {n} 项': 'Copy {n} items', '移动 {n} 项': 'Move {n} items', '目标路径': 'Target path', '覆盖已有': 'Overwrite existing', '稀疏模式': 'Sparse mode',
 '⚠️ 确认删除': '⚠️ Confirm delete', '即将删除 {n} 项，此操作不可恢复！': 'About to delete {n} items. This cannot be undone!',
 '更改属主': 'Change owner', '新属主': 'New owner', '更改权限': 'Change permissions', '属组': 'Group', '其他': 'Other', '未找到匹配项': 'No matches found',
 // 扩展查看器（0.8.5）
 '编辑': 'Edit', '该视频编码浏览器不支持，请下载后用本地播放器播放': 'This video codec is not supported by the browser. Download and play with a local player', '仅显示前 500 行': 'Showing first 500 rows', '仅显示前 2000 条': 'Showing first 2000 entries', '无内容': 'Empty', '无表': 'No tables', '共 {n} 行': '{n} rows', '表': 'Table', '工作表': 'Sheet',
      // 星标
      '已在星标中': 'Already starred', '已添加星标': 'Starred', '未在星标中': 'Not starred',
      // 操作弹窗
      '更改属主…': 'Change owner…', '更改权限…': 'Change permissions…', '删除…': 'Delete…', '创建': 'Create',
      '任务提交中…': 'Submitting…', '操作完成': 'Operation complete', '处理中…': 'Processing…', '操作失败: {err}': 'Operation failed: {err}',
      '文件夹名称': 'Folder name', '请输入名称': 'Enter a name', '已创建': 'Created', '创建失败': 'Create failed',
      '已重命名': 'Renamed', '重命名失败': 'Rename failed', '开始复制': 'Start copy', '请输入目标路径': 'Enter target path',
      '开始移动': 'Start move', '确认删除': 'Confirm delete', '应用': 'Apply', '无权限': 'No access', '只读': 'Read only', '读写': 'Read/write',
      '文件夹': 'Folder', '文件': 'File', '路径': 'Path', '类型': 'Type', '属性 — {name}': 'Properties — {name}',
      '正在计算占用空间…': 'Calculating folder size…', '占用空间：{s}': 'Folder size: {s}', '占用空间计算失败': 'Failed to calculate size',
      '解压中…': 'Extracting…', '解压失败: {e}': 'Extract failed: {e}', '解压失败: 网络错误': 'Extract failed: network error', '未知': 'Unknown',
      '官方仅支持单文件下载（目录/多选请用复制或压缩）': 'Only single files can be downloaded (folders/multi-select: use Copy)', '移动任务已提交': 'Move submitted', '移动失败': 'Move failed', '新建文件夹…': 'New folder…',
      // 弹窗通用
      '关闭': 'Close', '取消': 'Cancel', '确定': 'OK', '确认': 'Confirm',
      // 右键菜单
      '打开': 'Open', '打开所在目录': 'Open containing folder', '下载': 'Download', '添加星标': 'Star', '移除星标': 'Unstar', '解压到当前目录': 'Extract here',
      // 操作弹窗
      '删除确认': 'Delete confirmation', '确定删除 {n} 项？': 'Delete {n} item(s)?', '解压确认': 'Extract confirmation', '确定解压 {name} 到当前目录？': 'Extract {name} to current folder?',
      '新建文件夹': 'New folder', '输入新文件夹名称': 'Enter folder name', '重命名 {name}': 'Rename {name}', '输入新名称': 'Enter new name',
      '在此打开终端': 'Open terminal here', '启动终端…': 'Starting terminal…', '终端启动失败': 'Failed to start terminal', '终端': 'Terminal',
      '移动确认': 'Move confirmation', '输入目标路径': 'Enter target path', '复制确认': 'Copy confirmation',
      '无法预览': 'Cannot preview', '文件过大无法预览，请下载后查看': 'File too large to preview, download to view',
      // 属性面板
      '名称:': 'Name:', '路径:': 'Path:', '类型:': 'Type:', '大小:': 'Size:', '修改时间:': 'Modified:', '权限:': 'Permissions:', '属主:': 'Owner:', '位置:': 'Location:', '目录占用': 'Folder size',
      // 媒体
      '上一张': 'Previous', '下一张': 'Next',
      // 上传
      '上传中 {i}/{n}': 'Uploading {i}/{n}', '完成': 'Done',
      '上传 {a}/{b}': 'Upload {a}/{b}', '上传 {name} {pct}% ({n}/{total})': 'Upload {name} {pct}% ({n}/{total})',
      '上传已取消': 'Upload cancelled', '上传失败: {name} ({msg})': 'Upload failed: {name} ({msg})',
      '上传中 {a}/{b}': 'Uploading {a}/{b}', '上传完成 {a}/{b}': 'Upload complete {a}/{b}',
      // 编辑器
      '编辑器': 'Editor', '保存': 'Save', '解码失败: {msg}': 'Decode failed: {msg}', '加载中: {name}': 'Loading: {name}',
      '读取失败: {msg}': 'Read failed: {msg}', '当前查看编码为 {enc}，保存后将转换为 UTF-8。继续？': 'Current encoding is {enc}; it will be converted to UTF-8 on save. Continue?',
      '已保存': 'Saved', '保存失败: {msg}': 'Save failed: {msg}', '文件有未保存的修改，确定关闭吗？': 'Unsaved changes; close anyway?', '切换编码将丢弃当前修改，继续？': 'Switching encoding discards changes. Continue?',
      // 搜索
      '未找到匹配项': 'No matches found',
      // 解压
      '解压完成': 'Extract complete',
      // 日志
      '📋 日志': '📋 Log', '🕒 操作记录': '🕒 Operations', '⟳ 刷新': '⟳ Refresh', '🗑 清空': '🗑 Clear',
      '暂无日志': 'No log entries', '确定清空日志？': 'Clear log?', '查看应用日志': 'View app log', '查看操作记录': 'View operations',
      '目标与源所在目录相同，无法执行该操作': 'Target is in the same directory as the source',
      // 打包下载
      '打包中…': 'Packing…', '打包完成，开始下载': 'Pack complete, downloading', '打包失败: {e}': 'Pack failed: {e}', '打包失败: 网络错误': 'Pack failed: network error',
    },
  };
  const t = (k, vars) => {
    let s = (I18N[window.AE_LOCALE] && I18N[window.AE_LOCALE][k]) || k;
    if (vars) for (const vk in vars) s = s.split('{' + vk + '}').join(vars[vk]);
    return s;
  };
  window.t = t; // 供 upload.js / editor.js / dfm.js 使用

  // 页面静态文案（data-i18n 属性）批量国际化：替换文本节点（保留子元素如排序指示器）
  // data-i18n-title：只翻译 title/tooltip，不动按钮内容（图标按钮用）
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      const s = t(k);
      if (el.tagName === 'INPUT') { el.placeholder = s; return; }
      if (el.hasAttribute('title')) el.title = s;
      const textNodes = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
      if (textNodes.length) textNodes.forEach((n) => { n.nodeValue = s; });
      else el.textContent = s;
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  // ============ 状态 ============
  // 拖放共享状态（bindEvents 与 makeTreeNode 共用）：{ paths, names, fromDir }
  let dragState = null;
  const state = {
    cwd: CFG.dir || '/mnt',
    history: [],
    historyFwd: [],
    items: [],
    sorted: [],
    selected: new Set(),
    view: 'list',
    sortCol: 'name',
    sortDesc: false,
    searchMode: false,
    searchResults: [],
    vscroll: { start: 0, end: 0, raf: 0 },
    treeLoaded: false,
  };

  // ============ DOM 引用 ============
  const $ = (id) => document.getElementById(id);
  const el = {
    breadcrumbs: $('breadcrumbs'),
    addressInput: $('address-input'),
    addressBar: $('address-bar'),
    searchInput: $('search-input'),
    searchClear: $('search-clear'),
    fileList: $('file-list'),
    listHeader: $('list-header'),
    storageTree: $('storage-tree'),
    quickTree: $('quick-tree'),
    starSection: $('star-section'),
    starTree: $('star-tree'),
    statusCount: $('status-count'),
    statusSelected: $('status-selected'),
    statusDisk: $('status-disk'),
    emptyHint: $('empty-hint'),
    progressBar: $('progress-bar'),
    progressFill: $('progress-fill'),
    progressText: $('progress-text'),
    contextMenu: $('context-menu'),
    modalMask: $('modal-mask'),
    modalBox: $('modal-box'),
    editorMask: $('editor-mask'),
  };

  // ============ 图标 ============
  const ICONS = {
    dir: '📁', image: '🖼️', video: '🎬', audio: '🎵',
    archive: '📦', text: '📄', exec: '⚙️', doc: '📋',
    iso: '💿', file: '📄',
  };

  function iconFor(item) {
    if (item.is_dir) return '📁';
    const map = {
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️', heic: '🖼️', avif: '🖼️',
      mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', wmv: '🎬', flv: '🎬', webm: '🎬', ts: '🎬', m2ts: '🎬',
      mp3: '🎵', flac: '🎵', wav: '🎵', aac: '🎵', ogg: '🎵', m4a: '🎵', wma: '🎵', opus: '🎵',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦', bz2: '📦', xz: '📦', tgz: '📦', tbz2: '📦',
      txt: '📄', md: '📄', log: '📄', csv: '📄', conf: '📄', ini: '📄', cfg: '📄',
      sh: '⚙️', bash: '⚙️', py: '⚙️', js: '⚙️', php: '⚙️', pl: '⚙️',
      pdf: '📋', doc: '📋', docx: '📋', xls: '📋', xlsx: '📋', ppt: '📋', pptx: '📋',
      iso: '💿', img: '💿',
    };
    return map[item.type] || '📄';
  }

  // ============ 工具 ============
  /** 从页面 meta 取 CSRF token（unraid webGui 强制校验 /plugins/ 下 PHP 请求） */
  function getCsrf() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function apiPost(mode, params) {
    const body = new URLSearchParams();
    body.append('mode', mode);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) body.append(k, v);
    }
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const token = getCsrf();
    if (token) headers['X-CSRF-Token'] = token;
    return fetch(BROWSE, {
      method: 'POST',
      body: body.toString(),
      headers,
      credentials: 'same-origin',
    }).then((r) => r.json());
  }

  function fmtSize(n) {
    if (n === undefined || n === null || n === 0) return '—';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }

  // 大数字缩写（项数/结果数）：统一国际单位 K/M（不用中文"万/亿"）
  function fmtCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toast(msg, isError) {
    const div = document.createElement('div');
    div.className = 'ex-toast' + (isError ? ' error' : '');
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); }, 2800);
  }

  // ============ 导航 ============
  function navigate(path, opts = {}) {
    if (!opts.silent && state.cwd !== path) {
      state.history.push(state.cwd);
      state.historyFwd = [];
    }
    state.cwd = path;
    state.selected.clear();
    state.searchMode = false;
    el.searchInput.value = '';
    el.searchClear.style.display = 'none';
    updateNavButtons();
    renderBreadcrumbs();
    loadList();
    highlightTree(path);
  }

  function goUp() {
    const parent = state.cwd.replace(/\/+$/, '');
    const idx = parent.lastIndexOf('/');
    if (idx > 0) navigate(parent.slice(0, idx + 1));
  }

  function goBack() {
    if (!state.history.length) return;
    state.historyFwd.push(state.cwd);
    state.cwd = state.history.pop();
    state.selected.clear();
    updateNavButtons(); renderBreadcrumbs(); loadList(); highlightTree(state.cwd);
  }

  function goForward() {
    if (!state.historyFwd.length) return;
    state.history.push(state.cwd);
    state.cwd = state.historyFwd.pop();
    state.selected.clear();
    updateNavButtons(); renderBreadcrumbs(); loadList(); highlightTree(state.cwd);
  }

  function updateNavButtons() {
    $('btn-back').disabled = state.history.length === 0;
    $('btn-forward').disabled = state.historyFwd.length === 0;
    $('btn-up').disabled = state.cwd.replace(/\/+$/, '').lastIndexOf('/') <= 0;
  }

  // ============ 面包屑 ============
  function renderBreadcrumbs() {
    el.breadcrumbs.innerHTML = '';
    const parts = state.cwd.split('/').filter(Boolean);
    let acc = '/';
    const rootCrumb = document.createElement('a');
    rootCrumb.className = 'ex-crumb-item' + (parts.length === 0 ? ' current' : '');
    rootCrumb.textContent = '/';
    rootCrumb.href = '#';
    rootCrumb.dataset.path = '/';
    rootCrumb.onclick = (e) => { e.preventDefault(); navigate('/'); };
    el.breadcrumbs.appendChild(rootCrumb);

    parts.forEach((p, i) => {
      acc += p + '/';
      const crumbPath = acc; // 每级独立绑定（修复闭包捕获：此前所有 crumb 都导航到完整路径）
      const sep = document.createElement('span');
      sep.className = 'ex-crumb-sep';
      sep.textContent = '›';
      const crumb = document.createElement('a');
      crumb.className = 'ex-crumb-item' + (i === parts.length - 1 ? ' current' : '');
      crumb.textContent = p;
      crumb.href = '#';
      crumb.dataset.path = crumbPath;
      crumb.onclick = (e) => { e.preventDefault(); navigate(crumbPath); };
      el.breadcrumbs.appendChild(sep);
      el.breadcrumbs.appendChild(crumb);
    });
  }

  function enterAddressMode() {
    el.addressInput.style.display = 'block';
    el.breadcrumbs.style.display = 'none';
    el.addressInput.value = state.cwd;
    el.addressInput.focus();
    el.addressInput.select();
  }
  function exitAddressMode() {
    el.addressInput.style.display = 'none';
    el.breadcrumbs.style.display = 'flex';
  }

  // ============ 列表加载（官方 list_json） ============
  function loadList() {
    el.fileList.innerHTML = '';
    el.emptyHint.textContent = t('加载中…');
    el.emptyHint.style.display = 'block';
    el.fileList.appendChild(el.emptyHint);

    apiPost('list_json', { dir: state.cwd }).then((data) => {
      if (!data.ok) throw new Error(data.error || t('加载失败'));
      state.items = data.items || [];
      updateDiskStatus(data.disk, data.total_size);
      renderList();
      updateToolbar();
    }).catch((err) => {
      el.fileList.innerHTML = '';
      el.emptyHint.textContent = '❌ ' + err.message;
      el.fileList.appendChild(el.emptyHint);
      el.emptyHint.style.display = 'block';
    });
  }

  function updateDiskStatus(disk, totalSize) {
    let text = totalSize ? t('共 {s}', { s: fmtSize(totalSize) }) : '';
    if (disk && disk.total) {
      // 百分比 = 可用占比（用户要求"x% 可用"直观显示）
      const freePct = Math.round((disk.free / disk.total) * 100);
      text += (text ? ' · ' : '') + t('可用 {a} / {b} ({p}% 可用)', { a: fmtSize(disk.free), b: fmtSize(disk.total), p: freePct });
    }
    el.statusDisk.textContent = text || '—';
  }

  // ============ 排序 ============
  const SORT_KEYS = { name: '名称', owner: '属主', perm: '权限', size: '大小', mtime: '修改时间' };
  function sortItems(items) {
    const col = state.sortCol;
    const dir = state.sortDesc ? -1 : 1;
    return items.slice().sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let r = 0;
      switch (col) {
        case 'name': r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); break;
        case 'size': r = (a.size || 0) - (b.size || 0); break;
        case 'owner': r = (a.owner || '').localeCompare(b.owner || ''); break;
        case 'perm': r = (a.perm || '').localeCompare(b.perm || ''); break;
        case 'mtime': r = (a.mtime || 0) - (b.mtime || 0); break;
        default: r = 0;
      }
      return r * dir;
    });
  }

  // 统一切换排序（列头点击 / 移动端排序按钮共用），同步列头箭头 + 按钮文字 + 移动端列可见性
  function updateSortIndicator() {
    const label = t(SORT_KEYS[state.sortCol] || state.sortCol);
    document.querySelectorAll('.ex-list-header span').forEach((c) => {
      const ind = c.querySelector('.sort-ind');
      if (ind) {
        const cKey = c.textContent.replace(/[↑↓]/g, '').trim();
        ind.textContent = (cKey === label) ? (state.sortDesc ? ' ↓' : ' ↑') : '';
      }
    });
    const sb = $('tool-sort');
    if (sb) sb.textContent = label + (state.sortDesc ? ' ↓' : ' ↑');
    // 移动端：列表列随排序联动（data-sort → CSS 显示对应列）
    document.getElementById('explorer-app').dataset.sort = state.sortCol;
  }
  function setSort(key, desc) {
    state.sortCol = key;
    state.sortDesc = desc;
    updateSortIndicator();
    renderList();
  }

  // ============ 虚拟滚动渲染 ============
  function renderList() {
    el.fileList.innerHTML = '';
    el.emptyHint.style.display = 'none';
    state.sorted = sortItems(state.items);
    el.fileList.className = 'ex-list ' + state.view;

    if (!state.sorted.length) {
      el.emptyHint.textContent = t('此文件夹为空');
      el.fileList.appendChild(el.emptyHint);
      el.emptyHint.style.display = 'block';
      el.statusCount.textContent = t('{n} 个项目', { n: 0 });
      return;
    }

    el.statusCount.textContent = t('{n} 个项目', { n: fmtCount(state.sorted.length) });

    const rowH = ROW_H[state.view] || ROW_H.list;
    const vlist = document.createElement('div');
    vlist.className = 'ex-vlist';
    if (state.view === 'grid') {
      const cols = Math.max(1, Math.floor(el.fileList.clientWidth / GRID_W));
      vlist.dataset.cols = cols;
      vlist.style.height = (Math.ceil(state.sorted.length / cols) * rowH) + 'px';
    } else {
      vlist.style.height = (state.sorted.length * rowH) + 'px';
    }
    el.fileList.appendChild(vlist);

    el.fileList.onscroll = () => {
      if (state.vscroll.raf) cancelAnimationFrame(state.vscroll.raf);
      state.vscroll.raf = requestAnimationFrame(renderWindow);
    };
    renderWindow();
  }

  function renderWindow() {
    const vlist = el.fileList.querySelector('.ex-vlist');
    if (!vlist) return;
    const rowH = ROW_H[state.view] || ROW_H.list;
    const scrollTop = el.fileList.scrollTop || 0;
    const viewH = el.fileList.clientHeight || 400;

    let start, end;
    if (state.view === 'grid') {
      const cols = parseInt(vlist.dataset.cols || '1', 10) || 1;
      const rows = Math.ceil(state.sorted.length / cols);
      start = Math.max(0, Math.floor(scrollTop / rowH) - BUFFER);
      end = Math.min(rows, Math.ceil((scrollTop + viewH) / rowH) + BUFFER);
      renderGridWindow(vlist, start, end, cols, rowH);
    } else {
      start = Math.max(0, Math.floor(scrollTop / rowH) - BUFFER);
      end = Math.min(state.sorted.length, Math.ceil((scrollTop + viewH) / rowH) + BUFFER);
      renderListWindow(vlist, start, end, rowH);
    }
  }

  function renderListWindow(vlist, start, end, rowH) {
    vlist.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const item = state.sorted[i];
      const row = document.createElement('div');
      row.className = 'ex-row' + (state.selected.has(item.name) ? ' selected' : '');
      row.dataset.name = item.name;
      row.dataset.path = item.path;
      row.dataset.dir = item.is_dir ? '1' : '0';
      row.dataset.idx = i;
      row.draggable = !IS_MOBILE();
      row.style.position = 'absolute';
      row.style.top = (i * rowH) + 'px';
      row.style.left = '0';
      row.style.right = '0';
      row.style.height = rowH + 'px';

      row.innerHTML = `
        <span class="col-name">
          <span class="ex-row-icon">${iconFor(item)}</span>
          <span class="ex-row-name" title="${esc(item.name)}">${esc(item.name)}</span>
          ${item._src ? `<span class="ex-search-src">↳ ${esc(item._src)}</span>` : ''}
        </span>
        <span class="col-owner">${esc(item.owner || '')}</span>
        <span class="col-perm">${esc(item.perm || '')}</span>
        <span class="col-size">${item.is_dir ? '—' : esc(fmtSize(item.size))}</span>
        <span class="col-mtime">${esc(item.mtime_human || '')}</span>
        <span class="col-loc" title="${esc(item.loc || '')}">${esc(item.loc || '')}</span>`;
      frag.appendChild(row);
    }
    vlist.appendChild(frag);
  }

  function renderGridWindow(vlist, start, end, cols, rowH) {
    vlist.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let rowIdx = start; rowIdx < end; rowIdx++) {
      for (let c = 0; c < cols; c++) {
        const i = rowIdx * cols + c;
        if (i >= state.sorted.length) break;
        const item = state.sorted[i];
        const row = document.createElement('div');
        row.className = 'ex-row ex-grid' + (state.selected.has(item.name) ? ' selected' : '');
        row.dataset.name = item.name;
        row.dataset.path = item.path;
        row.dataset.dir = item.is_dir ? '1' : '0';
        row.dataset.idx = i;
        row.draggable = !IS_MOBILE();
        row.style.position = 'absolute';
        row.style.top = (rowIdx * rowH) + 'px';
        row.style.left = (c * GRID_W) + 'px';
        row.style.width = (GRID_W - 4) + 'px';
        row.style.height = (rowH - 4) + 'px';
        row.style.display = 'inline-flex';
        row.innerHTML = `
          <span class="ex-row-icon">${iconFor(item)}</span>
          <span class="ex-row-name" title="${esc(item.name)}">${esc(item.name)}</span>`;
        frag.appendChild(row);
      }
    }
    vlist.appendChild(frag);
  }

  // ============ 事件委托 ============
  function bindListEvents() {
    el.fileList.addEventListener('click', (e) => {
      const row = e.target.closest('.ex-row');
      if (!row) return;
      if (IS_MOBILE()) {
        // 触屏：单击直接打开（目录进入 / 文件预览）；多选/操作走长按菜单
        e.preventDefault();
        const item = state.sorted[parseInt(row.dataset.idx, 10)];
        if (item) openItem(item);
        return;
      }
      handleRowClick(row, e);
    });
    el.fileList.addEventListener('dblclick', (e) => {
      if (IS_MOBILE()) return; // 触屏无双击
      const row = e.target.closest('.ex-row');
      if (!row) return;
      e.preventDefault();
      const item = state.sorted[parseInt(row.dataset.idx, 10)];
      if (item) openItem(item);
    });
    // 触屏长按 1500ms → 选中 + 右键菜单（iOS Safari 长按不触发 contextmenu，必须自实现）
    if (IS_MOBILE()) {
      let lpTimer = null, lpFired = false;
      el.fileList.addEventListener('touchstart', (e) => {
        const row = e.target.closest('.ex-row');
        if (!row) return;
        lpFired = false;
        lpTimer = setTimeout(() => {
          lpFired = true;
          state.selected.clear();
          state.selected.add(row.dataset.name);
          refreshSelection();
          const t = e.touches[0];
          window.showContextMenu(t.clientX, t.clientY, getContextItems());
        }, 1500);
      }, { passive: true });
      const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
      el.fileList.addEventListener('touchend', cancelLp);
      el.fileList.addEventListener('touchmove', cancelLp);
      // 长按触发后拦截 Android 原生 contextmenu 避免重复菜单
      document.addEventListener('contextmenu', (e) => {
        if (lpFired) { e.preventDefault(); lpFired = false; }
      });
    }
    el.fileList.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.ex-row');
      if (!row) return;
      e.preventDefault();
      const item = state.sorted[parseInt(row.dataset.idx, 10)];
      if (item && !state.selected.has(item.name)) {
        state.selected.clear();
        state.selected.add(item.name);
        refreshSelection();
      }
      window.showContextMenu(e.clientX, e.clientY, getContextItems());
    });
    // ============ 鼠标框选（空白区拖拽） ============
    let marqueeState = null;

    el.fileList.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (IS_MOBILE()) return; // 触屏无鼠标框选
      if (e.target.closest('.ex-row')) return; // 行上：正常选择，不框选
      const rect = el.fileList.getBoundingClientRect();
      if (e.clientX > rect.right - 16) return; // 垂直滚动条区域不触发
      e.preventDefault();
      const shift = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!shift) {
        state.selected.clear();
        refreshSelection();
      }
      marqueeState = { startX: e.clientX, startY: e.clientY, shift, rect, el: null };
      document.addEventListener('mousemove', onMarqueeMove);
      document.addEventListener('mouseup', onMarqueeUp);
    });

    function onMarqueeMove(ev) {
      const m = marqueeState;
      if (!m) return;
      const x = Math.min(m.startX, ev.clientX), y = Math.min(m.startY, ev.clientY);
      const w = Math.abs(ev.clientX - m.startX), h = Math.abs(ev.clientY - m.startY);
      if (!m.el) {
        m.el = document.createElement('div');
        m.el.className = 'ex-marquee';
        document.body.appendChild(m.el);
      }
      Object.assign(m.el.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      // 边缘自动滚动
      const edge = 24;
      if (ev.clientY < m.rect.top + edge) el.fileList.scrollTop -= 24;
      else if (ev.clientY > m.rect.bottom - edge) el.fileList.scrollTop += 24;
      // 实时高亮可视区行
      const rowH = ROW_H[state.view] || ROW_H.list;
      const vlist = el.fileList.querySelector('.ex-vlist');
      const cols = state.view === 'grid' ? (parseInt((vlist && vlist.dataset.cols) || '1', 10) || 1) : 1;
      const top = Math.min(m.startY, ev.clientY), bottom = Math.max(m.startY, ev.clientY);
      const left = Math.min(m.startX, ev.clientX), right = Math.max(m.startX, ev.clientX);
      el.fileList.querySelectorAll('.ex-row').forEach((row) => {
        const i = parseInt(row.dataset.idx, 10);
        if (isNaN(i)) return;
        const r = Math.floor(i / cols), c = i % cols;
        const rowTop = m.rect.top + r * rowH - el.fileList.scrollTop;
        const rowLeft = m.rect.left + c * GRID_W - el.fileList.scrollLeft;
        const hit = bottom >= rowTop && top <= rowTop + rowH && right >= rowLeft && left <= rowLeft + GRID_W;
        row.classList.toggle('ex-marquee-hit', hit);
      });
    }

    function onMarqueeUp(ev) {
      const m = marqueeState;
      if (!m) return;
      document.removeEventListener('mousemove', onMarqueeMove);
      document.removeEventListener('mouseup', onMarqueeUp);
      if (m.el) m.el.remove();
      marqueeState = null;
      el.fileList.querySelectorAll('.ex-row').forEach((row) => row.classList.remove('ex-marquee-hit'));
      if (Math.abs(ev.clientX - m.startX) < 4 && Math.abs(ev.clientY - m.startY) < 4) return; // 点击级拖动
      const rowH = ROW_H[state.view] || ROW_H.list;
      const vlist = el.fileList.querySelector('.ex-vlist');
      const cols = state.view === 'grid' ? (parseInt((vlist && vlist.dataset.cols) || '1', 10) || 1) : 1;
      const rows = Math.ceil(state.sorted.length / cols);
      const cxTop = Math.min(m.startY, ev.clientY) - m.rect.top + el.fileList.scrollTop;
      const cxBottom = Math.max(m.startY, ev.clientY) - m.rect.top + el.fileList.scrollTop;
      const cxLeft = Math.min(m.startX, ev.clientX) - m.rect.left + el.fileList.scrollLeft;
      const cxRight = Math.max(m.startX, ev.clientX) - m.rect.left + el.fileList.scrollLeft;
      const rStart = Math.max(0, Math.floor(cxTop / rowH));
      const rEnd = Math.min(rows - 1, Math.floor(cxBottom / rowH));
      const hit = [];
      if (state.view === 'grid') {
        const cStart = Math.max(0, Math.floor(cxLeft / GRID_W));
        const cEnd = Math.min(cols - 1, Math.floor(cxRight / GRID_W));
        for (let r = rStart; r <= rEnd; r++) {
          for (let c = cStart; c <= cEnd; c++) {
            const i = r * cols + c;
            if (i < state.sorted.length) hit.push(state.sorted[i].name);
          }
        }
      } else {
        for (let i = rStart; i <= Math.min(state.sorted.length - 1, rEnd); i++) hit.push(state.sorted[i].name);
      }
      if (m.shift) hit.forEach((n) => state.selected.add(n));
      else { state.selected.clear(); hit.forEach((n) => state.selected.add(n)); }
      refreshSelection();
    }
    // ============ 拖放（内部移动/复制：行 → 目录行/面包屑/地址栏/空白区） ============
    el.fileList.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.ex-row');
      if (!row) return;
      const item = state.sorted[parseInt(row.dataset.idx, 10)];
      if (!item) return;
      // 拖拽行在选中集合内 → 拖整个集合；否则只拖该行
      const items = state.selected.has(item.name) ? selectedItems() : [item];
      dragState = { paths: items.map(i => i.path), names: items.map(i => i.name), fromDir: state.cwd };
      e.dataTransfer.setData('text/plain', dragState.paths.join('\n')); // 展示用（drop 实际消费 dragState 闭包）；'\n' 为 JS 换行转义
      e.dataTransfer.effectAllowed = 'copyMove';
      row.classList.add('dragging');
    });
    el.fileList.addEventListener('dragend', () => { clearDropTargets(); dragState = null; });

    function dropTargetFor(e) {
      const row = e.target.closest ? e.target.closest('.ex-row') : null;
      if (row && row.dataset.dir === '1') return { el: row, path: row.dataset.path };
      const crumb = e.target.closest ? e.target.closest('.ex-crumb-item') : null;
      if (crumb && crumb.dataset.path) return { el: crumb, path: crumb.dataset.path };
      const bar = e.target.closest ? e.target.closest('.ex-address') : null;
      if (bar) return { el: bar, path: (el.addressInput.style.display === 'block' && el.addressInput.value) || state.cwd };
      if (e.target === el.fileList || (e.target.closest && e.target.closest('.ex-list'))) return { el: el.fileList, path: state.cwd };
      return null;
    }
    function clearDropTargets() {
      el.fileList.querySelectorAll('.ex-drop-target').forEach((n) => n.classList.remove('ex-drop-target'));
      el.breadcrumbs.querySelectorAll('.ex-drop-target').forEach((n) => n.classList.remove('ex-drop-target'));
      const bar = document.querySelector('.ex-address');
      if (bar) bar.classList.remove('ex-drop-target');
    }
    ['dragenter', 'dragover'].forEach((type) => {
      el.fileList.addEventListener(type, (e) => { e.preventDefault(); if (type === 'dragenter') return; });
      el.breadcrumbs.addEventListener(type, (e) => { e.preventDefault(); });
      const bar = document.querySelector('.ex-address');
      if (bar) bar.addEventListener(type, (e) => { e.preventDefault(); });
    });
    // 高亮 + 放置处理统一挂到三个容器（列表 / 面包屑 / 地址栏）
    function wireDropTargets(container) {
      container.addEventListener('dragover', (e) => { const t = dropTargetFor(e); clearDropTargets(); if (t && t.el) t.el.classList.add('ex-drop-target'); });
      container.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.ex-drop-target')) clearDropTargets(); });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragState || !dragState.paths.length) return;
        const t = dropTargetFor(e);
        clearDropTargets();
        if (t) showDropChoice(t.path, dragState);
      });
    }
    wireDropTargets(el.fileList);
    wireDropTargets(el.breadcrumbs);
    const addrBar = document.querySelector('.ex-address');
    if (addrBar) wireDropTargets(addrBar);
    window.addEventListener('resize', () => {
      if (state.view === 'grid' && state.sorted.length) {
        const vlist = el.fileList.querySelector('.ex-vlist');
        if (vlist) {
          const cols = Math.max(1, Math.floor(el.fileList.clientWidth / GRID_W));
          vlist.dataset.cols = cols;
          vlist.style.height = (Math.ceil(state.sorted.length / cols) * ROW_H.grid) + 'px';
          renderWindow();
        }
      }
    });
  }

  function handleRowClick(row, e) {
    const name = row.dataset.name;
    if (e.ctrlKey || e.metaKey) {
      state.selected.has(name) ? state.selected.delete(name) : state.selected.add(name);
    } else if (e.shiftKey && state.selected.size) {
      const names = state.sorted.map((i) => i.name);
      const idx = names.indexOf(name);
      const first = names.findIndex((n) => state.selected.has(n));
      if (idx >= 0 && first >= 0) {
        state.selected.clear();
        const [lo, hi] = [Math.min(idx, first), Math.max(idx, first)];
        for (let i = lo; i <= hi; i++) state.selected.add(names[i]);
      }
    } else {
      state.selected.clear();
      state.selected.add(name);
    }
    refreshSelection();
  }

  function refreshSelection() {
    document.querySelectorAll('.ex-row').forEach((row) => {
      row.classList.toggle('selected', state.selected.has(row.dataset.name));
    });
    updateToolbar();
    updateStatusSelected();
  }

  function updateStatusSelected() {
    if (!state.selected.size) { el.statusSelected.textContent = ''; return; }
    const selItems = state.items.filter((i) => state.selected.has(i.name));
    const size = selItems.reduce((s, i) => s + (i.size || 0), 0);
    el.statusSelected.textContent = t('已选 {n} 项 ({s})', { n: selItems.length, s: fmtSize(size) });
  }

  function selectedItems() {
    // 搜索模式下结果来自子目录下钻/后端搜索，不在 state.items 里，需从 state.sorted 取
    const pool = state.searchMode ? state.sorted : state.items;
    return pool.filter((i) => state.selected.has(i.name));
  }

  // ============ 打开 ============
  const IMG_EXT = ['jpg','jpeg','png','gif','webp','svg','bmp','ico'];
  const VID_EXT = ['mp4','webm','m4v','ogv','mov'];
  const AUD_EXT = ['mp3','flac','wav','m4a','ogg','aac','opus'];
  const MD_EXT = ['md','markdown'];
  const CSV_EXT = ['csv','tsv'];
  const PDF_EXT = ['pdf'];
  const XLSX_EXT = ['xlsx','xls'];
  const ARC_EXT = ['zip','tar','gz','tgz','bz2','xz','txz'];
  const DB_EXT = ['db','db3','sqlite','sqlite3'];
  const CODE_EXT = ['js','ts','py','sh','bash','php','html','htm','css','json','yaml','yml','xml','sql','java','c','cpp','h','go','rs','rb','pl','lua','dockerfile'];
  const TXT_EXT = ['txt','md','log','csv','conf','ini','cfg','sh','bash','py','js','ts','php','html','htm','css','json','yaml','yml','xml','sql','page','plg','old','bak','env','markdown'];

  function openItem(item) {
    if (item.is_dir) {
      navigate(item.path);
      return;
    }
    const ext = (item.type || '').toLowerCase();
    if (IMG_EXT.includes(ext)) return openImage(item);
    if (VID_EXT.includes(ext)) return openVideo(item);
    if (AUD_EXT.includes(ext)) return openAudio(item);
    if (PDF_EXT.includes(ext)) return openPdf(item);
    if (MD_EXT.includes(ext)) return openMarkdown(item);
    if (CSV_EXT.includes(ext)) return openCsv(item);
    if (XLSX_EXT.includes(ext)) return openSpreadsheet(item);
    if (ARC_EXT.includes(ext)) return openArchive(item);
    if (DB_EXT.includes(ext)) return openSqlite(item);
    if (TXT_EXT.includes(ext)) return window.openEditor(item.path);
    // 未知类型：不直接下载，提示可下载
    openModal(`
      <h3>${t('无法预览')}</h3>
      <p class="ex-media-hint">「${esc(item.name)}」(${esc(ext || t('未知类型'))}) ${t('无法直接打开预览')}<br>${t('可下载后使用本地应用查看')}。</p>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('下载')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-cancel').onclick = () => closeModal();
      box.querySelector('#dfm-ok').onclick = () => {
        closeModal();
        const a = document.createElement('a');
        a.href = item.path;
        a.download = item.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    });
  }

  // ============ 扩展查看器（0.8.5） ============
  // vendor 懒加载：首次需要时注入 <script>，之后复用
  const _vendorCache = {};
  function loadVendor(name, src) {
    if (_vendorCache[name]) return _vendorCache[name];
    _vendorCache[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/plugins/aexplorer/vendor/' + src;
      s.onload = () => resolve();
      s.onerror = () => { delete _vendorCache[name]; reject(new Error('vendor load failed: ' + src)); };
      document.head.appendChild(s);
    });
    return _vendorCache[name];
  }
  function textModal(title, bodyHtml, opts = {}) {
    openModal(`
      <h3>${title}${opts.edit ? `<button class="ex-btn" id="vw-edit" style="float:right;min-height:28px;">✏ ${t('编辑')}</button>` : ''}</h3>
      <div class="ex-viewer">${bodyHtml}</div>
      <div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>
    `, (box) => {
      box.querySelector('#dfm-close').onclick = () => closeModal();
      if (opts.edit) box.querySelector('#vw-edit').onclick = () => { closeModal(); window.openEditor(opts.edit); };
      if (opts.after) opts.after(box);
    }, true);
  }

  function openTextViewer(item) {
    Explorer.showProgress(0, t('加载中…'));
    apiPost('file_read', { file: item.path }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('加载失败'), true); return; }
      const isCode = CODE_EXT.includes((item.type || '').toLowerCase());
      if (isCode) {
        loadVendor('prism', 'prism.min.js')
          .then(() => Promise.all([
            loadVendor('prism-javascript', 'prism-javascript.min.js'),
            loadVendor('prism-json', 'prism-json.min.js'),
            loadVendor('prism-bash', 'prism-bash.min.js'),
            loadVendor('prism-python', 'prism-python.min.js'),
            loadVendor('prism-yaml', 'prism-yaml.min.js'),
            loadVendor('prism-markup', 'prism-markup.min.js'),
            loadVendor('prism-sql', 'prism-sql.min.js'),
          ]))
          .then(() => {
            const lang = ({ js:'javascript', ts:'javascript', py:'python', sh:'bash', bash:'bash', html:'markup', htm:'markup', css:'css', json:'json', yaml:'yaml', yml:'yaml', xml:'markup', sql:'sql' })[(item.type || '').toLowerCase()] || 'javascript';
            const html = Prism.highlight(d.text, Prism.languages[lang] || Prism.languages.javascript, lang);
            textModal(esc(item.name), `<pre class="ex-code"><code class="language-${lang}">${html}</code></pre>`, { edit: item.path });
          })
          .catch(() => textModal(esc(item.name), `<pre class="ex-pre">${esc(d.text)}</pre>`, { edit: item.path }));
      } else {
        textModal(esc(item.name), `<pre class="ex-pre">${esc(d.text)}</pre>`, { edit: item.path });
      }
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openMarkdown(item) {
    Explorer.showProgress(0, t('加载中…'));
    apiPost('file_read', { file: item.path }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('加载失败'), true); return; }
      Promise.all([loadVendor('marked', 'marked.min.js'), loadVendor('dompurify', 'purify.min.js')])
        .then(() => {
          const html = DOMPurify.sanitize(marked.parse(d.text));
          textModal(esc(item.name), `<div class="ex-md">${html}</div>`, { edit: item.path });
        })
        .catch(() => textModal(esc(item.name), `<pre class="ex-pre">${esc(d.text)}</pre>`, { edit: item.path }));
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openCsv(item) {
    Explorer.showProgress(0, t('加载中…'));
    apiPost('file_read', { file: item.path }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('加载失败'), true); return; }
      const sep = (item.type || '').toLowerCase() === 'tsv' ? '\t' : ',';
      const lines = d.text.split(/\r?\n/).filter(Boolean).slice(0, 500);
      const rows = lines.map((l) => { const cells = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === sep) { cells.push(cur); cur = ''; } else cur += c; } cells.push(cur); return cells; });
      const html = '<div class="ex-table-wrap"><table class="ex-table">' + rows.map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</table></div>' + (d.text.split(/\r?\n/).length > 500 ? `<p class="ex-dim">${t('仅显示前 500 行')}</p>` : '');
      textModal(esc(item.name), html, { edit: item.path });
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openPdf(item) {
    openModal(`
      <h3>${esc(item.name)} <button class="ex-btn" id="dfm-dl" style="float:right;min-height:28px;">⬇ ${t('下载')}</button></h3>
      <div class="ex-viewer" style="padding:0;"><iframe class="ex-pdf" src="${escAttr(item.path)}"></iframe></div>
      <div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>
    `, (box) => {
      box.querySelector('#dfm-close').onclick = () => closeModal();
      box.querySelector('#dfm-dl').onclick = () => { const a = document.createElement('a'); a.href = item.path; a.download = item.name; document.body.appendChild(a); a.click(); a.remove(); };
    });
  }

  function openSpreadsheet(item) {
    Explorer.showProgress(0, t('加载中…'));
    loadVendor('xlsx', 'xlsx.full.min.js').then(() => fetch(item.path))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        Explorer.hideProgress();
        const wb = XLSX.read(buf, { type: 'array' });
        const renderSheet = (box, name) => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(0, 500);
          const html = '<div class="ex-table-wrap"><table class="ex-table">' + rows.map((r) => '<tr>' + r.map((c) => `<td>${esc(String(c))}</td>`).join('') + '</tr>').join('') + '</table></div>' + (rows.length >= 500 ? `<p class="ex-dim">${t('仅显示前 500 行')}</p>` : '');
          box.querySelector('#xl-body').innerHTML = html;
        };
        const names = wb.SheetNames || [];
        openModal(`
          <h3>${esc(item.name)} <button class="ex-btn" id="dfm-close2" style="float:right;min-height:28px;">${t('关闭')}</button></h3>
          ${names.length > 1 ? `<div class="ex-form-row"><label>${t('工作表')}</label><select id="xl-sheet">${names.map((n) => `<option value="${escAttr(n)}">${esc(n)}</option>`).join('')}</select></div>` : ''}
          <div id="xl-body" class="ex-viewer">${t('加载中…')}</div>
        `, (box) => {
          box.querySelector('#dfm-close2').onclick = () => closeModal();
          renderSheet(box, names[0]);
          const sel = box.querySelector('#xl-sheet');
          if (sel) sel.onchange = (e) => renderSheet(box, e.target.value);
        }, true);
      }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openArchive(item) {
    Explorer.showProgress(0, t('加载中…'));
    apiPost('archive_list', { file: item.path }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('加载失败'), true); return; }
      const html = '<div class="ex-table-wrap"><table class="ex-table">' + (d.entries || []).map((e) => `<tr><td>${esc(e)}</td></tr>`).join('') + '</table></div>' + (d.truncated ? `<p class="ex-dim">${t('仅显示前 2000 条')}</p>` : '');
      textModal(esc(item.name), html || `<p class="ex-dim">${t('无内容')}</p>`);
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openSqlite(item) {
    Explorer.showProgress(0, t('加载中…'));
    apiPost('sqlite', { file: item.path }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('加载失败') + ': ' + (d && d.error || ''), true); return; }
      const opts = (d.tables || []).map((tb) => `<option value="${escAttr(tb)}">${esc(tb)}</option>`).join('');
      let cur = d.table || d.tables[0] || '';
      const render = (box) => {
        if (!cur || !d.tables.length) { box.querySelector('#sql-body').innerHTML = `<p class="ex-dim">${t('无表')}</p>`; return; }
        apiPost('sqlite', { file: item.path, table: cur, page: d.page || 0 }).then((dd) => {
          if (!dd.ok) { box.querySelector('#sql-body').innerHTML = `<p class="ex-dim">${t('加载失败')}</p>`; return; }
          const th = (dd.cols || []).map((c) => `<th>${esc(c)}</th>`).join('');
          const trs = (dd.rows || []).map((r) => '<tr>' + r.map((c) => `<td>${esc(String(c))}</td>`).join('') + '</tr>').join('');
          box.querySelector('#sql-body').innerHTML = `<div class="ex-table-wrap"><table class="ex-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div><p class="ex-dim">${t('共 {n} 行', { n: dd.total })}</p>`;
        });
      };
      openModal(`
        <h3>${esc(item.name)} <button class="ex-btn" id="dfm-close2" style="float:right;min-height:28px;">${t('关闭')}</button></h3>
        <div class="ex-form-row"><label>${t('表')}</label><select id="sql-table">${opts}</select></div>
        <div id="sql-body" class="ex-viewer">${t('加载中…')}</div>
      `, (box) => {
        box.querySelector('#dfm-close2').onclick = () => closeModal();
        box.querySelector('#sql-table').value = cur;
        box.querySelector('#sql-table').onchange = (e) => { cur = e.target.value; d.page = 0; render(box); };
        render(box);
      }, true);
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('加载失败'), true); });
  }

  function openImage(item) {
    // 图片上下文：当前视图（列表/搜索结果）中的全部图片，支持上一张/下一张
    const pool = (state.searchMode ? state.sorted : state.items)
      .filter((i) => !i.is_dir && IMG_EXT.includes((i.type || '').toLowerCase()));
    if (!pool.length) {
      openModal(`
        <h3>${t('无法预览')}</h3>
        <p class="ex-media-hint">${t('未找到可预览的图片。')}</p>
        <div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>
      `, (box) => { box.querySelector('#dfm-close').onclick = () => closeModal(); });
      return;
    }
    let cur = Math.max(0, pool.findIndex((i) => i.path === item.path));
    const render = () => {
      const it = pool[cur];
      openModal(`
        <div class="ex-media"><img src="${escAttr(it.path)}" alt="${esc(it.name)}"></div>
        <div class="ex-img-bar">${cur + 1} / ${pool.length} — ${esc(it.name)}</div>
        <div class="ex-modal-actions">
          <button class="ex-btn" id="img-prev" ${cur === 0 ? 'disabled' : ''}>◀ ${t('上一张')}</button>
          <button class="ex-btn" id="img-next" ${cur === pool.length - 1 ? 'disabled' : ''}>${t('下一张')} ▶</button>
          <button class="ex-btn" id="dfm-close">${t('关闭')}</button>
        </div>
      `, (box) => {
        const prev = box.querySelector('#img-prev');
        const next = box.querySelector('#img-next');
        if (prev) prev.addEventListener('click', () => { cur = Math.max(0, cur - 1); render(); });
        if (next) next.addEventListener('click', () => { cur = Math.min(pool.length - 1, cur + 1); render(); });
        box.querySelector('#dfm-close').onclick = () => closeModal();
      }, true);
    };
    render();
  }

  function openVideo(item) {
    openModal(`
      <div class="ex-media"><video controls autoplay src="${escAttr(item.path)}"></video></div>
      <div id="vid-fallback" class="ex-media-hint" style="display:none;">${t('该视频编码浏览器不支持，请下载后用本地播放器播放')}（${esc(item.name)}）<br><button class="ex-btn" id="vid-dl">⬇ ${t('下载')}</button></div>
      <div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>
    `, (box) => {
      const v = box.querySelector('video');
      v.onerror = () => { box.querySelector('#vid-fallback').style.display = 'block'; v.style.display = 'none'; };
      box.querySelector('#vid-dl').onclick = () => { const a = document.createElement('a'); a.href = item.path; a.download = item.name; document.body.appendChild(a); a.click(); a.remove(); };
      box.querySelector('#dfm-close').onclick = () => closeModal();
    }, true);
  }

  function openAudio(item) {
    openModal(`
      <div class="ex-media"><audio controls autoplay src="${escAttr(item.path)}"></audio></div>
      <div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>
    `, (box) => { box.querySelector('#dfm-close').onclick = () => closeModal(); }, true);
  }

  // ============ 目录树 ============
  function loadTree() {
    if (state.treeLoaded) { highlightTree(state.cwd); return; }
    apiPost('tree_json', { dir: '/mnt' }).then((data) => {
      if (!data.ok) return;
      el.storageTree.innerHTML = '';
      data.dirs.forEach((d) => el.storageTree.appendChild(makeTreeNode(d)));
      // 快捷入口
      el.quickTree.innerHTML = '';
      [['User Shares','/mnt/user'],['Flash','/boot']].forEach(([name, path]) => {
        el.quickTree.appendChild(makeTreeNode({ name, path, has_children: false }, true));
      });
      state.treeLoaded = true;
      renderStarTree();
      highlightTree(state.cwd);
    }).catch(() => {});
  }

  // ============ 星标 ============
  function getStars() {
    try { return JSON.parse(localStorage.getItem('aexplorer.starred') || '[]'); }
    catch (e) { return []; }
  }
  function setStars(list) {
    try { localStorage.setItem('aexplorer.starred', JSON.stringify(list)); } catch (e) {}
  }
  function toggleStar(path, add) {
    if (!path) return;
    let stars = getStars();
    const idx = stars.indexOf(path);
    const isStarred = idx >= 0;
    if (add && !isStarred) stars.push(path);
    if (!add && isStarred) stars.splice(idx, 1);
    setStars(stars);
    renderStarTree();
    toast(add ? (isStarred ? t('已在星标中') : t('已添加星标')) : (isStarred ? t('已移除星标') : t('未在星标中')));
  }
  function renderStarTree() {
    const stars = getStars();
    if (el.starSection) el.starSection.style.display = stars.length ? '' : 'none';
    if (!el.starTree) return;
    el.starTree.innerHTML = '';
    stars.forEach((p) => {
      const name = p.slice(p.lastIndexOf('/') + 1) || p;
      el.starTree.appendChild(makeTreeNode({ name, path: p, has_children: false }, false, true));
    });
  }

  function makeTreeNode(node, isQuick, isStar) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ex-tree-node';
    wrapper.dataset.path = node.path;
    wrapper.title = node.path;

    const caret = document.createElement('span');
    caret.className = 'ex-tree-caret' + (node.has_children ? '' : ' empty');
    caret.textContent = '▶';

    const icon = document.createElement('span');
    icon.className = 'ex-tree-icon';
    icon.textContent = isStar ? '⭐' : (isQuick ? '⚡' : (node.name === 'user' || node.name === 'user0' ? '📁' : '💾'));

    const label = document.createElement('span');
    label.className = 'ex-tree-label';
    label.textContent = node.name;

    wrapper.appendChild(caret);
    wrapper.appendChild(icon);
    wrapper.appendChild(label);

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      // 点击三角：只展开/折叠下级，不导航
      if (e.target === caret) {
        if (!node.has_children) return;
        caret.classList.toggle('open');
        const children = wrapper.querySelector('.ex-tree-children');
        if (children) {
          children.classList.toggle('open');
          if (!children.dataset.loaded) loadTreeChildren(node.path, children);
        }
        return;
      }
      // 点击名字/图标：直接打开该目录
      navigate(node.path);
    });
    // 双击：展开/收缩下级（已展开则收缩）+ 打开目录（与单击导航、三角折叠互补）
    wrapper.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (node.has_children) {
        const children = wrapper.querySelector('.ex-tree-children');
        const willOpen = children ? !children.classList.contains('open') : true;
        caret.classList.toggle('open', willOpen);
        if (children) {
          children.classList.toggle('open', willOpen);
          if (willOpen && !children.dataset.loaded) loadTreeChildren(node.path, children);
        }
      }
      navigate(node.path);
    });

    if (isStar) {
      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.showContextMenu(e.clientX, e.clientY, [
          { icon: '⭐', label: t('移除星标'), action: () => toggleStar(node.path, false) },
          { icon: '📂', label: t('打开'), action: () => navigate(node.path) },
        ]);
      });
    }

    wrapper.addEventListener('dragover', (e) => { e.preventDefault(); wrapper.classList.add('drop-target'); });
    wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drop-target'));
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('drop-target');
      // 与列表区一致：读 dragState 闭包（dataTransfer 多行格式不可靠），弹三选（复制/移动/取消）
      if (dragState && dragState.paths.length) showDropChoice(node.path, dragState);
    });

    if (node.has_children) {
      const children = document.createElement('div');
      children.className = 'ex-tree-children';
      wrapper.appendChild(children);
    }
    return wrapper;
  }

  function loadTreeChildren(path, container) {
    container.dataset.loaded = '1';
    apiPost('tree_json', { dir: path }).then((data) => {
      if (!data.ok) return;
      container.innerHTML = '';
      data.dirs.forEach((d) => container.appendChild(makeTreeNode(d)));
      highlightTree(state.cwd);
    }).catch(() => {});
  }

  function highlightTree(path) {
    document.querySelectorAll('.ex-tree-node').forEach((n) => {
      n.classList.toggle('active', n.dataset.path === path);
    });
  }

  // ============ 工具栏状态 ============
  function updateToolbar() {
    const hasSel = state.selected.size > 0;
    const single = state.selected.size === 1;
    $('tool-download').disabled = !single; // 单选：文件直链 / 目录打包下载（pack）
    $('tool-copy').disabled = !hasSel;
    $('tool-move').disabled = !hasSel;
    $('tool-rename').disabled = !single;
    $('tool-owner').disabled = !hasSel;
    $('tool-perm').disabled = !hasSel;
    $('tool-calc').disabled = !hasSel;
    $('tool-delete').disabled = !hasSel;
  }

  function isDirSelected() {
    return state.items.some((i) => state.selected.has(i.name) && i.is_dir);
  }

  // ============ 右键菜单 ============
  function getContextItems() {
    const hasSel = state.selected.size > 0;
    const single = state.selected.size === 1;
    const items = [];
    items.push({ icon: '📂', label: t('打开'), action: () => openSelected(), disabled: !single });
    items.push({ icon: '✏️', label: t('重命名'), action: () => doRename(), disabled: !single });
    if (state.searchMode) {
      items.push({ icon: '📁', label: t('打开所在目录'), action: () => {
        const sel = selectedItems();
        if (sel.length === 1 && sel[0].path) {
          const parent = sel[0].path.slice(0, sel[0].path.lastIndexOf('/')) || '/';
          state.searchMode = false;
          el.searchInput.value = '';
          navigate(parent);
        }
      }, disabled: !single });
    }
    items.push({ type: 'sep' });
    items.push({ icon: '⧉', label: t('复制'), action: () => doCopy(), disabled: !hasSel });
    items.push({ icon: '➡', label: t('移动'), action: () => doMove(), disabled: !hasSel });
    items.push({ icon: '⬇', label: t('下载'), action: () => doDownload(), disabled: !single }); // 单选：文件直链 / 目录打包
    if (single && !isDirSelected() && isArchive(selectedItems()[0])) {
      items.push({ icon: '📦', label: t('解压到当前目录'), action: () => doExtract() });
    }
    items.push({ type: 'sep' });
    items.push({ icon: '⭐', label: t('添加星标'), action: () => toggleStar(selectedItems()[0]?.path, true), disabled: !single });
    items.push({ icon: '👤', label: t('更改属主…'), action: () => doOwner(), disabled: !hasSel });
    items.push({ icon: '🔒', label: t('更改权限…'), action: () => doPerm(), disabled: !hasSel });
    items.push({ icon: 'ℹ️', label: t('属性'), action: () => doProperties(), disabled: !hasSel });
    items.push({ type: 'sep' });
    items.push({ icon: '🗑️', label: t('删除…'), action: () => doDelete(), disabled: !hasSel, danger: true });
    return items;
  }

  function openSelected() {
    const sel = selectedItems();
    if (sel.length === 1) openItem(sel[0]);
  }

  // ============ 官方动作封装 ============
  function sourceParam() {
    return selectedItems().map((i) => i.path).join('\r');
  }

  function runAction(action, title, opts = {}) {
    const Explorer = window.Explorer;
    Explorer.showProgress(0, t('任务提交中…'));
    // 确保后台任务消费端运行（幂等）：任务入队前拉起 file_manager，防止入队后无人消费导致操作不执行
    apiPost('ensure_fm').catch(() => {});
    let settled = false;
    // 兜底：8 秒未收到 nchan done 也强制刷新一次（快任务消息可能早于订阅发出）。
    // 注意：不置 settled、不停订阅 —— 慢任务（复制大文件 >8s）的 done 后续仍能到达，
    // 到达时再刷新一次，避免"兜底刷太早 → 任务完成后列表不刷新"的假死。
    const timer = setTimeout(() => {
      Explorer.hideProgress();
      Explorer.refresh();
    }, 8000);
    function finishAction(ok, msg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.DFM.stopSubscribe();
      Explorer.hideProgress();
      Explorer.refresh();
      Explorer.toast(msg);
    }
    window.DFM.subscribe((data) => {
      if (data.done === 1) {
        finishAction(true, t('操作完成'));
      } else if (data.done === 2) {
        settled = true;
        clearTimeout(timer);
        window.DFM.stopSubscribe();
        Explorer.hideProgress();
      } else if (data.status) {
        const p = window.DFM.parseProgress(data.status);
        Explorer.showProgress(p.text && p.text.includes('%') ? parseInt(p.text) : 0, p.text || t('处理中…'));
      }
    }, (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.DFM.stopSubscribe();
      Explorer.hideProgress();
      Explorer.refresh();
      Explorer.toast(t('操作失败: {err}', { err }), true);
    });
    const src = opts.source || sourceParam();
    try {
      apiPost('log', { type: 'op', msg: title + (src ? ': ' + src : '') + (opts.target ? ' → ' + opts.target : '') }).catch(() => {});
    } catch (e) {}
    return window.DFM.doAction(action, Object.assign({ title, source: sourceParam() }, opts));
  }

  function openTerminalHere() {
    const dir = state.cwd;
    Explorer.showProgress(0, t('启动终端…'));
    apiPost('term', { dir }).then((d) => {
      Explorer.hideProgress();
      if (!d || !d.ok) { Explorer.toast(t('终端启动失败') + ': ' + (d && d.error || ''), true); return; }
      // 内嵌面板终端（同源 iframe，WebSocket 直连 ttyd；关闭面板即断开，ttyd -o 自动退出）
      const panel = document.getElementById('term-panel');
      const frame = document.getElementById('term-frame');
      const title = document.getElementById('term-title');
      title.textContent = '🖥 ' + t('终端') + ' — ' + dir;
      frame.src = d.url;
      // 首次启动 ttyd 偶发 socket 未就绪 → iframe 502 白屏：加载失败自动重试一次
      let retried = false;
      frame.onerror = () => { if (!retried) { retried = true; setTimeout(() => { frame.src = d.url; }, 500); } };
      panel.style.display = 'flex';
      Explorer.hideProgress();
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('终端启动失败'), true); });
  }

  function doCreate() {
    openModal(`
      <h3>${t('新建文件夹')}</h3>
      <div class="ex-form-row">
        <label>${t('名称')}</label>
        <input type="text" id="dfm-name" placeholder="${t('文件夹名称')}" autocomplete="off" spellcheck="false">
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('创建')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = async () => {
        const name = box.querySelector('#dfm-name').value.trim();
        if (!name) { toast(t('请输入名称'), true); return; }
        try {
          await window.DFM.doAction(0, { title: t('创建'), source: state.cwd + '/' + name });
          closeModal();
          setTimeout(() => { loadList(); toast(t('已创建')); }, 800);
        apiPost('log', { type: 'op', msg: t('新建文件夹') + ': ' + state.cwd + '/' + name }).catch(() => {});
        } catch (err) { toast(t('创建失败'), true); }
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
      box.querySelector('#dfm-name').focus();
    });
  }

  function doRename() {
    const sel = selectedItems()[0];
    if (!sel) return;
    openModal(`
      <h3>${t('重命名')}</h3>
      <div class="ex-form-row">
        <label>${t('当前')}</label>
        <span style="flex:1;word-break:break-all;">${esc(sel.name)}</span>
      </div>
      <div class="ex-form-row">
        <label>${t('新名称')}</label>
        <input type="text" id="dfm-name" value="${esc(sel.name)}" autocomplete="off" spellcheck="false">
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('重命名')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = async () => {
        const name = box.querySelector('#dfm-name').value.trim();
        if (!name || name === sel.name) { closeModal(); return; }
        try {
          await window.DFM.doAction(sel.is_dir ? 2 : 7, { title: t('重命名'), source: sel.path, target: name });
          closeModal();
          setTimeout(() => { loadList(); toast(t('已重命名')); }, 800);
      apiPost('log', { type: 'op', msg: t('重命名') + ': ' + sel.path + ' → ' + name }).catch(() => {});
        } catch (err) { toast(t('重命名失败'), true); }
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
      box.querySelector('#dfm-name').focus();
      box.querySelector('#dfm-name').select();
    });
  }

  // ============ 拖放三选弹窗（复制/移动/取消） ============
  function showDropChoice(target, src) {
    if (!src || !src.paths.length) return;
    const n = src.paths.length;
    const sameDir = src.paths.some((p) => p.substring(0, p.lastIndexOf('/')) === target.replace(/\/+$/, ''));
    if (sameDir) { toast(t('目标与源所在目录相同，无法执行该操作'), true); return; }
    const srcParam = src.paths.join('\r');
    openModal(`
      <h3>📂 ${esc(target)}</h3>
      <p>${t('{n} 个项目', { n: fmtCount(n) })}</p>
      <p style="color:var(--text-dim);margin-top:6px;word-break:break-all;">${src.paths.slice(0, 3).map((p) => esc(p)).join('<br>')}${n > 3 ? '<br>…' : ''}</p>
      <div class="ex-modal-actions">
        <button class="ex-btn primary" id="dfm-copy">${t('复制')}</button>
        <button class="ex-btn" id="dfm-move">${t('移动')}</button>
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-copy').onclick = () => { closeModal(); runAction(3, t('复制'), { target, source: srcParam }); };
      box.querySelector('#dfm-move').onclick = () => { closeModal(); runAction(4, t('移动'), { target, source: srcParam }); };
      box.querySelector('#dfm-cancel').onclick = closeModal;
    });
  }

  function doCopy() {
    openModal(`
      <h3>${t('复制 {n} 项', { n: state.selected.size })}</h3>
      <div class="ex-form-row">
        <label>${t('目标路径')}</label>
        <input type="text" id="dfm-target" value="${esc(state.cwd)}" autocomplete="off" spellcheck="false">
      </div>
      <div class="ex-form-row">
        <label>${t('覆盖已有')}</label>
        <input type="checkbox" id="dfm-exist" style="width:auto">
      </div>
      <div class="ex-form-row">
        <label>${t('稀疏模式')}</label>
        <input type="checkbox" id="dfm-sparse" style="width:auto">
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('开始复制')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = () => {
        const target = box.querySelector('#dfm-target').value.trim();
        if (!target) { toast(t('请输入目标路径'), true); return; }
        // 同目录操作：官方 Control.php 静默拒绝（无任务），提前提示
        const sameDir = selectedItems().some((i) => i.path.substring(0, i.path.lastIndexOf('/')) === target.replace(/\/+$/, ''));
        if (sameDir) { toast(t('目标与源所在目录相同，无法执行该操作'), true); return; }
        // 先读弹窗值再关闭（closeModal 会清空 DOM，之后 querySelector 返回 null）
        const exist = box.querySelector('#dfm-exist').checked ? '1' : '';
        const sparse = box.querySelector('#dfm-sparse').checked ? '1' : '';
        closeModal();
        runAction(3, t('复制'), {
          target,
          exist,
          sparse,
        });
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
      box.querySelector('#dfm-target').focus();
    });
  }

  function doMove() {
    openModal(`
      <h3>${t('移动 {n} 项', { n: state.selected.size })}</h3>
      <div class="ex-form-row">
        <label>${t('目标路径')}</label>
        <input type="text" id="dfm-target" value="${esc(state.cwd)}" autocomplete="off" spellcheck="false">
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('开始移动')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = () => {
        const target = box.querySelector('#dfm-target').value.trim();
        if (!target) { toast(t('请输入目标路径'), true); return; }
        // 同目录操作：官方 Control.php 静默拒绝（无任务），提前提示
        const sameDir = selectedItems().some((i) => i.path.substring(0, i.path.lastIndexOf('/')) === target.replace(/\/+$/, ''));
        if (sameDir) { toast(t('目标与源所在目录相同，无法执行该操作'), true); return; }
        closeModal();
        runAction(4, t('移动'), { target });
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
      box.querySelector('#dfm-target').focus();
    });
  }

  function doDelete() {
    const sel = selectedItems();
    openModal(`
      <h3>${t('⚠️ 确认删除')}</h3>
      <p>${t('即将删除 {n} 项，此操作不可恢复！', { n: sel.length })}</p>
      <p style="color:var(--text-dim);margin-top:6px;word-break:break-all;">${esc(sel.slice(0, 3).map(i => i.path).join('<br>'))}</p>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn danger" id="dfm-ok">${t('确认删除')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = () => {
        const isDir = sel.some(i => i.is_dir);
        closeModal();
        runAction(isDir ? 1 : 6, t('删除'));
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
    });
  }

  function doOwner() {
    const sel = selectedItems();
    const cur = sel.length ? (sel[0].owner || 'nobody') : 'nobody';
    const users = Array.isArray(window.AE_USERS) && window.AE_USERS.length ? window.AE_USERS.slice() : ['nobody', 'root'];
    if (!users.includes(cur)) users.unshift(cur);
    const opts = users.map((u) => `<option value="${escAttr(u)}"${u === cur ? ' selected' : ''}>${esc(u)}</option>`).join('');
    openModal(`
      <h3>${t('更改属主')}</h3>
      <div class="ex-form-row">
        <label>${t('新属主')}</label>
        <select id="dfm-target">${opts}</select>
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('应用')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = () => {
        const target = box.querySelector('#dfm-target').value || 'nobody';
        closeModal();
        runAction(11, t('更改属主…'), { target });
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
    });
  }

  function doPerm() {
    openModal(`
      <h3>${t('更改权限')}</h3>
      <div class="ex-form-row">
        <label>属主</label>
        <select id="dfm-owner">
          <option value="u-rwx">${t('无权限')}</option>
          <option value="u-wx+r" selected>${t('只读')}</option>
          <option value="u-x+rw">${t('读写')}</option>
        </select>
      </div>
      <div class="ex-form-row">
        <label>${t('属组')}</label>
        <select id="dfm-group">
          <option value="g-rwx">${t('无权限')}</option>
          <option value="g-wx+r">${t('只读')}</option>
          <option value="g-x+rw" selected>${t('读写')}</option>
        </select>
      </div>
      <div class="ex-form-row">
        <label>${t('其他')}</label>
        <select id="dfm-other">
          <option value="o-rwx">${t('无权限')}</option>
          <option value="o-wx+r">${t('只读')}</option>
          <option value="o-x+rw" selected>${t('读写')}</option>
        </select>
      </div>
      <div class="ex-modal-actions">
        <button class="ex-btn" id="dfm-cancel">${t('取消')}</button>
        <button class="ex-btn primary" id="dfm-ok">${t('应用')}</button>
      </div>
    `, (box) => {
      box.querySelector('#dfm-ok').onclick = () => {
        const target = [
          box.querySelector('#dfm-owner').value,
          box.querySelector('#dfm-group').value,
          box.querySelector('#dfm-other').value,
        ].join(',') + ',ugo+X';
        closeModal();
        runAction(12, t('更改权限…'), { target });
      };
      box.querySelector('#dfm-cancel').onclick = closeModal;
    });
  }

  function doProperties() {
    const sel = selectedItems();
    if (!sel.length) return;
    const item = sel[0];
    const isDir = item.is_dir;
    const rows = [
      [t('名称'), item.name],
      [t('路径'), item.path],
      [t('类型'), isDir ? t('文件夹') : (item.type || t('文件'))],
      [t('大小'), isDir ? '—' : fmtSize(item.size)],
      [t('修改时间'), item.mtime_human || ''],
      [t('权限'), item.perm || '—'],
      [t('属主'), item.owner || '—'],
      [t('位置'), item.loc || '—'],
    ];
    let html = `<h3>${t('属性 — {name}', { name: esc(item.name) })}</h3><div class="ex-prop-table">` +
      rows.map(([k, v]) => `<div class="ex-prop-row"><span class="ex-prop-key">${k}</span><span class="ex-prop-val">${esc(String(v))}</span></div>`).join('') +
      `</div>`;
    if (isDir) html += `<div class="ex-prop-hint" id="prop-calc">${t('正在计算占用空间…')}</div>`;
    html += `<div class="ex-modal-actions"><button class="ex-btn" id="dfm-close">${t('关闭')}</button></div>`;
    openModal(html, (box) => {
      box.querySelector('#dfm-close').onclick = () => closeModal();
      if (isDir) {
        // 目录占用空间：复用官方 Control.php mode=calc（不新增后端）
        const body = new URLSearchParams();
        body.append('mode', 'calc');
        body.append('source', encodeURIComponent(item.path));
        fetch('/webGui/include/Control.php', {
          method: 'POST',
          body: body.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'same-origin',
        }).then((r) => r.text()).then((text) => {
          const calcEl = box.querySelector('#prop-calc');
          if (calcEl) calcEl.innerHTML = t('占用空间：{s}', { s: text });
        }).catch(() => {
          const calcEl = box.querySelector('#prop-calc');
          if (calcEl) calcEl.textContent = t('占用空间计算失败');
        });
      }
    });
  }

  // ============ 解压（zip/tar.gz/tar，服务器端 unzip/tar） ============
  const ARCHIVE_EXT = ['zip', 'tar', 'gz', 'tgz'];
  function isArchive(item) {
    if (item.is_dir) return false;
    const n = (item.name || '').toLowerCase();
    return ARCHIVE_EXT.some((x) => n.endsWith('.' + x));
  }

  function doExtract() {
    const sel = selectedItems();
    if (sel.length !== 1) return;
    const item = sel[0];
    Explorer.showProgress(5, t('解压中…'));
    apiPost('extract', { file: item.path, target: state.cwd }).then((data) => {
      Explorer.hideProgress();
      if (data && data.ok) {
        Explorer.toast(t('解压完成'));
      apiPost('log', { type: 'op', msg: t('解压到当前目录') + ': ' + item.path }).catch(() => {});
        loadList();
      } else {
        Explorer.toast(t('解压失败: {e}', { e: (data && data.error) || t('未知') }), true);
      }
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('解压失败: 网络错误'), true); });
  }

  function doDownload() {
    const sel = selectedItems();
    if (sel.length === 0) return;
    if (sel.length === 1 && !sel[0].is_dir) {
      // 与官方内置版一致：单文件直链下载（nginx auth_request 保护 /mnt /boot）
      const a = document.createElement('a');
      a.href = sel[0].path;
      a.download = sel[0].name;
      a.style.display = 'none';
      apiPost('log', { type: 'op', msg: t('下载') + ': ' + sel[0].path }).catch(() => {});
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    // 文件夹/多选：打包下载（tar.gz → nginx 静态直出，绕开 php-fpm 流式）
    const dirs = sel.filter(i => i.is_dir).map(i => i.path);
    const target = dirs.length === 1 ? dirs[0] : sel[0].path;
    Explorer.showProgress(0, t('打包中…'));
    apiPost('log', { type: 'op', msg: t('下载') + ': ' + sel.map(i => i.path).join(', ') }).catch(() => {});
    apiPost('pack', { dir: target }).then((data) => {
      Explorer.hideProgress();
      if (data && data.ok && data.url) {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.url.split('/').pop();
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 清理层 1：下载后延迟 60s 删临时文件（防下载中断误删；未删由清扫兜底）
        setTimeout(() => apiPost('pack_clean', { token: data.token }).catch(() => {}), 60000);
        Explorer.toast(t('打包完成，开始下载'));
      } else {
        Explorer.toast(t('打包失败: {e}', { e: (data && data.error) || t('未知') }), true);
      }
    }).catch(() => { Explorer.hideProgress(); Explorer.toast(t('打包失败: 网络错误'), true); });
  }

  async function doSearch(query) {
    if (!query.trim()) { state.searchMode = false; loadList(); return; }
    state.searchMode = true;
    const q = query.trim().toLowerCase();
    // 优先后端递归搜索（Browse.php mode=search，深度 3，限目录数）；失败回退前端一层过滤
    try {
      const data = await apiPost('search', { dir: state.cwd, q, depth: 3 });
      if (data && data.ok) {
        renderSearchResults((data.items || []).map((i) => ({ ...i, _src: i._src || '' })), q);
        return;
      }
    } catch (e) { /* fallthrough */ }
    const results = state.items
      .filter((i) => i.name.toLowerCase().includes(q))
      .map((i) => ({ ...i, _src: '' }));
    renderSearchResults(results, q);
  }

  function renderSearchResults(results, q) {
    el.fileList.innerHTML = '';
    el.emptyHint.style.display = 'none';
    el.statusCount.textContent = t('{n} 个结果', { n: fmtCount(results.length) });
    if (!results.length) {
      el.emptyHint.textContent = t('未找到匹配项');
      el.fileList.appendChild(el.emptyHint);
      el.emptyHint.style.display = 'block';
      return;
    }
    state.sorted = results;
    const rowH = ROW_H.list;
    const vlist = document.createElement('div');
    vlist.className = 'ex-vlist';
    vlist.style.height = (results.length * rowH) + 'px';
    el.fileList.appendChild(vlist);
    el.fileList.onscroll = () => {
      if (state.vscroll.raf) cancelAnimationFrame(state.vscroll.raf);
      state.vscroll.raf = requestAnimationFrame(renderWindow);
    };
    renderWindow();
  }

  async function confirmMove(srcPaths, dest) {
    try {
      await window.DFM.doAction(4, { title: t('移动'), source: srcPaths.join('\r'), target: dest });
      toast(t('移动任务已提交'));
      setTimeout(() => loadList(), 1000);
    } catch (err) { toast(t('移动失败'), true); }
  }

  // ============ 模态框 ============
  function openModal(html, setup, wide) {
    el.modalBox.innerHTML = html;
    el.modalBox.classList.toggle('ex-modal-wide', !!wide);
    el.modalMask.style.display = 'flex';
    // 点击遮罩空白处关闭（点击弹窗内部不关）；每次打开重新绑定，无累积
    el.modalMask.onclick = (e) => { if (e.target === el.modalMask) closeModal(); };
    if (setup) setup(el.modalBox);
  }
  function closeModal() {
    el.modalMask.style.display = 'none';
    el.modalBox.innerHTML = '';
    el.modalBox.classList.remove('ex-modal-wide');
  }

  // ============ 进度条 ============
  function showProgress(pct, text) {
    el.progressBar.style.display = 'flex';
    el.progressFill.style.width = pct + '%';
    el.progressText.textContent = text || pct + '%';
  }
  function hideProgress() {
    el.progressBar.style.display = 'none';
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    $('btn-back').addEventListener('click', goBack);
    $('btn-forward').addEventListener('click', goForward);
    $('btn-up').addEventListener('click', goUp);

    // 移动端：汉堡菜单开合树抽屉
    const menuBtn = $('btn-menu');
    const sidebarEl = $('sidebar');
    const appEl = document.getElementById('explorer-app');
    if (menuBtn && sidebarEl && appEl) {
      const closeSidebar = () => {
        sidebarEl.classList.remove('open');
        appEl.classList.remove('sidebar-open');
      };
      menuBtn.addEventListener('click', () => {
        const open = sidebarEl.classList.toggle('open');
        appEl.classList.toggle('sidebar-open', open);
      });
      // 点遮罩（app 外层）关闭
      document.addEventListener('click', (e) => {
        if (appEl.classList.contains('sidebar-open') && !e.target.closest('#sidebar') && !e.target.closest('#btn-menu')) closeSidebar();
      });
      // 树内选择目录后自动关闭（窄屏）
      sidebarEl.addEventListener('click', () => { if (IS_MOBILE()) closeSidebar(); });
    }

    // 移动端：⋯ 更多操作弹出（工具栏折叠项副本）
    const moreBtn = $('tool-more');
    const moreMenu = $('more-menu');
    if (moreBtn && moreMenu) {
      const hiddenTools = ['tool-download', 'tool-copy', 'tool-move', 'tool-rename', 'tool-owner', 'tool-perm', 'tool-calc', 'tool-delete'];
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (moreMenu.style.display !== 'none') { moreMenu.style.display = 'none'; return; }
        moreMenu.innerHTML = '';
        hiddenTools.forEach((id) => {
          const src = document.getElementById(id);
          if (!src) return;
          const b = document.createElement('button');
          b.className = 'ex-more-item';
          b.innerHTML = src.innerHTML;
          b.disabled = src.disabled;
          b.addEventListener('click', () => { moreMenu.style.display = 'none'; src.click(); });
          moreMenu.appendChild(b);
        });
        const r = moreBtn.getBoundingClientRect();
        moreMenu.style.display = 'block';
        moreMenu.style.top = (r.bottom + 4) + 'px';
        moreMenu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
        moreMenu.style.left = 'auto';
      });
      document.addEventListener('click', (e) => {
        if (moreMenu.style.display !== 'none' && !e.target.closest('#more-menu') && !e.target.closest('#tool-more')) {
          moreMenu.style.display = 'none';
        }
      });
    }

    // 日志/操作记录查看（footer 按钮）
    const openLogViewer = (type) => {
      const title = type === 'app' ? t('📋 日志') : t('🕒 操作记录');
      openModal(`
        <h3>${title}</h3>
        <pre class="ex-log-view" id="log-view">${t('加载中…')}</pre>
        <div class="ex-modal-actions">
          <button class="ex-btn" id="log-refresh">${t('⟳ 刷新')}</button>
          <button class="ex-btn danger" id="log-clear">${t('🗑 清空')}</button>
          <button class="ex-btn" id="dfm-close">${t('关闭')}</button>
        </div>`, (box) => {
        const view = box.querySelector('#log-view');
        const load = () => apiPost('readlog', { type }).then((d) => {
          view.textContent = d.content || t('暂无日志');
          view.scrollTop = view.scrollHeight;
        }).catch(() => { view.textContent = t('读取失败'); });
        load();
        box.querySelector('#log-refresh').onclick = load;
        box.querySelector('#log-clear').onclick = () => {
          if (confirm(t('确定清空日志？'))) apiPost('clearlog', { type }).then(() => load());
        };
        box.querySelector('#dfm-close').onclick = () => closeModal();
      });
    };
    if ($('btn-applog')) $('btn-applog').addEventListener('click', () => openLogViewer('app'));
    if ($('btn-opslog')) $('btn-opslog').addEventListener('click', () => openLogViewer('op'));
    // 内嵌终端：关闭按钮 → 隐藏面板 + 清空 iframe（ttyd -o 断开自动退出）
    const termClose = document.getElementById('term-close');
    if (termClose) termClose.addEventListener('click', () => {
      const panel = document.getElementById('term-panel');
      const frame = document.getElementById('term-frame');
      frame.src = 'about:blank';
      panel.style.display = 'none';
    });

    // 操作记录写入（后台任务类操作统一在 runAction 记录；即时操作在各自函数记录）
    const logOp = (msg) => apiPost('log', { type: 'op', msg }).catch(() => {});

    el.addressBar.addEventListener('click', (e) => {
      if (e.target === el.addressBar || e.target === el.breadcrumbs) enterAddressMode();
    });
    el.addressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const p = el.addressInput.value.trim();
        exitAddressMode();
        if (p) navigate(p);
      }
      if (e.key === 'Escape') exitAddressMode();
    });
    el.addressInput.addEventListener('blur', exitAddressMode);

    el.searchInput.addEventListener('input', () => {
      el.searchClear.style.display = el.searchInput.value ? 'block' : 'none';
    });
    el.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch(el.searchInput.value);
    });
    el.searchClear.addEventListener('click', () => {
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      doSearch('');
    });

    $('tool-create').addEventListener('click', doCreate);
    $('tool-upload').addEventListener('click', () => window.triggerUpload());
    $('tool-download').addEventListener('click', doDownload);
    $('tool-copy').addEventListener('click', doCopy);
    $('tool-move').addEventListener('click', doMove);
    $('tool-rename').addEventListener('click', doRename);
    $('tool-owner').addEventListener('click', doOwner);
    $('tool-perm').addEventListener('click', doPerm);
    $('tool-calc').addEventListener('click', doProperties);
    $('tool-delete').addEventListener('click', doDelete);
    $('tool-search').addEventListener('click', () => el.searchInput.focus());
    $('tool-refresh').addEventListener('click', () => loadList());

    // 排序切换按钮：循环 名称 → 修改时间 → 大小，切新列固定降序
    const sortBtn = $('tool-sort');
    if (sortBtn) {
      const SORT_CYCLE = ['name', 'mtime', 'size'];
      const refreshSortBtn = () => {
        updateSortIndicator();
        const label = t(SORT_KEYS[state.sortCol] || state.sortCol);
        sortBtn.title = t('切换排序') + ' (' + label + (state.sortDesc ? ' ↓' : ' ↑') + ')';
      };
      sortBtn.addEventListener('click', () => {
        const i = SORT_CYCLE.indexOf(state.sortCol);
        setSort(SORT_CYCLE[(i + 1) % SORT_CYCLE.length], true);
      });
      refreshSortBtn();
    }

    // 全屏按钮：Fullscreen API 优先，iOS/拒绝回退 CSS 覆盖
    const fsBtn = $('btn-fullscreen');
    if (fsBtn) {
      const app = document.getElementById('explorer-app');
      const setFsState = () => {
        const isFs = document.fullscreenElement || app.classList.contains('ex-fullscreen');
        fsBtn.textContent = isFs ? '🗗' : '⛶';
        fsBtn.title = t(isFs ? '退出全屏' : '全屏');
        fsBtn.dataset.i18nTitle = fsBtn.title;
      };
      fsBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (app.requestFullscreen) {
          app.requestFullscreen().catch(() => { app.classList.toggle('ex-fullscreen'); setFsState(); });
        } else {
          app.classList.toggle('ex-fullscreen');
          setFsState();
        }
      });
      document.addEventListener('fullscreenchange', () => {
        app.classList.remove('ex-fullscreen');
        setFsState();
      });
      setFsState();
    }

    document.querySelectorAll('.ex-view-toggle .ex-icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        document.querySelectorAll('.ex-view-toggle .ex-icon-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderList();
      });
    });

    el.listHeader.querySelectorAll('span').forEach((col) => {
      col.addEventListener('click', () => {
        const map = { [t('名称')]: 'name', [t('属主')]: 'owner', [t('权限')]: 'perm', [t('大小')]: 'size', [t('修改时间')]: 'mtime' };
        const key = map[col.textContent.replace(/[↑↓]/g, '').trim()];
        if (!key) return;
        if (state.sortCol === key) setSort(key, !state.sortDesc);
        else setSort(key, false);
      });
    });

    document.addEventListener('click', () => window.hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.ex-row') && !e.target.closest('.ex-tree-node') && e.target.closest('#explorer-app')) {
        e.preventDefault();
        window.showContextMenu(e.clientX, e.clientY, [
          { icon: '📁', label: t('新建文件夹…'), action: () => doCreate() },
          { type: 'sep' },
          { icon: '🖥', label: t('在此打开终端'), action: () => openTerminalHere() },
          { icon: '⟳', label: t('刷新'), action: () => loadList() },
        ]);
      }
    });

    document.addEventListener('keydown', handleKeydown);
    // 鼠标侧键导航（button 3=后退键 4=前进键）
    // 必须 capture 捕获阶段 + preventDefault：浏览器在事件分发早期已决定侧键历史导航，
    // 冒泡阶段拦截太晚（用户实测仍触发后退）；mousedown/mouseup/auxclick 三事件全拦
    // 全局拦截（不限定 #explorer-app）：AExplorer 为独立页面（切 tab 整页刷新），此 JS 仅存在于本页，不影响 unraid 其他页面
    ['mousedown', 'mouseup', 'auxclick'].forEach((type) => {
      document.addEventListener(type, (e) => {
        if (e.button === 3 || e.button === 4) {
          e.preventDefault();
          e.stopPropagation();
          if (type === 'mousedown') {
            if (e.button === 3) goBack();
            else goForward();
          }
        }
      }, true); // capture：最早阶段拦截
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
  }

  // type-ahead 缓冲：800ms 窗口内连续字母拼前缀；重复前缀循环找下一个
  let typeahead = { buf: '', timer: null, last: 0 };

  function selectByPrefix(prefix, repeat) {
    const items = state.sorted;
    if (!items.length) return;
    const p = prefix.toLowerCase();
    let start = 0;
    if (repeat && state.selected.size) {
      const cur = items.findIndex((i) => state.selected.has(i.name));
      if (cur >= 0) start = cur + 1;
    }
    let hit = -1;
    for (let i = start; i < items.length; i++) {
      if (items[i].name.toLowerCase().startsWith(p)) { hit = i; break; }
    }
    if (hit < 0 && start > 0) { // 循环从头
      for (let i = 0; i < start; i++) {
        if (items[i].name.toLowerCase().startsWith(p)) { hit = i; break; }
      }
    }
    if (hit < 0) return;
    state.selected.clear();
    state.selected.add(items[hit].name);
    refreshSelection();
    // 滚动定位到可视区中部（虚拟滚动：设 scrollTop 触发 renderWindow）
    const rowH = ROW_H[state.view] || ROW_H.list;
    const viewH = el.fileList.clientHeight || 400;
    el.fileList.scrollTop = Math.max(0, hit * rowH - Math.floor(viewH / 2) + Math.floor(rowH / 2));
    renderWindow();
  }

  function handleKeydown(e) {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      if (e.key === 'Escape' && (target.id === 'address-input' || target.id === 'search-input')) {
        target.value = '';
        exitAddressMode();
        doSearch('');
      }
      return;
    }
    switch (e.key) {
      case 'F5': e.preventDefault(); loadList(); break;
      case 'F2': e.preventDefault(); doRename(); break;
      case 'Delete': e.preventDefault(); if (state.selected.size) doDelete(); break;
      case 'Enter': e.preventDefault(); openSelected(); break;
      case 'Backspace': e.preventDefault(); goUp(); break;
      case 'ArrowLeft': if (e.altKey) { e.preventDefault(); goBack(); } break;
      case 'ArrowRight': if (e.altKey) { e.preventDefault(); goForward(); } break;
      case 'ArrowUp': if (e.altKey) { e.preventDefault(); goUp(); } break;
      case 'a': case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          state.selected.clear();
          state.sorted.forEach((i) => state.selected.add(i.name));
          refreshSelection();
        } else { e.preventDefault(); feedTypeahead('a'); }
        break;
      case 'f': case 'F':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); el.searchInput.focus(); }
        else { e.preventDefault(); feedTypeahead('f'); }
        break;
      case '1': if (e.ctrlKey) { e.preventDefault(); setView('list'); } break;
      case '2': if (e.ctrlKey) { e.preventDefault(); setView('grid'); } break;
      default:
        // 字母 type-ahead（Windows 风格：输入首字母选中对应项）
        if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          feedTypeahead(e.key.toLowerCase());
        }
        break;
    }
  }

  function feedTypeahead(ch) {
    const now = Date.now();
    const repeat = (now - typeahead.last) < 800 && typeahead.buf === ch;
    if ((now - typeahead.last) >= 800 || typeahead.buf.length >= 32) typeahead.buf = '';
    if (!repeat) typeahead.buf += ch; // 重复键不拼接（保持单字母前缀，跳到下一个匹配）
    typeahead.last = now;
    clearTimeout(typeahead.timer);
    typeahead.timer = setTimeout(() => { typeahead.buf = ''; }, 800);
    selectByPrefix(typeahead.buf, repeat);
  }

  function setView(view) {
    if (view === 'detail') view = 'list'; // detail 视图已移除（与 list 相同），兼容旧状态
    state.view = view;
    document.querySelectorAll('.ex-view-toggle .ex-icon-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    renderList();
  }

  // ============ 暴露 ============
  window.Explorer = {
    navigate, apiPost, toast,
    getState: () => state,
    refresh: loadList,
    showProgress, hideProgress,
    openModal, closeModal,
    selectedItems,
  };

  // ============ 初始化 ============
  function init() {
    bindEvents();
    bindListEvents();
    loadTree();
    fitToViewport();
    applyI18n();
    updateSortIndicator(); // 初始列头箭头 + 排序按钮文字
    [80, 250, 600, 1200].forEach((d) => setTimeout(fitToViewport, d)); // 多轮校准（footer fixed 定位生效时机不定）
    navigate(state.cwd, { silent: true });
  }

  // 底部与 unraid 页面 footer 自适应：footer 为文档流元素（static，位置随内容区高度变化）
  // 因此不追 footer 位置（循环依赖），改为：内容区高度 = 视口 - 顶部偏移 - 固定底部留白 45px
  // footer 自然落在留白区，始终可见且不被遮挡
  function fitToViewport() {
    const app = document.getElementById('explorer-app');
    if (!app) return;
    const top = app.getBoundingClientRect().top || 199;
    app.style.height = 'calc(100vh - ' + Math.round(top) + 'px - 45px)';
    app.style.minHeight = '280px'; // 覆盖 CSS 默认 420px（否则小视口下高度被顶回超出底部）
  }

  window.addEventListener('resize', () => {
    if (typeof fitToViewport === 'function') fitToViewport();
  });
  window.addEventListener('load', () => {
    if (typeof fitToViewport === 'function') fitToViewport();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
