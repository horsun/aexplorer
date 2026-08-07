# 🦐 AExplorer — 全功能设计文档

**[中文](DESIGN.md) | [English](DESIGN.en.md)**

> 基于 **Unraid 7 内置 Dynamix File Manager（webGui 内核版）** 改造的文件管理器
> 核心思路：**保留官方内核全部后端机制，前端 UI 重写为 Windows 11 资源管理器风格**
> 设计目标：**功能完整 + 视觉现代 + 操作直觉 + 与官方内核深度兼容**

---

## 1. 定位与命名

| 项 | 值 |
|----|----|
| 插件名 | `aexplorer`（与仓库名、URI 路径统一） |
| 显示名 | AExplorer |
| 菜单位置 | **顶部导航 tab**（`Menu="Tasks:70"`，位于 Docker 60 与 Apps 80 之间；0.4.4 起，此前为 Main 子菜单） |
| 上游 | [unraid/dynamix → source/file-manager](https://github.com/unraid/dynamix/tree/master/source/file-manager) |
| 内核版本 | Unraid 7.0+ webGui 内置版（2026 更新） |
| 协议 | GPL v2（保留官方版权声明） |
| 安装目录 | `/usr/local/emhttp/plugins/aexplorer/` |
| 页面 URI | `/plugins/aexplorer/...`，独立页面路由 `/AExplorer` |
| 最低要求 | **Unraid 7.0+**（依赖内置版 webGui 文件） |

> ⚠️ **nchan 通道 `/sub/filemanager` 为 Unraid 系统级配置**（nginx `/sub/` 前缀 + publish.php 发布端），与插件目录无关，**不可改名**，否则订阅不到后台任务进度。
>
> ⚠️ **unraid webGui 强制校验 `/plugins/` 下 PHP 请求 CSRF**（0.4.3 真机安装实测）：缺 `X-CSRF-Token`/`csrf_token` 的 POST 返回空响应并记 `error: <file> - missing csrf_token`。官方 `Control.php` 在 `/webGui/` 下**不**校验（与官方 Browse 行为一致），插件仍统一携带作纵深防御。
>
> ⚠️ **`Nchan="file_manager"` 页面属性必需**（0.6.9 修复）：官方 Browse.page 带此属性，unraid 页面框架打开页面时自动拉起 `webGui/nchan/file_manager` 消费进程；缺失则删除/复制/移动等后台任务入队后**无人消费**（间歇性失效）。

---

## 2. 背景与改造动机

Unraid 7.0 起，官方将 Dynamix File Manager 插件 **merge 进 webGUI 内核**（`/usr/local/emhttp/webGui/`），插件版（2023 停更）已冗余。官方发布说明：

> "The Dynamix File Manager, GUI Search, and Unlimited Width Plugin plugins are now built into Unraid."

内置版相比旧插件版的变化：
- **操作协议迁移**：`plugins/.../FileManager.php`（明文）→ **系统 `webGui/include/Control.php`（mode:file，JSON + 任务队列）**
- **列表解析升级**：stat 管道 → **find -L + \\0 分隔**（支持换行文件名、符号链接、破损链接检测）
- **上传升级**：2MB base64 → **20MB 原始二进制分片**（XHR + CSRF）
- **后台任务升级**：nchan 脚本 262 → **733 行**（rsync 进度采样、ETA 计算）
- **组件拆分**：FileTree.php / FileUpload.php 独立成文件

**本项目价值**：官方内核 UI 仍是老 jQuery 表格，未解决「美观 + 大目录卡顿」痛点。本项目保留内核全部后端，重写前端为 Windows 11 风格 + 虚拟滚动。

---

## 3. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                  Unraid WebGUI (PHP + nginx + nchan)          │
│                                                              │
│  ┌─────────── 前端（本项目重写） ─────────┐                     │
│  │ explorer.js      主引擎/虚拟滚动/媒体/星标/框选 │               │
│  │ dfm.js           系统协议封装          │                     │
│  │ contextmenu.js   右键菜单             │                     │
│  │ upload.js        20MB 分片上传/文件夹拖拽│                    │
│  │ editor.js        ACE 封装 + 编码切换  │                     │
│  │ css/explorer.css Windows11 主题      │                     │
│  └───────────────────────────────────────┘                     │
│              │ fetch / POST（全部带 X-CSRF-Token）             │
│  ┌─────────── 数据源（本项目扩展） ──────┐                       │
│  │ plugins/aexplorer/include/     │                      │
│  │   Browse.php = 官方 find -L 逻辑     │                      │
│   │   + list_json/tree_json/search/      │                      │
│   │     extract/mkdir/ensure_fm/log/  │                      │
│   │     pack/file_read/sqlite/        │                      │
│   │     archive_list/term             │                      │
│  └───────────────────────────────────────┘                     │
│              │                       │                        │
│  ┌─────────── 系统内核（官方，只读对接） ─┐                       │
│  │ webGui/include/Control.php          │                      │
│  │   mode:file 操作协议 / mode:edit     │                      │
│  │   mode:save / mode:calc / mode:upload│                      │
│  │ webGui/nchan/file_manager（733 行） │                      │
│  └───────────────────────────────────────┘                     │
│              │ 写 /var/tmp/file.manager.*                     │
│              ▼                                                 │
│  /sub/filemanager  nchan WebSocket 实时进度                    │
└──────────────────────────────────────────────────────────────┘
```

### 关键设计决策

1. **操作零重复**：复制/移动/删除/权限等直接对接系统 `Control.php`（mode:file），与官方内置版行为完全一致，不复制官方逻辑
2. **数据源轻扩展**：只在插件自己的 Browse.php 加 `list_json`/`tree_json`/`search`/`extract`/`mkdir` 等 JSON 出口（复用官方 find -L 解析 + validdir 校验），官方 HTML 渲染模式保留
3. **前端完全重写**：jQuery 表格 → 原生 JS 虚拟滚动 + Windows 11 风格（无新增依赖，ACE 用官方内置）
4. **进度双通道**：优先 nchan WebSocket（官方），不可用时轮询 `/var/tmp/file.manager.status`
5. **安全沿用官方**：`validdir()` 路径白名单（仅 `/mnt`、`/boot`），防目录穿越
6. **CSS 作用域化**：全部规则 `#explorer-app` 前缀（ID 特异性压过官方 reset——官方 `default-base.css` 的 `:where(:not(.unapi *))`/reset 会清零插件 padding/margin，0.4.7 修复；唯一例外：`.ex-marquee` 选框挂载在 `document.body`，选择器不带前缀）
7. **递归搜索受限**：深度 ≤3 / 目录数 ≤400 / 忽略隐藏目录，防全盘扫描拖垮 PHP
8. **后台任务消费端**：AExplorer.page 必须带 `Nchan="file_manager"` 页面属性（0.6.9），由 unraid 页面框架拉起系统 file_manager 进程；**0.8.3 增加 ensure_fm 自愈**——前端每次后台任务（删除/复制/移动/属主/权限）提交前调用 `mode=ensure_fm`（Browse.php 幂等 pgrep 检查 + 无进程则 nohup 启动官方脚本），修复页面已打开时消费端退出导致任务卡住
9. **操作后自动刷新兜底**：runAction 8 秒超时强制刷新（0.7.0）——删除/权限/owner 等快任务 nchan done 消息可能先于订阅发出导致列表不刷新
10. **侧键拦截**：capture 捕获阶段 + mousedown/mouseup/auxclick 三事件全拦（0.7.4）——冒泡阶段拦截太晚，浏览器在事件分发早期已决定侧键导航
11. **内容区高度自适应**：fitToViewport 实测顶部偏移，高度 = 视口 - 顶部 - 45px 底部留白（0.7.3）——footer 为文档流元素，追其位置会循环依赖
12. **日志系统（0.8.3）**：操作记录 `aexplorer-ops.log` + 应用日志 `aexplorer.log`，存插件目录 `/boot/config/plugins/aexplorer/logs/`，1MB 轮转（超限 rename .1）、权限 0600、防换行注入；footer 双按钮弹窗查看（最后 64KB）/刷新/清空

---

## 4. URI 层级

| URI | 类型 | 作用 |
|-----|------|------|
| `/plugins/aexplorer/AExplorer.page` | 页面 | 主浏览页（.page 路由，`Menu="Tasks:70"` 顶部 tab，**`Nchan="file_manager"`** 属性） |
| `/plugins/aexplorer/include/Browse.php` | API | 🆕 `mode=list_json` 目录列表 / `mode=tree_json` 目录树 / `mode=search` 递归搜索 / `mode=extract` 解压 / `mode=mkdir` 递归建目录 / `mode=ensure_fm` 消费端自愈 / `mode=log`+`readlog`+`clearlog` 日志读写清 / `mode=pack` 打包下载 / `mode=file_read` 文本读 / `mode=sqlite` 只读分页 / `mode=archive_list` 压缩包列表 / `mode=term` 终端（`ex_` 前缀函数）；官方 HTML 渲染保留 |
| `/plugins/aexplorer/css/explorer.css` | 静态 | Windows 11 主题（`#explorer-app` 作用域 + 全局 `.ex-marquee`） |
| `/plugins/aexplorer/javascript/*.js` | 静态 | 前端模块（explorer/dfm/contextmenu/upload/editor/EZView） |
| `/webGui/javascript/ace/` | 系统资源 | ACE 编辑器（官方内置 1.15.2，不再自带） |
| `/plugins/aexplorer/images/aexplorer.png` | 静态 | 菜单/插件列表图标 |
| **系统对接** | | |
| `/webGui/include/Control.php` | 系统 API | `mode:file` 操作协议 / `mode:edit`/`save` 编辑 / `mode:calc` 计算 / `mode:upload` 上传 / `mode:read` 任务状态 / `mode:stop` 取消 |
| `/sub/filemanager` | 系统通道 | nchan WebSocket（后台任务进度） |
| `/var/tmp/file.manager.{active,status,error,jobs,pid}` | 系统文件 | 任务配置/状态/错误/队列/进程 |
| `/boot/config/plugins/aexplorer/logs/` | 插件日志 | `aexplorer-ops.log` 操作记录 + `aexplorer.log` 应用日志（1MB 轮转 .1，0600） |
| `/webGui/include/Helpers.php` 等 | 系统依赖 | 官方工具函数/翻译 |

---

## 5. 功能清单

### 5.1 文件浏览 ✅

| 功能 | 实现 |
|------|------|
| 目录树导航 | 左侧树，懒加载子目录（`tree_json`），垂直布局（flex-wrap，子节点换行到父节点下方） |
| 面包屑导航 | 顶部可点击回跳（0.4.8 修复闭包：每级独立绑定路径） |
| 地址栏 | 可编辑，输入路径回车直达 |
| 文件列表 | 名称/属主/权限/大小/修改时间/位置 多列 |
| 视图切换 | 列表 / 大图标（Ctrl+1/2；detail 视图 0.8.3 移除——与 list 完全相同） |
| 列排序 | 点击列头（名称/属主/权限/大小/时间） |
| 大小单位 | 前端 `fmtSize` 自动 B/KB/MB/GB（不再用后端千分位无单位） |
| 磁盘空间 | 状态栏显示可用空间 + 目录总大小 |
| **虚拟滚动** | 只渲染可视区行（万级文件流畅） |
| **鼠标框选** | 🆕 0.7.1：空白区按住左键拖拽画矩形（半透明蓝框），释放选中框内文件；矩形相交计算兼容虚拟滚动；Shift/Ctrl 拖拽追加；边缘自动滚动；滚动条区域不触发 |
| 符号链接 | 检测 + 目标 tooltip + 破损链接红色标识 |
| 换行文件名 | find -L + \\0 分隔，官方 2026 支持 |

### 5.2 文件操作 ✅（系统 Control.php 协议）

| 操作 | action |
|------|--------|
| 新建文件夹 | 0 |
| 删除（目录/文件） | 1 / 6 |
| 重命名（目录/文件） | 2 / 7 |
| 复制（目录/文件） | 3 / 8 |
| 移动（目录/文件，rsync/mv） | 4/5 / 9/10 |
| 更改属主 | 11（🆕 0.7.0 **下拉选择**：/etc/passwd UID≥1000 + root + nobody，页面 PHP 只读注入 `window.AE_USERS`，当前属主默认选中） |
| 更改权限 | 12 |
| 下载 | 13 |
| 属性（目录占用空间） | 14（mode:calc） |
| 取消任务 | 99 |

支持**任务队列**（`task` 参数），后台执行 + nchan 实时进度（含 rsync ETA）。

**操作后自动刷新**（0.7.0）：runAction 提交任务后 8 秒未收到 nchan done 也强制 `refresh()`（防重入 + clearTimeout 清理；错误路径同样刷新）——快任务 nchan 消息可能先于订阅发出。

### 5.3 打开与预览 ✅

| 类型 | 行为 |
|------|------|
| 目录 | 双击进入 |
| 图片（jpg/png/gif/webp/svg/bmp/ico） | 弹窗预览，**◀ 上一张 / ▶ 下一张翻页**（当前上下文图片池 + N/M 计数） |
| 视频（mp4/webm/m4v/ogv/mov） | 弹窗 `<video>` 播放（浏览器原生，nginx range 直链）；**编码不支持时 error 回退**（提示下载本地播放） |
| 音频（mp3/flac/wav/m4a/ogg/aac/opus） | 弹窗 `<audio>` 播放 |
| **文本/代码**（txt/log/conf/json/yaml/…） | 🆕 0.8.5：**双击直接进 ACE 编辑器**（语法高亮 + 编码切换 + 保存）——不再先预览再点编辑 |
| **Markdown**（md/markdown） | 🆕 0.8.5：**marked 渲染** + **DOMPurify 消毒**（内联样式表） |
| **CSV/TSV** | 🆕 0.8.5：表格化（引号/转义解析） |
| **Excel**（xlsx/xls） | 🆕 0.8.5：**SheetJS 前端解析** → 表格 + **多 sheet 下拉切换**（限 500 行） |
| **SQLite**（db/sqlite3） | 🆕 0.8.5：后端 SQLite3 **只读** + 分页（100 行/页）+ 表下拉（限 50MB，参数化表名） |
| **压缩包**（zip/tar/gz/tgz/bz2/xz/txz） | 🆕 0.8.5：**只读列表**（`unzip -l` / `tar -tzf`，限 2000 条，不解压不落地） |
| **PDF** | 🆕 0.8.5：浏览器原生 viewer（iframe + nginx 直链） |
| 未知类型 | 弹窗提示"无法预览" + 下载按钮（不再静默下载） |

> **查看器弹窗加宽**（0.8.5）：查看器类弹窗 `ex-modal-wide`（min(1100px, 94vw)），操作弹窗保持 640px；内容区 `ex-viewer` 独立背景/边框/圆角。
>
> **vendor 本地库**（0.8.5）：marked / Prism（含子语言）/ DOMPurify / SheetJS 打包进插件（~1MB），**懒加载**（loadVendor 首次用到才注入 script），无外网依赖。

> 说明：官方 EZView.js 保留但未接入（jQuery 插件用法繁琐），预览走自建弹窗（原生 img/video/audio + nginx 直链）。

### 5.4 导航与搜索 ✅

| 功能 | 说明 |
|------|------|
| 鼠标侧键 | 侧键1（button 3）后退 / 侧键2（button 4）前进；**capture 捕获阶段 + mousedown/mouseup/auxclick 三事件全拦截**（0.7.4，`addEventListener(type, fn, true)` + preventDefault + stopPropagation；冒泡阶段拦截太晚仍会触发浏览器后退）；全局拦截因 AExplorer 为独立页面，不影响其他页面 |
| 快捷键 | F5 刷新 / F2 重命名 / Delete 删除 / Backspace 上级 / Alt+←→↑ / Ctrl+A / Ctrl+F / Ctrl+1/2 |
| **首字母选中** | 🆕 0.8.5：键盘输入英文首字母 → 选中当前目录首个匹配项（Windows 资源管理器风格 type-ahead）；800ms 窗口内连续输入拼前缀（`mu`→MusicBot）；重复键循环跳到下一个匹配（g→gitea→grafana）；大小写不敏感；自动滚动定位到可视区；输入框聚焦/组合键（Ctrl/Meta/Alt）不触发 |
| 前端过滤 | 当前目录即时过滤（fallback） |
| **后端递归搜索** | `mode=search`：深度 ≤3、目录数 ≤400、忽略隐藏目录、validdir 白名单；结果含完整路径 + 来源标注 `↳ 子目录` |
| 搜索操作 | 搜索结果选中/打开/右键可用（`selectedItems` 搜索模式从 state.sorted 取）；右键"打开所在目录"跳父目录 |

### 5.5 星标与快捷 ✅

| 功能 | 说明 |
|------|------|
| 快捷区 | ⚡ User Shares / Flash（侧边栏顶部，0.5.1 上移） |
| **星标区** | ⭐ 右键"添加星标"，侧边栏展示，右键移除；localStorage `aexplorer.starred` 持久化（零后端写路径） |

### 5.6 右键解压 ✅（0.6.7）

| 项 | 说明 |
|----|------|
| 支持格式 | zip（unzip）/ tar.gz / tgz / tar（tar） |
| 入口 | 压缩包右键"解压到当前目录"（`isArchive` 按扩展名识别） |
| 后端 | `mode=extract`：`/usr/bin/unzip -o -q` / `/usr/bin/tar -xzf/-xf`（绝对路径 + escapeshellarg），解压到当前目录 |
| 安全 | file/target 均过 ex_validdir 白名单 + realpath 防穿越 |

### 5.7 拖拽上传 ✅（0.6.7 增强）

| 项 | 说明 |
|----|------|
| 单文件拖拽 | 20MB 原始二进制分片（官方协议，XHR + CSRF，断点续传 + 取消） |
| **文件夹拖拽** | `webkitGetAsEntry()` 递归遍历（Chrome/Edge；Firefox 降级文件拖拽）；`filter(Boolean)` 防 null entry 崩溃（0.6.8） |
| **子目录重建** | 上传前 `mode=mkdir` 递归创建相对路径父目录（过滤 `.`/`..` 防穿越） |
| 队列 | 串行上传（防并发打爆），每文件分片进度 + 队列总进度（N/M） |

### 5.8 快捷键

| 按键 | 功能 |
|------|------|
| F5 | 刷新 |
| F2 | 重命名 |
| Delete | 删除 |
| Ctrl+F | 搜索 |
| Ctrl+A | 全选 |
| Enter | 打开 |
| Backspace | 上级目录 |
| Alt+← / → / ↑ | 后退 / 前进 / 上级 |
| 鼠标侧键1 / 2 | 后退 / 前进 |
| Ctrl+1 / 2 | 列表 / 大图标视图（detail 已移除） |

### 5.9 内嵌终端 ✅（0.8.5）

右键**空白处** → 「🖥 在此打开终端」→ 页面底部滑出**内嵌面板**（非新 tab/弹窗），xterm.js 全功能终端，打开即定位当前目录。

| 项 | 说明 |
|----|------|
| 后端 | `mode=term`：`ex_validdir` 白名单 → md5(目录) 作 tag → 幂等启动 ttyd（进程在跑则复用） |
| 多实例 | 每目录独立 socket `/var/run/aexplorer-<hash>.sock`，`ttyd -o` 单客户端、断开/关闭面板自动退出，互不干扰 |
| 代理 | **零配置**：nginx 通配 `/webterminal/<tag>/` → `unix:/var/run/<tag>.sock`（unraid 自带），登录保护 auth_request 302 已验证 |
| cwd 落位 | 两个脚本文件（无引号嵌套）：① rc 文件 `source /etc/profile` 后 `cd 目标`（覆盖 profile 第 5 行 `cd $HOME`）；② 启动脚本外层 `cd` → `exec ttyd`（继承 cwd）→ 子进程 `bash --rcfile` |
| 启动就绪 | PHP 轮询 socket 存在（≤2s）才返回 ok（否则 iframe 首载 502）；前端 iframe onerror 自动重试一次 |
| 安全 | 目录白名单 + 登录保护 + root 会话（与官方 Terminal 同权限）+ 脚本/socket 在 /var/tmp、/var/run（重启自清，无 flash 写入） |
| 关闭 | ✕ 关闭 → iframe 置空（about:blank）→ ttyd `-o` 断连自动退出 → socket 残留无碍（下次启动前 unlink） |

---

## 6. 数据流

### 6.1 列表加载
```
前端 navigate(path)
  → POST /plugins/aexplorer/include/Browse.php {mode:list_json, dir} + X-CSRF-Token
  → PHP: validdir() 校验 → find -L + \0 解析（官方方式）
  → 返回 JSON {items, count, total_size, disk}
  → 前端排序 → 虚拟滚动渲染
```

### 6.2 递归搜索
```
前端 doSearch(q)
  → POST Browse.php {mode:search, dir, q, depth:3}
  → PHP: ex_validdir 白名单 → 递归 scandir（深度≤3、目录≤400、跳过隐藏）
  → 返回 JSON {items:[{name,path,is_dir,size,mtime,_src}]}
  → 前端渲染 + 来源标注（失败回退前端一层过滤）
```

### 6.3 文件操作
```
前端 doCopy() 弹窗 → 确认
  → POST /webGui/include/Control.php {mode:file, action:3, source, target}
  → 系统写 /var/tmp/file.manager.active（JSON）
  → 系统 nchan/file_manager 读取执行 rsync（后台）
  → publish('filemanager') 推送进度
  → 前端 nchan 订阅 /sub/filemanager 实时更新进度条
  → done 或 8s 兜底 → refresh()
```

### 6.4 上传（含文件夹）
```
前端 upload.js（拖拽/选择 → 队列串行）
  文件夹：collectDropItems（webkitGetAsEntry 递归）→ [{file, rel}]
  → 子目录：POST Browse.php {mode:mkdir, dir, sub} 递归建目录（过滤 ..）
  → 每文件：POST /webGui/include/Control.php?mode=upload&file&start&cancel
  → 系统 FileUpload.php 追加写入（自动同名避让）
  → 前端 XHR upload progress 显示真实进度
```

### 6.5 解压
```
前端 doExtract()（右键压缩包）
  → POST Browse.php {mode:extract, file, target}
  → PHP: ex_validdir 校验 → exec('/usr/bin/unzip|tar -x...') 绝对路径 + escapeshellarg
  → 返回 {ok} → 刷新列表
```

---

## 7. 安全设计

| 风险 | 对策 |
|------|------|
| 路径穿越 | 官方 `validdir()`：realpath 后仅允许 `/mnt`、`/boot` 前缀（extract/mkdir 同样校验） |
| 非法文件名 | 官方 `validname()`：dirname realpath 校验 + basename 过滤 |
| 磁盘/user share 混用 | 官方前端校验：禁止同时操作 disk 和 user share |
| 危险操作 | 删除弹二次确认；大操作走后台可取消（action 99） |
| 越权 | nginx `auth_request` 全局强制登录（/plugins 同样受保护）+ **CSRF：unraid 强制校验 /plugins/ PHP 请求，前端全部携带 X-CSRF-Token** |
| 上传中断 | 分片断点续传 + 取消（cancel 参数）+ 临时文件清理 |
| XSS | 列表/搜索/属性渲染用 `esc()`/`escAttr()` 转义；进度条用 textContent |
| 递归搜索拖垮系统 | 深度 ≤3 + 目录数 ≤400 + 忽略隐藏目录（PHP 扫描上限） |
| 解压命令注入 | unzip/tar 绝对路径 + escapeshellarg + validdir 白名单 |
| mkdir 路径穿越 | sub 相对路径过滤 `.`/`..`，拼接后仍落白名单内 |
| 函数冲突 | JSON API 全部 `ex_` 前缀，官方 HTML 模式保留原名（独立加载不重名） |
| CSS 污染 | 全部规则 `#explorer-app` 前缀（0.4.7 起，压过官方 reset 特异性；`.ex-marquee` 全局例外） |

## 7.5 侵入性检查结论（2026-08-05，0.7.4 复核）

独立审计（不依赖开发过程结论，逐项实测 Unraid 系统机制）：

**✅ 无侵入、无冲突、无系统损失风险**

| 维度 | 验证结果 |
|------|---------|
| 路由 | `AExplorer.page` 独立注册为顶部 tab（Tasks:70），不覆盖系统 `$site['Browse']` |
| 安装面 | .plg 只操作 `/boot/config/plugins/aexplorer/` + `/usr/local/emhttp/plugins/aexplorer/`，卸载只删自己 |
| 进程 | 无自带 nchan 脚本，**依赖 unraid 页面框架经 `Nchan="file_manager"` 属性拉起系统 file_manager**（0.6.9 修复），无额外进程 |
| 系统文件 | PHP 端对系统零写入；**唯一写路径 = extract/mkdir（用户白名单目录内，属插件功能语义）**；写操作全部走系统 Control.php；星标仅 localStorage |
| 鉴权 | nginx `auth_request /auth-request.php` 全局强制，未登录 401→/login |
| 路径 | `ex_validdir` 白名单仅 `['mnt','boot']` + realpath 防穿越 |
| 变量作用域 | 页面 eval 在全局作用域，`$var`/`$docroot` 可用（template.php 注入） |
| CSRF | `/plugins/` 下 PHP 由 unraid 强制校验，前端全部携带 X-CSRF-Token；官方 Control.php 不校验（与官方一致） |
| 媒体预览 | 纯前端 `<video>/<audio>/<img>` + nginx 直链（range 播放），零新增后端 |
| 显示名/图标 | 插件列表显示名取插件目录 README.md（0.4.5 修复），icon 用 images/aexplorer.png |

**0.8.3 新增面复核**：
- 日志系统写路径 = 插件自身目录 `/boot/config/plugins/aexplorer/logs/`（1MB 轮转上限 2MB，flash 磨损可接受）；权限 0600 仅 root 可读；换行注入已转义
- `mode=ensure_fm` 幂等启动系统官方 file_manager 脚本（pgrep 检查 + nohup，不重复启动、不新增自定义进程）
- 操作记录内容为「时间 + 操作名 + 路径」，不含密码/文件内容

**历史风险修复记录**：
- doCalc 响应含文件名直接插入 modal 的 XSS 风险 → **0.6.0 属性面板改为表格化 + `esc()` 转义，已消除**
- 插件 CSS 被官方 reset 清零（弹窗 61px 挤压）→ 0.4.7 全规则 `#explorer-app` 前缀，已修复
- 面包屑闭包导致点击跳转失效 → 0.4.8 每级独立绑定，已修复
- 删除/复制/移动后台任务间歇失效 → **0.6.9 补 `Nchan="file_manager"` 页面属性，已修复**
- 文件夹打包下载（0.6.4/0.6.5）php-fpm body 解析异常 → **0.6.6 整体撤回**（教训：passthru 流式 + fastcgi 缓冲不可靠，临时文件方案也受 body 层影响；该功能永久放弃；**0.8.4 以 nginx 静态直出方案重新实现并验证**（打包到插件目录 download/ + auth 保护 + 三层清理，绕开 php-fpm 输出））

---

## 8. 目录结构

```
aexplorer/
├── README.md
├── docs/DESIGN.md              # 本文档（中文）
├── docs/DESIGN.en.md           # 英文版（翻译）
├── plugin/
│   ├── aexplorer.plg     # 插件安装描述（含 SHA256，releaseURL 与 tag 严格一致）
│   └── aexplorer-local.plg  # 本地安装版（无 URL/pluginURL，SHA256 预置，离线安装）
├── source/usr/local/emhttp/plugins/aexplorer/
│   ├── AExplorer.page             # 主页面（顶部 tab，Menu="Tasks:70"，Nchan="file_manager"，PHP 注入 AE_USERS）
│   ├── include/
│   │   └── Browse.php          # 官方 find -L 逻辑 + list_json/tree_json/search/extract/mkdir/ensure_fm/log/readlog/clearlog/pack/file_read/sqlite/archive_list/term（ex_ 前缀）
│   ├── javascript/
│   │   ├── explorer.js         # 🆕 主引擎（导航/虚拟滚动/媒体/查看器/终端面板/星标/属性/框选/侧键/fitToViewport）
│   │   ├── dfm.js              # 🆕 系统 Control.php 协议封装（含 CSRF header）
│   │   ├── contextmenu.js      # 🆕 右键菜单
│   │   ├── upload.js           # 🆕 20MB 分片上传 + 文件夹拖拽（webkitGetAsEntry）
│   │   ├── editor.js           # 🆕 ACE 封装（mode:edit/save + 编码切换）
│   │   └── EZView.js           # 官方图片查看（保留未用）
│   ├── vendor/                 # 🆕 0.8.5 本地库（懒加载，无外网依赖）：marked/Prism(+子语言)/DOMPurify/SheetJS
│   ├── css/explorer.css        # 🆕 Windows 11 主题（#explorer-app 作用域 + .ex-marquee 全局）
│   └── logs/（运行时）            # 运行期生成：aexplorer-ops.log + aexplorer.log（/boot/config/plugins/aexplorer/logs/）
│   ├── README.md               # 插件列表显示名/描述数据源（h4 标题）
│   └── images/aexplorer.png
└── build.sh                    # 打包脚本（构建 txz + 注入 SHA256）
```

---

## 9. 打包与安装

```bash
./build.sh
# 产物：plugin/aexplorer-<version>.txz + plugin/aexplorer.plg（SHA256 已注入）

# Unraid 7.0+ 安装
installplg /boot/config/plugins/aexplorer/aexplorer.plg
# 或 plugin install /boot/config/plugins/aexplorer/aexplorer.plg（7.3.x 无 installplg 时）
```

**URL 安装（0.8.4 起，仓库公开 + txz 已提交）**：插件页「安装插件」输入
```
http://10.10.10.6:8300/bot/aexplorer/raw/branch/main/plugin/aexplorer.plg
```
版本不同走升级路径（不撞同版本拒绝）。升级流程（已验证）：预下载 plg+txz → SHA256 比对 → `plugin install` → 浏览器验证。

**重装注意事项**（0.7.0 实测踩坑）：
- **同版本重装被拒**：`plugin: not reinstalling same version`（脚本比较已装版本 == 目标版本直接退出，**不删任何目录**）
- **目录被清空 = 卸载（remove 段）执行过**：remove 段 `rm -r /usr/local/emhttp/plugins/aexplorer` + `rm -r /boot/config/plugins/aexplorer`
- **同版本想重装**：`plugin install xxx.plg --force`（跳过版本检测）；或删 `/var/log/plugins/aexplorer.plg` 安装记录后 install（视为全新）；**不要先卸载再装同版本**（卸载删目录 + 记录残留 → 拒绝安装 → 页面打不开）

---

## 10. 里程碑

- [x] M1 调研：确认 Unraid 7 内置版与插件版差异
- [x] M2 合入内置版基线（Browse/Control/nchan/上传/编辑协议）
- [x] M3 后端：list_json / tree_json（复用官方 find -L）
- [x] M4 前端：虚拟滚动 + Windows 11 UI + 系统协议对接
- [x] M5 深度审计：重命名 AExplorer + 修复冲突（页面覆盖/nchan 竞争/函数重名/CSRF）+ 侵入检查
- [x] M6 真机安装验证（Unraid 7.3.2，0.4.2→0.6.2 全流程升级验证）
- [x] M7 打磨：CSRF 强制校验适配 / CSS 作用域 / 面包屑 / fmtSize / 树布局 / 快捷区上移
- [x] M8 功能扩展：媒体打开（翻页）/ 侧键导航 / 星标 / 后端递归搜索 / 属性面板 / 编辑器编码切换
- [x] M9 工具链与修复：文件夹下载尝试与撤回（0.6.4-0.6.6）/ 解压 / 拖拽上传文件夹 / 缩略图（0.6.7 加 0.6.9 撤）/ Nchan 消费端修复 / owner 下拉 / 操作后自动刷新 / 鼠标框选 / 侧键 capture 拦截 / footer 自适应（0.7.0-0.7.4）

---

## 11. 移动端适配 ✅（0.7.6 实现 + 0.7.7 修正）

**方案**：纯前端响应式 + 触屏交互适配（零后端、零系统侵入）。
**关键前提**：AExplorer.page 加 `<meta name="viewport" content="width=device-width, initial-scale=1">`（unraid 页面无 viewport meta，手机访问按 980px 虚拟宽度缩放）。

### 布局（CSS media query ≤768px）

- [x] 工具栏折叠：仅保留 新建/上传/搜索/刷新 + `⋯` 更多弹出
- [x] 左侧树隐藏为 ☰ 汉堡抽屉（滑出覆盖层 + 遮罩点击关闭）
- [x] 文件列表单列（名称 + 大小），隐藏属主/权限/时间/位置列
- [x] 行高 33px → 44px（触屏最小可点区域）
- [x] 面包屑保留（min-width 90px + 横向滑动，0.7.7）
- [x] 大图标视图触屏友好，默认仍列表
- [x] 媒体预览/编辑器 modal 全屏化

### 交互（JS 触屏检测 `ontouchstart`）

- [x] 单击直接打开（IS_MOBILE 按宽度判断，DevTools 模拟与真机一致）
- [x] 长按 1500ms 触发右键菜单（自定义 touch 计时；iOS Safari 长按不触发 contextmenu 已自实现；0.8.6 调长防误触）
- [x] 框选禁用（触屏）
- [x] 侧键/键盘快捷键触屏自然失效
- [x] 上传走按钮（`<input file>` 原生支持）

### 验证

- [x] DevTools 移动模拟（375×667 / 390×844）— 0.7.6 已实测（28 项 PASS）
- [ ] 真机浏览器访问 http://10.10.10.6/AExplorer（Android Chrome + iOS Safari）— 待做
- [ ] 文件操作全链路手机端验证 — 待做

---

## 12. 变更历史

| 版本 | 内容 |
|------|------|
| 0.8.7 | 侧边栏树双击：展开/收缩下级并打开目录（再双击收缩，与单击导航、三角折叠独立共存） |
| 0.8.6 | 拖放操作（目录行/面包屑/地址栏/侧边栏树 → 复制/移动/取消三选弹窗）+ 侧边栏树交互拆分（三角=展开折叠，名字=打开，双击=展开/收缩并打开）+ 移动端全屏按钮（Fullscreen API + iOS CSS 回退）+ 排序循环按钮（名称→时间→大小固定降序）+ header 百分比化 + 操作后自动刷新修复 + 树拖放统一三选弹窗（修复单文件直移/多文件不触发） |
| 0.8.5 | 扩展查看器（文本/代码直开编辑器 + Markdown 渲染 + CSV 表格 + Excel 多 sheet + SQLite 只读分页 + 压缩包列表 + PDF 内联 + 视频编码回退；vendor 本地库懒加载）+ 查看器弹窗加宽 + **内嵌终端**（右键空白处 → 底部面板，ttyd 多实例 + rcfile cwd 落位）+ **首字母选中**（type-ahead：前缀匹配/重复键循环/滚动定位） |
| 0.8.4 | 文件夹打包下载（nginx 直出 + 三层清理）+ 状态栏磁盘统计修复 + 可用百分比 + 弹窗 i18n 补全 + 排序箭头 |
| 0.8.3 | 复制修复（closeModal 后读 DOM 抛异常）+ 操作日志修复（runAction 函数体外）+ 同目录校验 + ensure_fm 消费端自愈 + 日志系统（1MB 轮转/footer 双按钮）+ 弹窗点外部关闭 + detail 视图移除 |
| 0.8.2 | 网格视图选中样式（圆角蓝框替代左侧条） |
| 0.8.1 | 修复路径栏重复占位文字（address-bar 改 data-i18n-title） |
| 0.8.0 | 修复 i18n 图标按钮文字化（data-i18n-title 只翻译 tooltip） |
| 0.7.9 | 国际化（i18n）：unraid 会话语言注入 AE_LOCALE + 前端 I18N 字典 + t()，页面/工具栏/右键菜单/弹窗/状态栏/上传/编辑器全量文案双语（中/英）；README 精简（详细移入本文档）+ Powered by AI 标注 |
| 0.7.8 | 安全加固（AE_USERS JSON_HEX_TAG）+ 安全审计结论（无漏洞）；Gitea 仓库改私密 |
| 0.7.7 | 移动端修正：地址栏保留（min-width 90px + 面包屑横向滑动）、模态框按钮撑满、媒体 56vh、IS_MOBILE 放宽为仅宽度（DevTools 模拟一致） |
| 0.7.6 | 移动端适配（响应式+触屏交互）：viewport meta、工具栏折叠 + ⋯ 更多、树汉堡抽屉、单列列表、行高 44px、单击打开、长按菜单、模态全屏 |
| 0.7.5 | 文档全面修订（对齐 0.7.4 全功能）；DESIGN 新增移动端适配 TODO |
| 0.7.4 | 修复侧键仍触发后退（capture 阶段 + 三事件全拦截） |
| 0.7.3 | 内容区与 footer 自适应（实测顶部偏移 + 45px 底部留白） |
| 0.7.2 | 修复选框不可见（CSS 前缀）；选中行强调条 + 相邻分隔 |
| 0.7.1 | 鼠标框选（空白区拖拽矩形，支持虚拟滚动/grid/Shift 追加） |
| 0.7.0 | 属主下拉选择；操作后自动刷新（8s 兜底） |
| 0.6.9 | 移除缩略图；修复删除/复制/移动失效（Nchan=file_manager 消费端） |
| 0.6.8 | 修复拖拽上传 null entry 崩溃（降级文件上传） |
| 0.6.7 | 右键解压（zip/tar.gz）+ 拖拽上传文件夹（webkitGetAsEntry） |
| 0.6.6 | 撤回文件夹打包下载（php-fpm body 解析异常，功能不可用） |
| 0.6.5 | 打包下载重构：临时文件 + readfile（未解决，0.6.6 撤回） |
| 0.6.4 | 文件夹打包下载（tar.gz，<1G 限制）→ 0.6.6 撤回 |
| 0.6.3 | 文档全面更新（对齐 0.6.2 全功能，清除过期内容） |
| 0.6.2 | 侧键全局拦截；图片查看器翻页；编辑器编码切换 |
| 0.6.1 | 侧键改 mousedown+preventDefault（auxclick 无法阻止浏览器历史导航） |
| 0.6.0 | 媒体打开/侧键/星标/后端递归搜索/属性面板（替换计算） |
| 0.5.2 | 修复 F2 重命名无效 |
| 0.5.1 | 搜索下钻一层；快捷区上移 |
| 0.5.0 | 树展开改垂直布局（flex-wrap） |
| 0.4.8 | 面包屑点击跳转修复；大小单位自动（B/KB/MB/GB） |
| 0.4.7 | 修复官方 CSS 覆盖（全部规则加 #explorer-app 前缀） |
| 0.4.6 | 插件列表图标/字体对齐 |
| 0.4.5 | 插件列表显示名修复（README.md 为数据源） |
| 0.4.4 | 注册顶部导航 tab（Tasks:70） |
| 0.4.3 | apiPost 补 CSRF（unraid 强制校验 /plugins/ PHP） |
| 0.4.2 | ace 改用官方内置资源，txz 925K→37K |
| 0.4.1 | CSRF 纵深防御 + 下载行为对齐官方 |
| 0.4.0 | 全新 AExplorer 前端（重命名 unraid-explorer） |

---

**状态：v0.8.8-dev · 2026-08-08**
