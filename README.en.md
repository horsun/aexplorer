# 🦐 AExplorer

A file manager rewritten on top of **Unraid 7's built-in Dynamix File Manager**: it keeps all of the official backend mechanisms (Control.php protocol / nchan task queue / ACE editor), while the frontend is rewritten in a **Windows 11 Explorer style** (vanilla JS + virtual scrolling, local vendored libraries, zero external-network dependencies).

![Version](https://img.shields.io/badge/version-1.0-blue) ![Based On](https://img.shields.io/badge/based_on-Unraid_7_builtin-orange)

**[中文](README.md) | [English](README.en.md)**

> 🤖 **Powered by AI** — This project is developed, debugged, and maintained with the assistance of an AI agent (Nous Research Hermes).

## ✨ Core Features

- **Smooth browsing**: virtual scrolling (stays smooth even with tens of thousands of files), list/large-icon dual views, column sorting, symlink / filename-with-newline support
- **Full file operations**: copy / move / delete / rename / owner (dropdown) / permissions / properties — all via the system protocol with real-time background task progress
- **Smart opening**: text/code **straight into the ACE editor** (syntax highlighting + GBK/Big5 encoding switching), Markdown rendering, Excel tables (multi-sheet), SQLite read-only browsing, archive content listing, inline PDF, image paging, audio & video, video codec-unsupported fallback
- **Drag & drop**: drag files/folders onto a directory row, breadcrumb, address bar or sidebar tree → copy/move/cancel chooser (multi-select supported)
- **Sidebar tree**: single-click opens / caret expands-collapses / double-click expands-and-opens (double-click again to collapse)
- **Folder download as archive**: tar.gz packaging → nginx static direct-serve (stable for large files) + three-layer auto cleanup
- **Embedded terminal**: right-click empty space → "Open terminal here" → panel at the bottom of the page (ttyd + xterm, opens directly in the current directory, per-directory isolated instances)
- **Powerful tools**: mouse drag-select, right-click extract (zip/tar.gz), drag-and-drop upload (including folders with automatic subdirectory recreation)
- **Deep search**: backend recursive search (depth 3 / 400-directory limit) + starred favorites + mouse side-button navigation
- **Mobile-friendly**: responsive down to ≤768px (collapsible toolbar / drawer tree / tap-to-open / long-press menu)
- **Security**: path whitelist (only /mnt, /boot), fully escaped commands, full CSRF coverage, no hardcoded credentials, logs 0600 + 1MB rotation

## 📦 Installation

```bash
plugin install /boot/config/plugins/aexplorer/aexplorer.plg   # Unraid 7.3+
installplg /boot/config/plugins/aexplorer/aexplorer.plg        # Unraid 7.0-7.2
```

Alternatively, in the WebUI go to Plugins → Install Plugin and paste the .plg URL (repo is public and the txz is committed, so URL install works):

```
https://raw.githubusercontent.com/horsun/aexplorer/1.0/plugin/aexplorer.plg
```

Entry point: the **AEXPLORER** tab at the top.

> ⚠️ Reinstalling the same version is rejected (`not reinstalling same version`) — use `--force` or wait for a new version.

## 📚 Documentation

- **Design document** (architecture / feature list / security design / changelog): `docs/DESIGN.md`
- **English version**: `docs/DESIGN.en.md`

## 🧭 Keyboard Shortcuts

`F5` refresh · `F2` rename · `Delete` delete · `Ctrl+F` search · `Ctrl+A` select all · `Backspace` parent directory · `Alt+←/→/↑` navigation · mouse side buttons back/forward · `Ctrl+1/2` view · **letter keys first-letter select** (type-ahead)
