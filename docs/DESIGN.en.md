# 🦐 AExplorer — Full-Featured Design Document

**[中文](DESIGN.md) | [English](DESIGN.en.md)**

> A file manager rebuilt on top of **Unraid 7 built-in Dynamix File Manager (webGui kernel version)**
> Core approach: **keep all official backend mechanisms; rewrite the frontend UI in Windows 11 Explorer style**
> Design goals: **full-featured + modern visuals + intuitive operation + deep compatibility with the official kernel**

---

## 1. Positioning & Naming

| Item | Value |
|----|----|
| Plugin name | `aexplorer` (unified with the repo name and URI paths) |
| Display name | AExplorer |
| Menu location | **Top navigation tab** (`Menu="Tasks:70"`, between Docker 60 and Apps 80; since 0.4.4, previously a Main submenu) |
| Upstream | [unraid/dynamix → source/file-manager](https://github.com/unraid/dynamix/tree/master/source/file-manager) |
| Kernel version | Unraid 7.0+ webGui built-in version (2026 update) |
| License | GPL v2 (official copyright notices retained) |
| Install directory | `/usr/local/emhttp/plugins/aexplorer/` |
| Page URI | `/plugins/aexplorer/...`; standalone page route `/AExplorer` |
| Minimum requirement | **Unraid 7.0+** (depends on the built-in webGui files) |

> ⚠️ **The nchan channel `/sub/filemanager` is an Unraid system-level configuration** (nginx `/sub/` prefix + publish.php publisher), unrelated to the plugin directory; **it must not be renamed**, otherwise background-task progress cannot be subscribed to.
>
> ⚠️ **The unraid webGui enforces CSRF validation on PHP requests under `/plugins/`** (verified on real hardware in 0.4.3): POSTs missing `X-CSRF-Token`/`csrf_token` return an empty response and log `error: <file> - missing csrf_token`. The official `Control.php` under `/webGui/` does **not** validate (consistent with official Browse behavior), yet the plugin still sends the token everywhere as defense in depth.
>
> ⚠️ **The `Nchan="file_manager"` page attribute is required** (fixed in 0.6.9): the official Browse.page carries it, and the unraid page framework auto-spawns the `webGui/nchan/file_manager` consumer process when opening the page; without it, background tasks such as delete/copy/move get queued with **nobody consuming them** (intermittent failures).

---

## 2. Background & Motivation

Since Unraid 7.0, the official Dynamix File Manager plugin was **merged into the webGUI kernel** (`/usr/local/emhttp/webGui/`), making the standalone plugin version (discontinued in 2023) redundant. Official release notes:

> "The Dynamix File Manager, GUI Search, and Unlimited Width Plugin plugins are now built into Unraid."

Changes from the old plugin version to the built-in version:
- **Operation protocol migration**: `plugins/.../FileManager.php` (plain text) → **system `webGui/include/Control.php` (mode:file, JSON + task queue)**
- **List parsing upgrade**: stat pipe → **find -L + \\0 separated** (supports newline-containing filenames, symlinks, and broken-link detection)
- **Upload upgrade**: 2MB base64 → **20MB raw binary chunks** (XHR + CSRF)
- **Background task upgrade**: nchan script 262 → **733 lines** (rsync progress sampling, ETA calculation)
- **Component split**: FileTree.php / FileUpload.php extracted into separate files

**Value of this project**: the official kernel UI is still the old jQuery table and does not address the pain points of "dated looks + large-directory lag". This project keeps the kernel backend intact and rewrites the frontend as Windows 11 style + virtual scrolling.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Unraid WebGUI (PHP + nginx + nchan)                              │
│                                                                  │
│ ┌─ Frontend (this project) ────┐                                 │
│ │ explorer.js  engine /        │                                 │
│ │              virtual scroll / │                                │
│ │              media / starred / │                               │
│ │              marquee selection │                               │
│ │ dfm.js       system protocol │                                 │
│ │ contextmenu.js context menu  │                                 │
│ │ upload.js    20MB chunks /   │                                 │
│ │              folder drag-drop │                                │
│ │ editor.js    ACE + encoding  │                                 │
│ │ css/explorer.css  Win11 theme │                                │
│ └──────────────────────────────┘                                 │
│ │ fetch / POST (all with X-CSRF-Token)                           │
│                                                                  │
│ ┌─ Data source (this project) ─┐                                 │
│ │ plugins/aexplorer/include/   │                                 │
│ │ Browse.php = official        │                                 │
│ │   find -L logic +            │                                 │
│ │   list_json / tree_json /    │                                 │
│ │   search / extract / mkdir / │                                 │
│ │   ensure_fm / log / pack /   │                                 │
│ │   file_read / sqlite /       │                                 │
│ │   archive_list / term        │                                 │
│ └──────────────────────────────┘                                 │
│                                                                  │
│ ┌─ System kernel (official) ───┐                                 │
│ │ webGui/include/Control.php   │                                 │
│ │   mode:file op protocol /    │                                 │
│ │   mode:edit / mode:save /    │                                 │
│ │   mode:calc / mode:upload    │                                 │
│ │ webGui/nchan/file_manager    │                                 │
│ │   (733 lines)                │                                 │
│ └──────────────────────────────┘                                 │
│ │ writes /var/tmp/file.manager.*                                 │
│ ▼                                                                │
│ /sub/filemanager  nchan WebSocket                                │
│   real-time progress                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Zero duplication of operations**: copy/move/delete/permissions etc. talk directly to the system `Control.php` (mode:file), behaving exactly like the official built-in version; official logic is not copied
2. **Lightweight data-source extension**: JSON endpoints (list_json / tree_json / search / extract / mkdir / ensure_fm / log / pack / file_read / sqlite / archive_list / term) are added to the plugin own Browse.php (reusing the official find -L parsing + validdir validation); the official HTML rendering mode is retained
3. **Complete frontend rewrite**: jQuery table → native JS virtual scrolling + Windows 11 style (no new dependencies; ACE uses the official built-in)
4. **Dual progress channels**: prefer the nchan WebSocket (official); fall back to polling `/var/tmp/file.manager.status` when unavailable
5. **Security follows the official approach**: `validdir()` path whitelist (only `/mnt`, `/boot`) to prevent directory traversal
6. **CSS scoping**: all rules are prefixed with `#explorer-app` (ID specificity beats the official reset — the `:where(:not(.unapi *))`/reset in the official `default-base.css` zeroes out the plugin padding/margin; fixed in 0.4.7. The only exception: the `.ex-marquee` selection overlay is mounted on `document.body`, so its selector carries no prefix)
7. **Bounded recursive search**: depth ≤3 / directory count ≤400 / hidden directories ignored, to prevent full-disk scans from bogging down PHP
8. **Background task consumer**: AExplorer.page must carry the `Nchan="file_manager"` page attribute (0.6.9) so the unraid page framework spawns the system file_manager process; **0.8.3 adds ensure_fm self-healing** — before submitting any background task (delete/copy/move/owner/permissions), the frontend calls `mode=ensure_fm` (an idempotent pgrep check in Browse.php that nohups the official script when no process is running), fixing tasks that get stuck when the consumer exits while the page is already open
9. **Auto-refresh fallback after operations**: runAction forces a refresh after an 8-second timeout (0.7.0) — for fast tasks like delete/permissions/owner, the nchan done message can be published before the subscription is established, leaving the list unrefreshed
10. **Side-button interception**: intercepted in the capture phase + all three events mousedown/mouseup/auxclick (0.7.4) — intercepting at the bubble phase is too late; the browser decides side-button navigation early during event dispatch
11. **Auto-fitting content height**: fitToViewport measures the actual top offset; height = viewport − top − 45px bottom margin (0.7.3) — the footer is an in-flow element, so tracking its position would create a circular dependency
12. **Logging system (0.8.3)**: operation log `aexplorer-ops.log` + app log `aexplorer.log`, stored in the plugin directory `/boot/config/plugins/aexplorer/logs/`, 1MB rotation (renamed to .1 when over the limit), mode 0600, newline-injection protected; the footer has two buttons opening a dialog to view (last 64KB) / refresh / clear

---

## 4. URI Hierarchy

| URI | Type | Purpose |
|-----|------|------|
| `/plugins/aexplorer/AExplorer.page` | Page | Main browser page (.page route, top tab `Menu="Tasks:70"`, **`Nchan="file_manager"`** attribute) |
| `/plugins/aexplorer/include/Browse.php` | API | 🆕 `mode=list_json` directory listing / `mode=tree_json` directory tree / `mode=search` recursive search / `mode=extract` extraction / `mode=mkdir` recursive mkdir / `mode=ensure_fm` consumer self-healing / `mode=log`+`readlog`+`clearlog` log read/write/clear / `mode=pack` archive download / `mode=file_read` text read / `mode=sqlite` read-only paging / `mode=archive_list` archive listing / `mode=term` terminal (`ex_`-prefixed functions); official HTML rendering retained |
| `/plugins/aexplorer/css/explorer.css` | Static | Windows 11 theme (`#explorer-app` scope + global `.ex-marquee`) |
| `/plugins/aexplorer/javascript/*.js` | Static | Frontend modules (explorer/dfm/contextmenu/upload/editor/EZView) |
| `/webGui/javascript/ace/` | System resource | ACE editor (official built-in 1.15.2, no longer bundled) |
| `/plugins/aexplorer/images/aexplorer.png` | Static | Menu/plugin-list icon |
| **System integration** | | |
| `/webGui/include/Control.php` | System API | `mode:file` operation protocol / `mode:edit`/`save` editing / `mode:calc` calculation / `mode:upload` upload / `mode:read` task status / `mode:stop` cancel |
| `/sub/filemanager` | System channel | nchan WebSocket (background-task progress) |
| `/var/tmp/file.manager.{active,status,error,jobs,pid}` | System files | Task config/status/error/queue/pid |
| `/boot/config/plugins/aexplorer/logs/` | Plugin logs | `aexplorer-ops.log` operation log + `aexplorer.log` app log (1MB rotation .1, 0600) |
| `/webGui/include/Helpers.php` etc. | System dependency | Official helper functions/translations |

---

## 5. Feature List

### 5.1 File Browsing ✅

| Feature | Implementation |
|------|------|
| Directory tree navigation | Left-side tree with lazy-loaded subdirectories (`tree_json`), vertical layout (flex-wrap: child nodes wrap below the parent) |
| Breadcrumb navigation | Clickable top breadcrumbs (0.4.8 fixed a closure bug: each level binds its path independently) |
| Address bar | Editable; type a path and press Enter to jump straight there |
| File list | Multi-column: name / owner / permissions / size / mtime / location |
| View switching | List / large icons (Ctrl+1/2; the detail view was removed in 0.8.3 — it was identical to list) |
| Column sorting | Click column headers (name / owner / permissions / size / time) |
| Size units | Frontend `fmtSize` auto B/KB/MB/GB (no more backend thousands-separated unit-less values) |
| Disk space | Status bar shows free space + directory total size |
| **Virtual scrolling** | Only rows in the visible area are rendered (smooth with tens of thousands of files) |
| **Marquee selection** | 🆕 0.7.1: press and drag the left button on empty space to draw a rectangle (semi-transparent blue box); release to select the files inside; rectangle-intersection math is virtual-scroll compatible; Shift/Ctrl+drag appends; auto-scrolls at the edges; not triggered over scrollbar areas |
| Symlinks | Detected + target tooltip + broken links marked red |
| Newline filenames | find -L + \\0 separated; supported by the official 2026 version |

### 5.2 File Operations ✅ (system Control.php protocol)

| Operation | action |
|------|--------|
| New folder | 0 |
| Delete (directory/file) | 1 / 6 |
| Rename (directory/file) | 2 / 7 |
| Copy (directory/file) | 3 / 8 |
| Move (directory/file, rsync/mv) | 4/5 / 9/10 |
| Change owner | 11 (🆕 0.7.0 **dropdown**: /etc/passwd UID≥1000 + root + nobody; the page PHP read-only injects `window.AE_USERS`; the current owner is preselected) |
| Change permissions | 12 |
| Download | 13 |
| Properties (directory usage) | 14 (mode:calc) |
| Cancel task | 99 |

Supports a **task queue** (`task` parameter), executed in the background with real-time nchan progress (including rsync ETA).

**Auto-refresh after operations** (0.7.0): if no nchan done is received within 8 seconds of runAction submitting a task, `refresh()` is forced (re-entry guarded + clearTimeout cleanup; the error path also refreshes) — fast tasks can publish their nchan message before the subscription is established.

### 5.3 Opening & Preview ✅

| Type | Behavior |
|------|------|
| Directory | Double-click to enter |
| Images (jpg/png/gif/webp/svg/bmp/ico) | Modal preview with **◀ previous / ▶ next paging** (image pool of the current context + N/M counter) |
| Video (mp4/webm/m4v/ogv/mov) | Modal `<video>` playback (native browser, nginx range direct link); **codec-unsupported error fallback** (hint to download and play locally) |
| Audio (mp3/flac/wav/m4a/ogg/aac/opus) | Modal `<audio>` playback |
| **Text / code** (txt/log/conf/json/yaml/…) | 🆕 0.8.5: **double-click opens the ACE editor directly** (syntax highlighting + encoding switching + save) — no more preview-then-edit |
| **Markdown** (md/markdown) | 🆕 0.8.5: **marked rendering** + **DOMPurify sanitization** (inline stylesheet) |
| **CSV/TSV** | 🆕 0.8.5: rendered as a table (quote/escape parsing) |
| **Excel** (xlsx/xls) | 🆕 0.8.5: **SheetJS frontend parsing** → table + **multi-sheet dropdown** (500-row limit) |
| **SQLite** (db/sqlite3) | 🆕 0.8.5: backend SQLite3 **read-only** + paging (100 rows/page) + table dropdown (50 MB limit, parameterized table names) |
| **Archives** (zip/tar/gz/tgz/bz2/xz/txz) | 🆕 0.8.5: **read-only listing** (`unzip -l` / `tar -tzf`, 2000-entry limit, no extraction, nothing written to disk) |
| **PDF** | 🆕 0.8.5: native browser viewer (iframe + nginx direct link) |
| Unknown types | Modal says "cannot preview" + a download button (no more silent downloads) |

> **Wider viewer modals** (0.8.5): viewer modals use `ex-modal-wide` (min(1100px, 94vw)); operation modals stay at 640px; the `ex-viewer` content area gets its own background/border/radius.
>
> **Local vendored libraries** (0.8.5): marked / Prism (incl. sub-languages) / DOMPurify / SheetJS ship inside the plugin (~1MB), **lazy-loaded** (loadVendor injects the script only on first use), zero external-network dependency.

> Note: the official EZView.js is kept but not wired up (awkward jQuery plugin usage); previews use custom modals (native img/video/audio + nginx direct links).

### 5.4 Navigation & Search ✅

| Feature | Description |
|------|------|
| Mouse side buttons | Side button 1 (button 3) back / side button 2 (button 4) forward; **all three events intercepted at the capture phase: mousedown/mouseup/auxclick** (0.7.4, `addEventListener(type, fn, true)` + preventDefault + stopPropagation; intercepting at the bubble phase is too late — the browser still navigates back); global interception is safe because AExplorer is a standalone page and does not affect other pages |
| Keyboard shortcuts | F5 refresh / F2 rename / Delete delete / Backspace parent / Alt+←→↑ / Ctrl+A / Ctrl+F / Ctrl+1/2 |
| **First-letter select** | 🆕 0.8.5: press an English letter to select the first matching item in the current directory (Windows Explorer-style type-ahead); consecutive keys within an 800ms window build a prefix (`mu` → MusicBot); repeating the same key cycles to the next match (g → gitea → grafana); case-insensitive; auto-scrolls to the target; not triggered inside inputs or with Ctrl/Meta/Alt combos |
| Frontend filtering | Instant filtering of the current directory (fallback) |
| **Backend recursive search** | `mode=search`: depth ≤3, directory count ≤400, hidden directories ignored, validdir whitelist; results include full paths + an origin marker `↳ subdirectory` |
| Search operations | Search results support select/open/context menu (`selectedItems` is read from state.sorted in search mode); right-click "Open containing folder" jumps to the parent directory |

### 5.5 Starred & Shortcuts ✅

| Feature | Description |
|------|------|
| Shortcut area | ⚡ User Shares / Flash (top of the sidebar; moved up in 0.5.1) |
| **Starred area** | ⭐ right-click "Add to Starred"; shown in the sidebar; right-click to remove; persisted in localStorage `aexplorer.starred` (zero backend write path) |

### 5.6 Right-Click Extraction ✅ (0.6.7)

| Item | Description |
|----|------|
| Supported formats | zip (unzip) / tar.gz / tgz / tar (tar) |
| Entry point | Right-click an archive → "Extract to current directory" (`isArchive` detects by extension) |
| Backend | `mode=extract`: `/usr/bin/unzip -o -q` / `/usr/bin/tar -xzf/-xf` (absolute paths + escapeshellarg), extracts to the current directory |
| Security | Both file/target pass the ex_validdir whitelist + realpath anti-traversal |

### 5.7 Drag-and-Drop Upload ✅ (enhanced in 0.6.7)

| Item | Description |
|----|------|
| Single-file drag-drop | 20MB raw binary chunks (official protocol, XHR + CSRF, resumable + cancelable) |
| **Folder drag-drop** | `webkitGetAsEntry()` recursive traversal (Chrome/Edge; Firefox falls back to file drag-drop); `filter(Boolean)` guards against null-entry crashes (0.6.8) |
| **Subdirectory rebuild** | before uploading, `mode=mkdir` recursively creates the relative-path parent directories (filters `.`/`..` to prevent traversal) |
| Queue | serial uploads (no concurrency overload), per-file chunk progress + overall queue progress (N/M) |

### 5.8 Keyboard Shortcuts

| Key | Function |
|------|------|
| F5 | Refresh |
| F2 | Rename |
| Delete | Delete |
| Ctrl+F | Search |
| Ctrl+A | Select all |
| Enter | Open |
| Backspace | Parent directory |
| Alt+← / → / ↑ | Back / forward / parent |
| Mouse side buttons 1 / 2 | Back / forward |
| Ctrl+1 / 2 | List / large-icon view (detail removed) |

### 5.9 Embedded Terminal ✅ (0.8.5)

Right-click **empty space** → "🖥 Open terminal here" → an **embedded panel** slides up at the bottom of the page (not a new tab/modal), full xterm.js terminal that opens directly in the current directory.

| Item | Description |
|------|------|
| Backend | `mode=term`: `ex_validdir` whitelist → md5(dir) as the tag → idempotent ttyd startup (reused if the process is already running) |
| Multi-instance | Per-directory socket `/var/run/aexplorer-<hash>.sock`; `ttyd -o` = single client, auto-exits on disconnect/panel close; instances never interfere |
| Proxy | **Zero config**: nginx wildcard `/webterminal/<tag>/` → `unix:/var/run/<tag>.sock` (built into unraid); login protection auth_request 302 verified |
| cwd placement | Two script files (no quoting nesting): ① rc file does `source /etc/profile` then `cd target` (overrides profile line 5 `cd $HOME`); ② launcher does outer `cd` → `exec ttyd` (inherits cwd) → child `bash --rcfile` |
| Startup readiness | PHP polls for the socket (≤2s) before returning ok (otherwise the first iframe load 502s); frontend iframe onerror auto-retries once |
| Security | Directory whitelist + login protection + root session (same privilege as the official Terminal) + scripts/sockets under /var/tmp, /var/run (cleared on reboot, no flash writes) |
| Close | ✕ closes → iframe blanked (about:blank) → ttyd `-o` exits on disconnect → leftover socket is harmless (unlinked before next start) |

---

## 6. Data Flow

### 6.1 List Loading
```
Frontend navigate(path)
  → POST /plugins/aexplorer/include/Browse.php {mode:list_json, dir} + X-CSRF-Token
  → PHP: validdir() check → find -L + \0 parsing (official method)
  → returns JSON {items, count, total_size, disk}
  → frontend sorts → virtual scrolling renders
```

### 6.2 Recursive Search
```
Frontend doSearch(q)
  → POST Browse.php {mode:search, dir, q, depth:3}
  → PHP: ex_validdir whitelist → recursive scandir (depth ≤3, dirs ≤400, skip hidden)
  → returns JSON {items:[{name,path,is_dir,size,mtime,_src}]}
  → frontend renders + origin markers (falls back to one-level frontend filtering on failure)
```

### 6.3 File Operations
```
Frontend doCopy() dialog → confirm
  → POST /webGui/include/Control.php {mode:file, action:3, source, target}
  → system writes /var/tmp/file.manager.active (JSON)
  → system nchan/file_manager reads it and runs rsync (background)
  → publish('filemanager') pushes progress
  → frontend subscribes to /sub/filemanager for real-time progress bar updates
  → done or 8s fallback → refresh()
```

### 6.4 Upload (incl. Folders)
```
Frontend upload.js (drag-drop/select → serial queue)
  folders: collectDropItems (webkitGetAsEntry recursion) → [{file, rel}]
  → subdirs: POST Browse.php {mode:mkdir, dir, sub} recursive mkdir (filters ..)
  → per file: POST /webGui/include/Control.php?mode=upload&file&start&cancel
  → system FileUpload.php appends writes (auto same-name avoidance)
  → frontend XHR upload progress shows real progress
```

### 6.5 Extraction
```
Frontend doExtract() (right-click on an archive)
  → POST Browse.php {mode:extract, file, target}
  → PHP: ex_validdir check → exec('/usr/bin/unzip|tar -x...') absolute paths + escapeshellarg
  → returns {ok} → refreshes the list
```

---

## 7. Security Design

| Risk | Mitigation |
|------|------|
| Path traversal | Official `validdir()`: after realpath, only `/mnt`, `/boot` prefixes allowed (extract/mkdir validated the same way) |
| Invalid filenames | Official `validname()`: dirname realpath check + basename filtering |
| Mixing disks/user shares | Official frontend check: forbids operating on disk and user share simultaneously |
| Dangerous operations | Second confirmation dialog for deletes; large operations run in the background and can be cancelled (action 99) |
| Unauthorized access | nginx `auth_request` enforces login globally (`/plugins` equally protected) + **CSRF: unraid enforces validation on /plugins/ PHP requests; the frontend sends X-CSRF-Token everywhere** |
| Interrupted uploads | Chunked resume + cancel (cancel param) + temp-file cleanup |
| XSS | List/search/properties rendering escaped with `esc()`/`escAttr()`; progress bars use textContent |
| Recursive search bogging down the system | depth ≤3 + directory count ≤400 + hidden directories ignored (PHP scan caps) |
| Extraction command injection | absolute unzip/tar paths + escapeshellarg + validdir whitelist |
| mkdir path traversal | `sub` relative path filters `.`/`..`; the joined result still stays inside the whitelist |
| Function collisions | All JSON APIs use the `ex_` prefix; official HTML mode keeps original names (loaded independently, no name clashes) |
| CSS pollution | All rules `#explorer-app` prefixed (since 0.4.7, beats the official reset specificity; `.ex-marquee` global exception) |

## 7.5 Intrusiveness Audit Conclusion (2026-08-05, 0.7.4 Re-review)

Independent audit (not relying on development-process conclusions; each item verified against the actual Unraid system mechanisms):

**✅ No intrusiveness, no conflicts, no risk of system loss**

| Dimension | Verification result |
|------|---------|
| Routing | `AExplorer.page` registered independently as a top tab (Tasks:70); does not override the system `$site['Browse']` |
| Install footprint | The .plg only touches `/boot/config/plugins/aexplorer/` + `/usr/local/emhttp/plugins/aexplorer/`; uninstall only removes itself |
| Processes | No bundled nchan script; **relies on the unraid page framework to spawn the system file_manager via the `Nchan="file_manager"` attribute** (fixed in 0.6.9); no extra processes |
| System files | PHP side writes nothing to the system; **the only write path = extract/mkdir (inside user-whitelisted directories, by plugin feature semantics)**; all write operations go through the system Control.php; starred items live only in localStorage |
| Authentication | nginx `auth_request /auth-request.php` enforced globally; unauthenticated 401 → /login |
| Paths | `ex_validdir` whitelist only `['mnt','boot']` + realpath anti-traversal |
| Variable scope | Page eval runs in global scope; `$var`/`$docroot` available (injected by template.php) |
| CSRF | PHP under `/plugins/` is enforced-validated by unraid; the frontend sends X-CSRF-Token everywhere; official Control.php does not validate (consistent with official behavior) |
| Media preview | Pure frontend `<video>/<audio>/<img>` + nginx direct links (range playback); zero new backend |
| Display name/icon | Plugin-list display name comes from the plugin directory README.md (fixed in 0.4.5); icon uses images/aexplorer.png |

**0.8.3 new-surface re-review**:
- Log system write path = the plugin own directory `/boot/config/plugins/aexplorer/logs/` (1MB rotation, 2MB max, acceptable flash wear); mode 0600, root-readable only; newline injection escaped
- `mode=ensure_fm` idempotently starts the official system file_manager script (pgrep check + nohup; no duplicate starts, no new custom processes)
- Operation-log entries are "time + operation name + path"; no passwords or file contents

**Historical risk-fix records**:
- doCalc response injected filenames straight into the modal (XSS risk) → **0.6.0 converted the properties panel to a table + `esc()` escaping; eliminated**
- Plugin CSS zeroed by the official reset (modal squeezed to 61px) → 0.4.7 prefixed all rules with `#explorer-app`; fixed
- Breadcrumb closure bug broke click navigation → 0.4.8 binds each level independently; fixed
- Delete/copy/move background tasks intermittently failing → **0.6.9 added the `Nchan="file_manager"` page attribute; fixed**
- Folder archive download (0.6.4/0.6.5) php-fpm body parsing failures → **0.6.6 fully reverted** (lesson: passthru streaming + fastcgi buffering is unreliable; the temp-file approach was also affected at the body layer; the feature was permanently abandoned; **0.8.4 re-implemented it via nginx static direct-serve** (pack to plugin download/ + auth protection + three-layer cleanup, bypassing php-fpm output))

---

## 8. Directory Structure

```
aexplorer/
├── README.md
├── docs/DESIGN.md              # this document (Chinese)
├── docs/DESIGN.en.md           # English translation
├── plugin/
│   ├── aexplorer.plg     # plugin install descriptor (SHA256 included; releaseURL strictly matches the tag)
│   └── aexplorer-local.plg  # local-install variant (no URL/pluginURL, SHA256 preset, offline install)
├── source/usr/local/emhttp/plugins/aexplorer/
│   ├── AExplorer.page             # main page (top tab, Menu="Tasks:70", Nchan="file_manager", PHP injects AE_USERS)
│   ├── include/
│   │   └── Browse.php          # official find -L logic + list_json/tree_json/search/extract/mkdir/ensure_fm/log/readlog/clearlog/pack/file_read/sqlite/archive_list/term (ex_ prefix)
│   ├── javascript/
│   │   ├── explorer.js         # 🆕 main engine (navigation/virtual scrolling/media/viewers/terminal panel/starred/properties/marquee/side buttons/fitToViewport)
│   │   ├── dfm.js              # 🆕 system Control.php protocol wrapper (incl. CSRF header)
│   │   ├── contextmenu.js      # 🆕 context menu
│   │   ├── upload.js           # 🆕 20MB chunked upload + folder drag-drop (webkitGetAsEntry)
│   │   ├── editor.js           # 🆕 ACE wrapper (mode:edit/save + encoding switching)
│   │   └── EZView.js           # official image viewer (kept, unused)
│   ├── vendor/                 # 🆕 0.8.5 local libraries (lazy-loaded, no external deps): marked/Prism(+sub-languages)/DOMPurify/SheetJS
│   ├── css/explorer.css        # 🆕 Windows 11 theme (#explorer-app scope + .ex-marquee global)
│   ├── logs/ (runtime)         # generated at runtime: aexplorer-ops.log + aexplorer.log (/boot/config/plugins/aexplorer/logs/)
│   ├── README.md               # plugin-list display name/description source (h4 title)
│   └── images/aexplorer.png
└── build.sh                    # packaging script (builds txz + injects SHA256)
```

---

## 9. Packaging & Installation

```bash
./build.sh
# Output: plugin/aexplorer-<version>.txz + plugin/aexplorer.plg (SHA256 injected)

# Unraid 7.0+ installation
installplg /boot/config/plugins/aexplorer/aexplorer.plg
# or plugin install /boot/config/plugins/aexplorer/aexplorer.plg (when 7.3.x lacks installplg)
```

**URL install (repo public + txz committed)**: on the Plugins page, enter the following in "Install Plugin":
```
https://raw.githubusercontent.com/horsun/aexplorer/1.0/plugin/aexplorer.plg
```
> Gitea dev-repo install source (LAN): `http://10.10.10.6:8300/bot/aexplorer/raw/branch/main/plugin/aexplorer.plg`
A different version takes the upgrade path (no same-version rejection). Upgrade flow (verified): pre-download plg+txz → SHA256 compare → `plugin install` → verify in the browser.

**Reinstall gotchas** (pitfalls hit on real hardware at 0.7.0):
- **Same-version reinstall is rejected**: `plugin: not reinstalling same version` (the script compares installed version == target version and exits immediately, **deleting nothing**)
- **Empty directories = an uninstall (remove section) ran**: the remove section runs `rm -r /usr/local/emhttp/plugins/aexplorer` + `rm -r /boot/config/plugins/aexplorer`
- **To reinstall the same version**: `plugin install xxx.plg --force` (skips version detection); or delete the `/var/log/plugins/aexplorer.plg` install record and install again (treated as fresh); **do not uninstall first and then install the same version** (uninstall deletes directories + leaves records → install rejected → page will not open)

---

## 10. Milestones

- [x] M1 Research: confirm the differences between the Unraid 7 built-in version and the plugin version
- [x] M2 Merge the built-in baseline (Browse/Control/nchan/upload/edit protocols)
- [x] M3 Backend: list_json / tree_json (reusing official find -L)
- [x] M4 Frontend: virtual scrolling + Windows 11 UI + system protocol integration
- [x] M5 Deep audit: renamed AExplorer + fixed conflicts (page override / nchan contention / function name clashes / CSRF) + intrusiveness check
- [x] M6 Real-hardware install verification (Unraid 7.3.2; full upgrade path verified 0.4.2→0.6.2)
- [x] M7 Polish: CSRF enforcement adaptation / CSS scoping / breadcrumbs / fmtSize / tree layout / shortcut area moved up
- [x] M8 Feature expansion: media opening (paging) / side-button navigation / starred / backend recursive search / properties panel / editor encoding switching
- [x] M9 Tooling & fixes: folder-download attempt and revert (0.6.4-0.6.6) / extraction / folder drag-drop upload / thumbnails (added 0.6.7, removed 0.6.9) / Nchan consumer fix / owner dropdown / auto-refresh after operations / marquee selection / side-button capture interception / footer auto-fit (0.7.0-0.7.4)

---

## 11. Mobile Adaptation ✅ (implemented in 0.7.6, corrected in 0.7.7)

**Approach**: pure frontend responsive design + touch interaction adaptation (zero backend, zero system intrusiveness).
**Key prerequisite**: AExplorer.page adds `<meta name="viewport" content="width=device-width, initial-scale=1">` (unraid pages have no viewport meta, so phones scale to a 980px virtual width).

### Layout (CSS media query ≤768px)

- [x] Toolbar collapses: only New/Upload/Search/Refresh remain + a `⋯` more popup
- [x] Left tree hides into a ☰ hamburger drawer (slide-out overlay + tap-on-mask to close)
- [x] File list becomes a single column (name + size); owner/permissions/time/location columns hidden
- [x] Row height 33px → 44px (minimum touch target)
- [x] Breadcrumbs kept (min-width 90px + horizontal scrolling, 0.7.7)
- [x] Large-icon view is touch-friendly; list remains the default
- [x] Media preview / editor modals go fullscreen

### Interactions (JS touch detection `ontouchstart`)

- [x] Single tap opens directly (IS_MOBILE determined by width; DevTools emulation matches real devices)
- [x] Long-press 1500ms triggers the context menu (custom touch timing; iOS Safari long-press does not fire contextmenu, so it is self-implemented)
- [x] Marquee selection disabled (touch)
- [x] Side buttons / keyboard shortcuts naturally inert on touch
- [x] Upload via button (`<input file>` native support)

### Verification

- [x] DevTools mobile emulation (375×667 / 390×844) — verified in 0.7.6 (28 checks PASS)
- [ ] Real-device browser access to http://10.10.10.6/AExplorer (Android Chrome + iOS Safari) — TODO
- [ ] End-to-end file-operation verification on mobile — TODO

---

## 12. Changelog

| Version | Contents |
|------|------|
| 0.8.7 | Sidebar tree double-click: expand/collapse children and open the directory (double-click again to collapse; independent from single-click navigation and caret toggle) |
| 0.8.6 | Drag & drop (directory rows / breadcrumbs / address bar / sidebar tree → copy/move/cancel chooser) + sidebar tree interaction split (caret = expand/collapse, name = open, double-click = expand-or-collapse and open) + mobile fullscreen button (Fullscreen API + iOS CSS fallback) + sort-cycle button (name → mtime → size, fixed descending) + header percentage display + auto-refresh after operations + tree drop unified to the chooser (fixed single-file direct-move / multi-file no-op) |
| 0.8.5 | Extended viewers (text/code straight into the ACE editor + Markdown rendering + CSV table + Excel multi-sheet + SQLite read-only paging + archive listing + inline PDF + video codec fallback; local vendored libs lazy-loaded) + wider viewer modals + **embedded terminal** (right-click empty space → bottom panel, ttyd multi-instance + rcfile cwd placement) + **first-letter select** (type-ahead: prefix matching / repeat-key cycling / scroll-to-target) |
| 0.8.3 | copy fix (reading the DOM after closeModal threw) + operation-log fix (moved outside runAction) + same-directory check + ensure_fm consumer self-healing + logging system (1MB rotation / footer dual buttons) + modals close on outside click + detail view removed |
| 0.8.2 | grid view selection styling (rounded blue frame replaces the left bar) |
| 0.8.1 | fixed duplicated placeholder text in the path bar (address-bar switched to data-i18n-title) |
| 0.8.0 | fixed i18n turning icon buttons into text (data-i18n-title only translates tooltips) |
| 0.7.9 | i18n: unraid session language injected as AE_LOCALE + frontend I18N dictionary + t(); all copy on page/toolbar/context menu/modals/status bar/upload/editor bilingual (zh/en); README trimmed (details moved into this document) + "Powered by AI" note |
| 0.7.8 | security hardening (AE_USERS JSON_HEX_TAG) + security audit conclusion (no vulnerabilities); Gitea repo set to private |
| 0.7.7 | mobile fixes: address bar kept (min-width 90px + horizontally scrollable breadcrumbs), modal buttons full-width, media 56vh, IS_MOBILE relaxed to width-only (matches DevTools emulation) |
| 0.7.6 | mobile adaptation (responsive + touch): viewport meta, toolbar collapse + ⋯ more, tree hamburger drawer, single-column list, 44px row height, tap-to-open, long-press menu, fullscreen modals |
| 0.7.5 | full documentation revision (aligned with all 0.7.4 features); DESIGN adds mobile-adaptation TODO |
| 0.7.4 | fixed side buttons still triggering back (capture phase + all three events intercepted) |
| 0.7.3 | content area and footer auto-fit (measured top offset + 45px bottom margin) |
| 0.7.2 | fixed invisible marquee (CSS prefix); selected-row highlight bar + adjacent separators |
| 0.7.1 | marquee selection (drag rectangle on empty space; supports virtual scrolling/grid/Shift append) |
| 0.7.0 | owner dropdown; auto-refresh after operations (8s fallback) |
| 0.6.9 | removed thumbnails; fixed delete/copy/move failures (Nchan=file_manager consumer) |
| 0.6.8 | fixed null-entry crash in drag-drop upload (falls back to file upload) |
| 0.6.7 | right-click extraction (zip/tar.gz) + folder drag-drop upload (webkitGetAsEntry) |
| 0.6.6 | reverted folder archive download (php-fpm body parsing failure; feature unusable) |
| 0.6.5 | archive-download rework: temp file + readfile (not solved; reverted in 0.6.6) |
| 0.6.4 | folder archive download (tar.gz, <1G limit) → reverted in 0.6.6 |
| 0.6.3 | full documentation update (aligned with all 0.6.2 features, stale content removed) |
| 0.6.2 | global side-button interception; image viewer paging; editor encoding switching |
| 0.6.1 | side buttons switched to mousedown+preventDefault (auxclick cannot stop browser history navigation) |
| 0.6.0 | media opening / side buttons / starred / backend recursive search / properties panel (replaces calc) |
| 0.5.2 | fixed F2 rename not working |
| 0.5.1 | search drills down one more level; shortcut area moved up |
| 0.5.0 | tree expansion switched to vertical layout (flex-wrap) |
| 0.4.8 | breadcrumb click-navigation fix; automatic size units (B/KB/MB/GB) |
| 0.4.7 | fixed official CSS overriding (all rules prefixed with #explorer-app) |
| 0.4.6 | plugin-list icon/font alignment |
| 0.4.5 | plugin-list display-name fix (README.md as source) |
| 0.4.4 | registered top navigation tab (Tasks:70) |
| 0.4.3 | apiPost adds CSRF (unraid enforces /plugins/ PHP validation) |
| 0.4.2 | ace switched to official built-in assets; txz 925K→37K |
| 0.4.1 | CSRF defense in depth + download behavior aligned with official |
| 0.4.0 | brand-new AExplorer frontend (renamed from unraid-explorer) |

---

**Status: v1.0 · 2026-08-08**
