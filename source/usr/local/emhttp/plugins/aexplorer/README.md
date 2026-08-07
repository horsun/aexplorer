#### AExplorer

基于 Unraid 7 内置 Dynamix File Manager（webGui 内核版）改造的 Windows 11 风格文件管理器。

保留官方全部后端机制：Control.php 操作协议 / nchan 任务队列 / ACE 编辑器。前端 UI 重写：虚拟滚动、左侧目录树（存储/快捷/星标）、多视图切换、拖拽上传、后台任务实时进度。双击智能打开：图片/视频/音频弹窗预览（图片支持翻页），文本编辑器支持编码切换（UTF-8/GBK/Big5）。后端递归搜索（深度 3 层）与鼠标侧键导航。安全沿用官方：路径白名单仅 /mnt 与 /boot（validdir 校验），写操作全部委托系统 Control.php。独立注册为顶部导航 tab，不与官方 Browse 冲突。
