# 🦐 AExplorer

基于 **Unraid 7 内置 Dynamix File Manager** 重写的文件管理器：保留官方全部后端机制（Control.php 协议 / nchan 任务队列 / ACE 编辑器），前端重写为 **Windows 11 资源管理器风格**（原生 JS + 虚拟滚动，本地 vendor 库零外网依赖）。

![Version](https://img.shields.io/badge/version-1.0-blue) ![Based On](https://img.shields.io/badge/based_on-Unraid_7_builtin-orange)

**[中文](README.md) | [English](README.en.md)**

> 🤖 **Powered by AI** — 本项目由 AI 智能体（Nous Research Hermes）辅助开发、调试与维护。

## ✨ 核心特性

- **流畅浏览**：虚拟滚动（万级文件不卡）、列表/大图标双视图、列排序、符号链接/换行文件名支持
- **完整文件操作**：复制/移动/删除/重命名/属主（下拉）/权限/属性，全部走系统协议 + 后台任务实时进度
- **智能打开**：文本/代码**直接进 ACE 编辑器**（语法高亮 + GBK/Big5 编码切换）、Markdown 渲染、Excel 表格（多 sheet）、SQLite 只读浏览、压缩包内容列表、PDF 内联、图片翻页、音视频、视频编码不支持回退提示
- **拖放操作**：文件/目录拖到目录行、面包屑、地址栏或侧边栏树 → 「复制/移动/取消」三选弹窗（多选集合同支持）
- **侧边栏树**：单击打开 / 三角展开折叠 / 双击展开并打开（再双击收缩）
- **文件夹打包下载**：tar.gz 打包 → nginx 静态直出（大文件稳定）+ 三层自动清理
- **内嵌终端**：右键空白处「在此打开终端」→ 页面底部面板（ttyd + xterm，打开即定位当前目录，多实例隔离）
- **高效工具**：鼠标框选、右键解压（zip/tar.gz）、拖拽上传（含文件夹 + 子目录自动重建）
- **深度搜索**：后端递归搜索（深度 3 / 限 400 目录）+ 星标收藏 + 鼠标侧键导航
- **移动端适配**：≤768px 响应式（工具栏折叠/树抽屉/单击打开/长按菜单）
- **安全**：路径白名单（仅 /mnt、/boot）、命令全转义、CSRF 全覆盖、无硬编码凭据、日志 0600 + 1MB 轮转

## 📦 安装

```bash
plugin install /boot/config/plugins/aexplorer/aexplorer.plg   # Unraid 7.3+
installplg /boot/config/plugins/aexplorer/aexplorer.plg        # Unraid 7.0-7.2
```

WebUI → 插件 → 安装插件，粘贴 .plg 地址亦可（仓库公开 + txz 已入库，URL 安装可用）：

```
https://raw.githubusercontent.com/horsun/aexplorer/1.0/plugin/aexplorer.plg
```

入口：顶部 **AEXPLORER** tab。

> ⚠️ 同版本重装会被拒绝（`not reinstalling same version`）— 用 `--force` 或等新版本。

## 📚 文档

- **设计文档**（架构/功能清单/安全设计/变更历史）：`docs/DESIGN.md`
- **英文版**：`docs/DESIGN.en.md`

## 🧭 快捷键

`F5` 刷新 · `F2` 重命名 · `Delete` 删除 · `Ctrl+F` 搜索 · `Ctrl+A` 全选 · `Backspace` 上级 · `Alt+←/→/↑` 导航 · 鼠标侧键 后退/前进 · `Ctrl+1/2` 视图 · **字母键 首字母选中**（type-ahead）
