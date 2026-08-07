<?PHP
/* Copyright 2005-2025, Lime Technology
 * Copyright 2012-2025, Bergware International.
 *
 * Unraid Explorer — 基于 Unraid 7 内置 Dynamix File Manager 改造
 * 保留官方全部逻辑，新增 list_json / tree_json 供 Windows 风格前端使用
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License version 2,
 * as published by the Free Software Foundation.
 */
?>
<?
$docroot ??= ($_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp');

// add translations
$_SERVER['REQUEST_URI'] = '';
require_once "$docroot/webGui/include/Translations.php";
require_once "$docroot/webGui/include/Helpers.php";

// ============================================================
// 🆕 Unraid Explorer JSON API（新前端数据源）
// 复用官方 validdir 安全校验 + find -L 解析逻辑
// ============================================================

function ex_validdir($dir) {
  $path = realpath($dir);
  return in_array(explode('/', $path)[1] ?? '', ['mnt','boot']) ? $path : '';
}

function ex_list_json() {
  ex_pack_sweep(); // 清理层 2：页面活跃时顺手清扫 >1h 打包残留
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  if (!$dir) { die(json_encode(['ok'=>false,'error'=>'invalid path'])); }
  extract(parse_plugin_cfg('dynamix', true));
  $disks  = parse_ini_file('state/disks.ini', true);
  $shares = parse_ini_file('state/shares.ini', true);
  $fmt    = "%F {$display['time']}";
  $items  = [];
  $total  = $objs = 0;
  [$null,$root,$main,$next,$rest] = my_explode('/', $dir, 5);
  $user  = $root=='mnt' && in_array($main, ['user','user0']);
  $lock  = $root=='mnt' ? ($main ?: '---') : ($root=='boot' ? _('flash') : '---');

  // location 映射（user share 用 xattr，disk 直接用盘名）
  $set = [];
  if ($user) {
    exec("shopt -s dotglob;getfattr --no-dereference --absolute-names -n system.LOCATIONS ".escapeshellarg($dir)."/* 2>/dev/null",$tmp);
    for ($i = 0; $i < count($tmp); $i+=3) {
      if (!isset($tmp[$i+1])) break;
      $filename = preg_replace_callback('/\\\\([0-7]{3})/', function($m) { return chr(octdec($m[1])); }, $tmp[$i]);
      $parts = explode('"', $tmp[$i+1]);
      if (count($parts) >= 2) $set[basename($filename)] = $parts[1];
    }
    unset($tmp);
  }

  // find -L + \0 分隔解析（官方 2025 改进：支持换行文件名/符号链接）
  $cmd = <<<'BASH'
cd %s && find -L . -maxdepth 1 -mindepth 1 -printf '%%y\0%%Y\0%%u\0%%M\0%%s\0%%T@\0%%p\0%%D\0' 2>/dev/null
BASH;
  $stat = popen(sprintf($cmd, escapeshellarg($dir)), 'r');
  $all_output = stream_get_contents($stat);
  pclose($stat);
  $fields_array = explode("\0", $all_output);

  for ($i = 0; $i + 8 <= count($fields_array); $i += 8) {
    $fields = array_slice($fields_array, $i, 8);
    [$type,$link_type,$owner,$perm,$size,$time,$name,$device_id] = $fields;
    $time = (int)$time;
    $name = $dir.'/'.substr($name, 2);
    $is_broken = ($link_type == 'N');
    $is_dir = ($type == 'd');

    // location
    if ($user) {
      $dev = explode('/', $name, 5);
      $dev_name = $dev[3] ?? $dev[2];
      $loc = $set[basename($name)] ?? $shares[$dev_name]['cachePool'] ?? '';
    } else {
      $dev_name = $lock;
      $loc = $dev_name;
    }

    $objs++;
    $items[] = [
      'name'       => basename($name),
      'path'       => $name,
      'type'       => $is_dir ? 'dir' : ($is_broken ? 'broken-symlink' : strtolower(pathinfo($name, PATHINFO_EXTENSION))),
      'is_dir'     => $is_dir,
      'is_broken'  => $is_broken,
      'owner'      => $owner,
      'perm'       => $perm,
      'size'       => $is_dir ? 0 : (int)$size,
      'size_human' => $is_dir ? '—' : my_scale($size,$unit).' '.$unit,
      'mtime'      => $time,
      'mtime_human'=> my_time($time,$fmt),
      'loc'        => $loc,
    ];
    if (!$is_dir) $total += $size;
  }

  die(json_encode([
    'ok' => true,
    'dir' => $dir,
    'parent' => dirname($dir),
    'items' => $items,
    'count' => $objs,
    'total_size' => $total, // 纯数字字节（前端 fmtSize 自动单位；$unit 未初始化导致旧版无单位）
    'disk' => ex_disk_stats($dir),
  ], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// 磁盘空间统计：user share（fuse/shfs）的 statvfs 不可靠（报告值异常），聚合所有真实盘；
// disk/boot 等真实挂载路径直接 statvfs（可靠）
function ex_disk_stats($dir) {
  if (preg_match('#^/mnt/(user|user0)(/|$)#', $dir)) {
    $free = $total = 0;
    foreach (glob('/mnt/*') as $p) {
      $b = basename($p);
      if (in_array($b, ['user', 'user0', 'remotes', 'disks'])) continue;
      if (!is_dir($p)) continue;
      $f = @disk_free_space($p); $t = @disk_total_space($p);
      if ($f !== false && $t !== false) { $free += $f; $total += $t; }
    }
    return ['free' => $free, 'total' => $total];
  }
  return ['free' => @disk_free_space($dir), 'total' => @disk_total_space($dir)];
}

function ex_tree_json() {
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  if (!$dir) { die(json_encode(['ok'=>false,'error'=>'invalid path','dirs'=>[]])); }
  $dirs = [];
  $files = @scandir($dir);
  if ($files) {
    foreach ($files as $name) {
      if ($name==='.' || $name==='..' || $name[0]==='.') continue;
      $full = $dir.'/'.$name;
      if (is_dir($full)) {
        $dirs[] = [
          'name' => $name,
          'path' => $full,
          'has_children' => count(@scandir($full)) > 2,
        ];
      }
    }
  }
  usort($dirs, fn($a,$b) => strnatcasecmp($a['name'],$b['name']));
  die(json_encode(['ok'=>true,'dir'=>$dir,'dirs'=>$dirs], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// 递归搜索（深度受限 + 目录数受限，只读，白名单路径）
function ex_search_json() {
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  $q = strtolower(trim($_POST['q'] ?? ''));
  if (!$dir) { die(json_encode(['ok'=>false,'error'=>'invalid path','items'=>[]])); }
  if ($q === '') { die(json_encode(['ok'=>true,'dir'=>$dir,'items'=>[]])); }
  $depth = min(3, max(1, intval($_POST['depth'] ?? 3)));
  $maxDirs = 400;
  $scanned = 0;
  $results = [];
  $walk = function ($base, $rel, $d) use (&$walk, &$results, &$scanned, $q, $maxDirs) {
    if ($scanned > $maxDirs) return;
    $path = $base . ($rel !== '' ? '/' . $rel : '');
    if (!is_dir($path)) return;
    $scanned++;
    $files = @scandir($path);
    if (!$files) return;
    foreach ($files as $name) {
      if ($name==='.' || $name==='..' || $name[0]==='.') continue;
      $full = $path . '/' . $name;
      if (stripos($name, $q) !== false) {
        $results[] = [
          'name' => $name,
          'path' => $full,
          'is_dir' => is_dir($full),
          'type' => is_dir($full) ? '' : strtolower(pathinfo($name, PATHINFO_EXTENSION)),
          'size' => is_file($full) ? @filesize($full) : 0,
          'mtime' => @filemtime($full),
          '_src' => $rel !== '' ? $rel : '/',
        ];
      }
      if ($d > 1 && is_dir($full)) {
        $walk($base, $rel !== '' ? $rel . '/' . $name : $name, $d - 1);
      }
    }
  };
  $walk($dir, '', $depth);
  usort($results, fn($a,$b) => strnatcasecmp($a['name'],$b['name']));
  die(json_encode(['ok'=>true,'dir'=>$dir,'items'=>$results], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// 解压：zip（unzip）/ tar.gz/tgz/tar（tar），解压到指定目录
// 安全：file/target 均过 validdir 白名单；命令绝对路径 + escapeshellarg
function ex_extract_json() {
  $file = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['file'] ?? '')));
  $target = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['target'] ?? '')));
  if (!$file || !$target) { die(json_encode(['ok'=>false,'error'=>'invalid path'])); }
  if (!is_file($file)) { die(json_encode(['ok'=>false,'error'=>'file not found'])); }
  if (!is_dir($target)) { die(json_encode(['ok'=>false,'error'=>'target not a directory'])); }
  $name = strtolower(basename($file));
  $out = [];
  $rc = 0;
  if (substr($name, -4) === '.zip') {
    @exec('/usr/bin/unzip -o -q ' . escapeshellarg($file) . ' -d ' . escapeshellarg($target) . ' 2>&1', $out, $rc);
  } elseif (substr($name, -7) === '.tar.gz' || substr($name, -4) === '.tgz') {
    @exec('/usr/bin/tar -xzf ' . escapeshellarg($file) . ' -C ' . escapeshellarg($target) . ' 2>&1', $out, $rc);
  } elseif (substr($name, -4) === '.tar') {
    @exec('/usr/bin/tar -xf ' . escapeshellarg($file) . ' -C ' . escapeshellarg($target) . ' 2>&1', $out, $rc);
  } else {
    die(json_encode(['ok'=>false,'error'=>'unsupported archive type']));
  }
  if ($rc !== 0) {
    die(json_encode(['ok'=>false,'error'=>trim(implode(' ', array_slice($out, 0, 3))) ?: ('extract failed rc=' . $rc)]));
  }
  die(json_encode(['ok'=>true], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// 递归创建子目录（拖拽上传文件夹用；sub 为相对路径，过滤 .. 防穿越）
function ex_mkdir_json() {
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  $sub = rawurldecode($_POST['sub'] ?? '');
  if (!$dir || $sub === '') { die(json_encode(['ok'=>false,'error'=>'invalid path'])); }
  $parts = array_filter(explode('/', str_replace('\\', '/', $sub)), function ($p) {
    return $p !== '' && $p !== '.' && $p !== '..';
  });
  $cur = $dir;
  foreach ($parts as $p) {
    $cur = $cur . '/' . $p;
    if (!@is_dir($cur) && !@mkdir($cur, 0770)) {
      die(json_encode(['ok'=>false,'error'=>'mkdir failed: ' . $p]));
    }
  }
  die(json_encode(['ok'=>true], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// ============ 日志系统（1MB 轮转，存 /boot/config/plugins/aexplorer/logs/） ============
// 操作记录 aexplorer-ops.log（删除/复制/移动/重命名/属主/权限/解压/上传等）
// 应用日志 aexplorer.log（错误/消费端自愈等）
function ex_log_path($type) {
  return '/boot/config/plugins/aexplorer/logs/' . ($type === 'op' ? 'aexplorer-ops.log' : 'aexplorer.log');
}
function ex_log_write($type, $msg) {
  $path = ex_log_path($type);
  @mkdir(dirname($path), 0755, true);
  // 1MB 轮转：超限 rename 为 .1（保留最近一份），重建新文件
  if (@filesize($path) > 1048576) {
    @rename($path, $path . '.1');
  }
  // 防日志伪造：换行/回车转空格（文件名可含换行）；截断 1000 字符
  $msg = str_replace(["\r", "\n"], ' ', trim((string)$msg));
  @file_put_contents($path, '[' . date('Y-m-d H:i:s') . '] ' . substr($msg, 0, 1000) . "\n", FILE_APPEND | LOCK_EX);
  @chmod($path, 0600); // 日志含路径信息，仅 root 可读
}
function ex_log_json() {
  $type = ($_POST['type'] ?? 'op') === 'app' ? 'app' : 'op';
  $msg = trim((string)($_POST['msg'] ?? ''));
  if ($msg !== '') {
    ex_log_write($type, substr($msg, 0, 1000));
    die(json_encode(['ok' => true]));
  }
  die(json_encode(['ok' => false, 'error' => 'empty msg']));
}
function ex_readlog_json() {
  $type = ($_POST['type'] ?? 'op') === 'app' ? 'app' : 'op';
  $path = ex_log_path($type);
  if (!is_file($path)) { die(json_encode(['ok' => true, 'content' => '', 'size' => 0])); }
  // 只读最后 64KB（防大文件拖垮弹窗）
  $size = filesize($path);
  $fp = fopen($path, 'r');
  if ($size > 65536) fseek($fp, $size - 65536);
  $content = stream_get_contents($fp);
  fclose($fp);
  die(json_encode(['ok' => true, 'content' => $content, 'size' => $size], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
function ex_clearlog_json() {
  $type = ($_POST['type'] ?? 'op') === 'app' ? 'app' : 'op';
  @unlink(ex_log_path($type));
  @unlink(ex_log_path($type) . '.1');
  die(json_encode(['ok' => true]));
}

// ============ 文件夹打包下载（0.8.4 重做：nginx 静态直出，绕开 php-fpm 流式） ============
// 原理：tar 生成到插件运行目录 download/（nginx root 内 + auth 保护）→ 前端 a 标签下载
//      → nginx sendfile 直出（零 php-fpm 输出，大文件稳定）
// 三层自动清理（不依赖重启）：
//   1) 下载后：前端调 mode=pack_clean 删当前文件（延迟 60s，防下载中断误删）
//   2) 页面活跃时：list_json/tree_json 每次调用顺手清扫 >1h 残留
//   3) 生成新包前：先清扫 >1h 残留
function ex_pack_dir() { return '/usr/local/emhttp/plugins/aexplorer/download'; }
function ex_pack_sweep() {
  $dir = ex_pack_dir();
  if (@is_dir($dir)) {
    @exec('/usr/bin/find ' . escapeshellarg($dir) . ' -name "*.tar.gz" -mmin +60 -delete 2>/dev/null');
  }
}
function ex_pack_json() {
  ex_pack_sweep(); // 清理层 3：生成前先清扫
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  if (!$dir) { die(json_encode(['ok'=>false,'error'=>'invalid path'])); }
  if (!is_dir($dir)) { die(json_encode(['ok'=>false,'error'=>'not a directory'])); }
  // 大小限制 1 GiB（防超大目录拖垮 IO）
  $out = [];
  @exec('/usr/bin/du -sb ' . escapeshellarg($dir) . ' 2>/dev/null', $out, $rc);
  $size = ($rc === 0 && isset($out[0])) ? (int)explode("\t", trim($out[0]))[0] : 0;
  if ($size > 1073741824) {
    die(json_encode(['ok'=>false,'error'=>'exceeds 1 GiB pack limit: ' . number_format($size / 1073741824, 2) . ' GiB'], JSON_UNESCAPED_UNICODE));
  }
  // 打包到 download/（随机 token 防枚举）
  $token = bin2hex(random_bytes(16));
  $dlDir = ex_pack_dir();
  @mkdir($dlDir, 0755, true);
  $tmp = $dlDir . '/' . $token . '.tar.gz';
  @set_time_limit(0);
  $parent = dirname($dir);
  $base = basename($dir);
  @exec('/usr/bin/tar -czf ' . escapeshellarg($tmp) . ' -C ' . escapeshellarg($parent) . ' ' . escapeshellarg($base) . ' 2>/dev/null', $_, $rc);
  if ($rc !== 0 || !is_file($tmp)) {
    @unlink($tmp);
    die(json_encode(['ok'=>false,'error'=>'pack failed (tar rc=' . $rc . ')']));
  }
  die(json_encode(['ok'=>true, 'url' => '/plugins/aexplorer/download/' . $token . '.tar.gz', 'size' => filesize($tmp), 'token' => $token], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}
function ex_pack_clean_json() {
  $token = preg_replace('/[^a-f0-9]/', '', (string)($_POST['token'] ?? ''));
  if ($token !== '') {
    $f = ex_pack_dir() . '/' . $token . '.tar.gz';
    if (is_file($f)) @unlink($f);
  }
  die(json_encode(['ok'=>true]));
}

// ============ 扩展预览（0.8.5：文本/MD/CSV/SQLite/zip/tar 列表——全部只读） ============
// 文本读取（限 2MB，UTF-8；非 UTF-8 回退 latin1 展示）
function ex_file_read_json() {
  $f = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['file'] ?? '')));
  if (!$f || !is_file($f)) { die(json_encode(['ok'=>false,'error'=>'invalid file'])); }
  $size = filesize($f);
  if ($size > 2097152) { die(json_encode(['ok'=>false,'error'=>'exceeds 2 MB preview limit'], JSON_UNESCAPED_UNICODE)); }
  $raw = @file_get_contents($f);
  if ($raw === false) { die(json_encode(['ok'=>false,'error'=>'read failed'])); }
  if (mb_check_encoding($raw, 'UTF-8')) {
    $text = $raw;
  } else {
    $text = @mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
    if ($text === false) $text = '';
  }
  die(json_encode(['ok'=>true,'text'=>$text,'size'=>$size], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// SQLite 只读浏览：表列表 + 分页查询（只读打开 + 表名白名单 + LIMIT 分页）
function ex_sqlite_json() {
  $f = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['file'] ?? '')));
  if (!$f || !is_file($f)) { die(json_encode(['ok'=>false,'error'=>'invalid file'])); }
  if (filesize($f) > 52428800) { die(json_encode(['ok'=>false,'error'=>'exceeds 50 MB sqlite limit'], JSON_UNESCAPED_UNICODE)); }
  if (!class_exists('SQLite3')) { die(json_encode(['ok'=>false,'error'=>'sqlite3 extension missing'])); }
  $db = @new SQLite3($f, SQLITE3_OPEN_READONLY);
  if (!$db) { die(json_encode(['ok'=>false,'error'=>'cannot open sqlite read-only'])); }
  $db->busyTimeout(3000);
  $tables = [];
  $res = @$db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  if ($res) { while ($row = $res->fetchArray(SQLITE3_ASSOC)) { $tables[] = $row['name']; } }
  $table = (string)($_POST['table'] ?? '');
  $page = max(0, (int)($_POST['page'] ?? 0));
  $out = ['ok'=>true, 'tables'=>$tables, 'table'=>$table, 'page'=>$page];
  if ($table !== '' && in_array($table, $tables, true)) {
    $q = 'SELECT * FROM "' . str_replace('"', '""', $table) . '" LIMIT 100 OFFSET ' . ($page * 100);
    $res = @$db->query($q);
    $rows = [];
    $cols = [];
    if ($res) {
      $first = true;
      while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        if ($first) { $cols = array_keys($row); $first = false; }
        $rows[] = array_values(array_map(fn($v) => $v === null ? '' : (is_string($v) ? mb_substr($v, 0, 200) : $v), $row));
      }
    }
    $out['cols'] = $cols;
    $out['rows'] = $rows;
    $cnt = @$db->querySingle('SELECT COUNT(*) FROM "' . str_replace('"', '""', $table) . '"');
    $out['total'] = (int)$cnt;
  }
  $db->close();
  die(json_encode($out, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// zip/tar 内容列表（只读，不解压；限 2000 条）
function ex_archive_list_json() {
  $f = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['file'] ?? '')));
  if (!$f || !is_file($f)) { die(json_encode(['ok'=>false,'error'=>'invalid file'])); }
  $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
  $entries = [];
  if ($ext === 'zip') {
    @exec('/usr/bin/unzip -l ' . escapeshellarg($f) . ' 2>/dev/null | head -2002', $lines, $rc);
    if ($rc === 0) {
      foreach ($lines as $l) {
        if (preg_match('/^\s*\d+\s+\d+-\d+-\d+\s+\d+:\d+\s+(\S.*)$/', $l, $m)) $entries[] = $m[1];
      }
    }
  } elseif (in_array($ext, ['tar','gz','tgz','bz2','xz','txz'], true)) {
    $args = in_array($ext, ['gz','tgz'], true) ? '-tzf' : (in_array($ext, ['bz2'], true) ? '-tjf' : (in_array($ext, ['xz','txz'], true) ? '-tJf' : '-tf'));
    @exec('/usr/bin/tar ' . $args . ' ' . escapeshellarg($f) . ' 2>/dev/null | head -2000', $lines, $rc);
    if ($rc === 0) $entries = array_values(array_filter($lines, fn($l) => trim($l) !== ''));
  }
  die(json_encode(['ok'=>true, 'entries'=>$entries, 'truncated'=>count($entries) >= 2000], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// JSON API 入口（POST）
if (isset($_POST['mode'])) {
  switch ($_POST['mode']) {
  case 'list_json': ex_list_json(); break;
  case 'tree_json': ex_tree_json(); break;
  case 'search': ex_search_json(); break;
  case 'extract': ex_extract_json(); break;
  case 'mkdir': ex_mkdir_json(); break;
  case 'ensure_fm': ex_ensure_fm_json(); break;
  case 'log': ex_log_json(); break;
  case 'readlog': ex_readlog_json(); break;
  case 'clearlog': ex_clearlog_json(); break;
  case 'pack': ex_pack_json(); break;
  case 'pack_clean': ex_pack_clean_json(); break;
  case 'file_read': ex_file_read_json(); break;
  case 'sqlite': ex_sqlite_json(); break;
  case 'archive_list': ex_archive_list_json(); break;
  case 'term': ex_term_json(); break;
  }
}

// 在当前目录打开 web terminal（多实例：每目录独立 ttyd socket，断开自动退出）
// 依赖 unraid 自带 ttyd + nginx 通配代理 /webterminal/<tag>/ → unix:/var/run/<tag>.sock
function ex_term_json() {
  $dir = ex_validdir(htmlspecialchars_decode(rawurldecode($_POST['dir'] ?? '')));
  if (!$dir) { die(json_encode(['ok'=>false,'error'=>'invalid path'], JSON_UNESCAPED_UNICODE)); }
  if (!is_executable('/usr/bin/ttyd')) { die(json_encode(['ok'=>false,'error'=>'ttyd not available'], JSON_UNESCAPED_UNICODE)); }
  $tag = 'aexplorer-' . substr(md5($dir), 0, 10);
  $sock = "/var/run/{$tag}.sock";
  // 幂等：进程在跑则复用（socket 残留但进程已死 → 先清理再拉起）
  $running = trim(shell_exec('pgrep -f "[a]explorer-' . substr(md5($dir), 0, 10) . '" | head -1')) !== '';
  if (!$running) {
    @unlink($sock);
    // 启动脚本 + rcfile 方案：unraid /etc/profile 含 `cd $HOME`（第 5 行），bash --login 必然切回 /root；
    // ttyd -w 参数也无效。用两个脚本文件（无引号嵌套）：
    //   1) rc 文件：source /etc/profile 加载完整环境 → cd 回目标目录（覆盖 profile 的 cd $HOME）
    //   2) 启动脚本：外层 cd → exec ttyd（继承 cwd）→ 子进程 bash --rcfile 加载 rc
    $hash = substr(md5($dir), 0, 10);
    $rc = "/var/tmp/ae-term-rc-{$hash}.sh";
    $script = "/var/tmp/ae-term-{$hash}.sh";
    file_put_contents($rc, "#!/bin/bash\nsource /etc/profile\ncd " . escapeshellarg($dir) . "\n");
    chmod($rc, 0755);
    file_put_contents($script, "#!/bin/bash\ncd " . escapeshellarg($dir) . "\nexec /usr/bin/ttyd -d0 -W -o -i " . escapeshellarg($sock) . " /bin/bash --rcfile " . escapeshellarg($rc) . "\n");
    chmod($script, 0755);
    @exec('nohup ' . $script . ' >/dev/null 2>&1 &');
    // 轮询等待 ttyd socket 就绪（最多 2s）——否则前端 iframe 立即加载会 502，需二次点击才出
    for ($i = 0; $i < 20; $i++) {
      usleep(100000);
      if (file_exists($sock)) break;
    }
    $running = trim(shell_exec('pgrep -f "[a]explorer-' . $hash . '" | head -1')) !== '';
    if ($running) ex_log_write('app', 'term: ttyd started for ' . $dir);
  }
  die(json_encode(['ok' => $running, 'url' => "/webterminal/{$tag}/"], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// 确保后台任务消费端运行（幂等：已有进程不重复启动；操作前调用防止任务入队后无人消费）
function ex_ensure_fm_json() {
  $running = trim(shell_exec('pgrep -f "[f]ile_manager" | head -1')) !== '';
  if (!$running) {
    @exec('cd /usr/local/emhttp/webGui/nchan && nohup /usr/bin/php -q ./file_manager >/dev/null 2>&1 &');
    ex_log_write('app', 'ensure_fm: file_manager consumer auto-started');
    usleep(400000);
    $running = trim(shell_exec('pgrep -f "[f]ile_manager" | head -1')) !== '';
  }
  die(json_encode(['ok' => $running], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

// ============================================================
// 以下为官方内置版 Browse.php 原逻辑（HTML 片段渲染，未改动）
// ============================================================

function write(&$rows) {
  if ($size = count($rows)) echo '<tbody>',implode(array_map(function($row){echo gzinflate($row);},$rows)),'</tbody>';
  $rows = $size;
}

function validdir($dir) {
  $path = realpath($dir);
  return in_array(explode('/', $path)[1] ?? '', ['mnt','boot']) ? $path : '';
}

function escapeQuote($data) {
  return str_replace('"','&#34;', $data);
}

function add($number, $name, $single='', $plural='s') {
  return $number.' '._($name.($number==1 ? $single : $plural));
}

function age($number, $time) {
  return sprintf(_('%s '.($number==1 ? $time : $time.'s').' ago'),$number);
}

function my_age($time) {
  if (!is_numeric($time)) $time = time();
  $age = new DateTime('@'.$time);
  $age = date_create('now')->diff($age);
  if ($age->y > 0) return age($age->y, 'year');
  if ($age->m > 0) return age($age->m, 'month');
  if ($age->d > 0) return age($age->d, 'day');
  if ($age->h > 0) return age($age->h, 'hour');
  if ($age->i > 0) return age($age->i, 'minute');
  return age($age->s, 'second');
}

function parent_link() {
  global $dir, $path;
  $parent = dirname($dir);
  return $parent == '/' ? false : '<a href="/'.$path.'?dir='.rawurlencode($parent).'">'._("Parent Directory").'</a>';
}

function my_devs(&$devs,$name,$menu) {
  global $disks, $lock;
  $text = []; $i = 0;
  foreach ($devs as $dev) {
    if ($lock == '---') {
      $text[$i] = '<a class="info" onclick="return false"><i class="lock fa fa-fw fa-hdd-o grey-text"></i></a>&nbsp;---';
    } else {
      switch ($disks[$dev]['luksState']??0) {
        case 0: $text[$i] = '<span class="dfm_device"><a class="info" onclick="return false"><i class="lock fa fa-fw fa-unlock-alt grey-text"></i><span>'._('Not encrypted').'</span></a>'; break;
        case 1: $text[$i] = '<span class="dfm_device"><a class="info" onclick="return false"><i class="lock fa fa-fw fa-unlock-alt green-text"></i><span>'._('Encrypted and unlocked').'</span></a>'; break;
        case 2: $text[$i] = '<span class="dfm_device"><a class="info" onclick="return false"><i class="lock fa fa-fw fa-lock red-text"></i><span>'._('Locked: missing encryption key').'</span></a>'; break;
        case 3: $text[$i] = '<span class="dfm_device"><a class="info" onclick="return false"><i class="lock fa fa-fw fa-lock red-text"></i><span>'._('Locked: wrong encryption key').'</span></a>'; break;
       default: $text[$i] = '<span class="dfm_device"><a class="info" onclick="return false"><i class="lock fa fa-fw fa-lock red-text"></i><span>'._('Locked: unknown error').'</span></a>'; break;
      }
      $root = ($dev == 'flash' ? "/boot/$name" : "/mnt/$dev/$name");
      $text[$i] .= '<span id="device_'.$i.'" class="hand" onclick="'.$menu.'(\''.$root.'\','.$i.')" oncontextmenu="'.$menu.'(\''.$root.'\','.$i.');return false">'.compress($dev,11,0).'</span></span>';
    }
    $i++;
  }
  return implode($text);
}

function icon_class($ext) {
  switch ($ext) {
  case 'broken-symlink':
    return 'fa fa-chain-broken red-text';
  case '3gp': case 'asf': case 'avi': case 'f4v': case 'flv': case 'm4v': case 'mkv': case 'mov': case 'mp4': case 'mpeg': case 'mpg': case 'm2ts': case 'ogm': case 'ogv': case 'vob': case 'webm': case 'wmv':
    return 'fa fa-film';
  case '7z': case 'bz2': case 'gz': case 'rar': case 'tar': case 'xz': case 'zip':
    return 'fa fa-file-archive-o';
  case 'aac': case 'ac3': case 'dsf': case 'flac': case 'm4a': case 'mka': case 'mp2': case 'mp3': case 'oga': case 'ogg': case 'tds': case 'wav': case 'wma':
    return 'fa fa-music';
  case 'ai': case 'eps': case 'fla': case 'psd': case 'swf':
    return 'fa fa-file-image-o';
  case 'avif': case 'bmp': case 'gif': case 'ico': case 'jp2': case 'jpc': case 'jpeg': case 'jpg': case 'jpx': case 'png': case 'svg': case 'tif': case 'tiff': case 'wbmp': case 'webp': case 'xbm':
    return 'fa fa-picture-o';
  case 'bak': case 'swp':
    return 'fa fa-clipboard';
  case 'bat':
    return 'fa fa-terminal';
  case 'bot': case 'cfg': case 'conf': case 'dat': case 'htaccess': case 'htpasswd': case 'ini': case 'log': case 'pl': case 'tmp': case 'toml': case 'top': case 'txt': case 'yaml': case 'yml':
    return 'fa fa-file-text-o';
  case 'c': case 'config': case 'cpp': case 'cs': case 'dtd': case 'exe': case 'ftpquota': case 'gitignore': case 'hbs': case 'json': case 'jsx': case 'lock': case 'map': case 'md': case 'msi': case 'passwd': case 'rs': case 'sh': case 'sql': case 'tpl': case 'ts': case 'tsx': case 'twig':
    return 'fa fa-file-code-o';
  case 'css': case 'less': case 'sass': case 'scss':
    return 'fa fa-css3';
  case 'csv':
    return 'fa fa-file-text-o';
  case 'cue': case 'm3u': case 'm3u8': case 'pls': case 'xspf':
    return 'fa fa-headphones';
  case 'doc': case 'docm': case 'docx': case 'dot': case 'dotm': case 'dotx': case 'odt':
    return 'fa fa-file-word-o';
  case 'eml': case 'msg':
    return 'fa fa-envelope-o';
  case 'eot': case 'fon': case 'otf': case 'ttc': case 'ttf': case 'woff': case 'woff2':
    return 'fa fa-font';
  case 'htm': case 'html': case 'shtml': case 'xhtml':
    return 'fa fa-html5';
  case 'js': case 'php': case 'php4': case 'php5': case 'phps': case 'phtml': case 'py':
    return 'fa fa-code';
  case 'key':
    return 'fa fa-key';
  case 'ods': case 'xla': case 'xls': case 'xlsb': case 'xlsm': case 'xlsx': case 'xlt': case 'xltm': case 'xltx':
    return 'fa fa-file-excel-o';
  case 'pdf':
    return 'fa fa-file-pdf-o';
  case 'pot': case 'potx': case 'ppt': case 'pptm': case 'pptx':
    return 'fa fa-file-powerpoint-o';
  case 'xml': case 'xsl':
    return 'fa fa-file-excel-o';
  default:
    return 'fa fa-file-o';
  }
}

$dir = validdir(rawurldecode($_GET['dir']));
if (!$dir) {echo '<tbody><tr><td></td><td></td><td colspan="6">',_('Invalid path'),'</td><td></td></tr></tbody>'; exit;}

extract(parse_plugin_cfg('dynamix',true));
$disks  = parse_ini_file('state/disks.ini',true);
$shares = parse_ini_file('state/shares.ini',true);
$path   = unscript($_GET['path']);
$fmt    = "%F {$display['time']}";
$dirs   = $files = [];
$total  = $objs = 0;
[$null,$root,$main,$next,$rest] = my_explode('/', $dir, 5);
$user   = $root=='mnt' && in_array($main, ['user','user0']);
$lock   = $root=='mnt' ? ($main ?: '---') : ($root=='boot' ? _('flash') : '---');
$ishare = $root=='mnt' && (!$main || !$next || ($main=='rootshare' && !$rest));
$folder = $lock=='---' ? _('DEVICE') : ($ishare ? _('SHARE') : _('FOLDER'));

if ($user ) {
  exec("shopt -s dotglob;getfattr --no-dereference --absolute-names -n system.LOCATIONS ".escapeshellarg($dir)."/* 2>/dev/null",$tmp);
  // Decode octal escapes from getfattr output to match actual filenames
  // Reason: "getfattr" outputs \012 (newline) but the below "find" returns actual newline character
  for ($i = 0; $i < count($tmp); $i+=3) {
    // Check bounds: if getfattr fails for a file, we might not have all 3 lines
    if (!isset($tmp[$i+1])) break;
    $filename = preg_replace_callback('/\\\\([0-7]{3})/', function($m) { return chr(octdec($m[1])); }, $tmp[$i]);
    $parts = explode('"', $tmp[$i+1]);
    if (count($parts) >= 2) {
      $set[basename($filename)] = $parts[1];
    }
  }
  unset($tmp);
}

// Detect symlinks: run find without -L to identify symlinks (type='l')
// Build map of basenames with their device IDs and link targets
// Include broken symlinks to show their target in tooltip
$symlinks = [];
exec("cd ".escapeshellarg($dir)." && find . -maxdepth 1 -mindepth 1 -type l -printf '%f\t%D\t%l\n' 2>/dev/null", $symlink_list);
foreach ($symlink_list as $line) {
  $parts = explode("\t", $line);
  if (count($parts) == 3) {
    $symlinks[$parts[0]] = ['device_id' => $parts[1], 'target' => $parts[2]];
  }
}

// Get directory listing with stat info NULL-separated to support newlines in file/dir names
// Format: 8 fields per entry separated by \0: type\0linktype\0owner\0perms\0size\0timestamp\0name\0deviceID\0
// Always use find -L to show target properties (size, type, perms of symlink target)
// %y=file type (follows symlink with -L), %Y=target type (N=broken), %u=owner, %M=perms, %s=size, %T@=timestamp, %p=path, %D=device ID
$cmd = <<<'BASH'
cd %s && find -L . -maxdepth 1 -mindepth 1 -printf '%y\0%Y\0%u\0%M\0%s\0%T@\0%p\0%D\0' 2>/dev/null
BASH;
$stat = popen(sprintf($cmd, escapeshellarg($dir)), 'r');

// Read all output and split by \0 into array
$all_output = stream_get_contents($stat);
pclose($stat);
$fields_array = explode("\0", $all_output);

// Process in groups of 8 fields per entry
for ($i = 0; $i + 8 <= count($fields_array); $i += 8) {
  $fields = array_slice($fields_array, $i, 8);
  [$type,$link_type,$owner,$perm,$size,$time,$name,$device_id] = $fields;
  $time = (int)$time;
  $name = $dir.'/'.substr($name, 2); // Remove './' prefix from find output
  $is_broken = ($link_type == 'N'); // Broken symlink (target doesn't exist)
  $is_symlink = isset($symlinks[basename($name)]); // Check if this item is a symlink
  
  // Determine device name for LOCATION column
  if ($user) {
    // User share: use xattr (system.LOCATIONS) or share config
    // Extract share name from path: /mnt/user/sharename/... -> sharename
    $dev = explode('/', $name, 5);
    $dev_name = $dev[3] ?? $dev[2];
    $devs_value = $set[basename($name)] ?? $shares[$dev_name]['cachePool'] ?? '';
  } else {
    // Disk path: always shows current disk in LOCATION
    $dev_name = $lock;
    $devs_value = $dev_name;
  }
  $devs = explode(',', $devs_value);
  $tag = count($devs) > 1 ? 'warning' : '';

  $objs++;
  $text = [];
  if ($type == 'd') {
    $text[] = '<tr><td><i id="check_'.$objs.'" class="fa fa-fw fa-square-o" onclick="selectOne(this.id)"></i></td>';
    $text[] = '<td data=""><i class="fa fa-folder-o"></i></td>';
    // nl2br() is used to preserve newlines in file/dir names
    $symlink_tooltip = $is_symlink ? '<a class="info" href="#" onclick="return false;"><i class="fa fa-external-link" style="margin-left:4px;"></i><span>'.htmlspecialchars($symlinks[basename($name)]['target'] ?? '').'</span></a>' : '';
    $text[] = '<td><a id="name_'.$objs.'" oncontextmenu="folderContextMenu(this.id,\'right\');return false" href="/'.$path.'?dir='.rawurlencode($name).'">'.nl2br(htmlspecialchars(basename($name))).'</a>'.$symlink_tooltip.'</td>';
    $text[] = '<td id="owner_'.$objs.'">'.$owner.'</td>';
    $text[] = '<td id="perm_'.$objs.'">'.$perm.'</td>';
    $text[] = '<td data="0">&lt;'.$folder.'&gt;</td>';
    $text[] = '<td data="'.$time.'"><span class="my_time">'.my_time($time,$fmt).'</span><span class="my_age" style="display:none">'.my_age($time).'</span></td>';
    $text[] = '<td class="loc">'.my_devs($devs,$dev_name,'deviceFolderContextMenu').'</td>';
    $text[] = '<td><i id="row_'.$objs.'" data="'.htmlspecialchars($name, ENT_QUOTES, 'UTF-8').'" type="d" class="fa fa-plus-square-o" onclick="folderContextMenu(this.id,\'both\')" oncontextmenu="folderContextMenu(this.id,\'both\');return false">...</i></td></tr>';
    $dirs[] = gzdeflate(implode($text));
  } else {
    // Determine file extension for icon - always show target file icon (symlinks are followed by find -L)
    if ($is_broken) {
      $ext = 'broken-symlink';
    } else {
      $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    }
    $tag = count($devs) > 1 ? 'warning' : '';
    $text[] = '<tr><td><i id="check_'.$objs.'" class="fa fa-fw fa-square-o" onclick="selectOne(this.id)"></i></td>';
    $text[] = '<td class="ext" data="'.$ext.'"><i class="'.icon_class($ext).'"></i></td>';
    $symlink_tooltip = $is_symlink ? '<a class="info" href="#" onclick="return false;"><i class="fa fa-external-link" style="margin-left:4px;"></i><span>'.htmlspecialchars($symlinks[basename($name)]['target'] ?? '').'</span></a>' : '';
    $text[] = '<td id="name_'.$objs.'" class="'.$tag.'" oncontextmenu="fileContextMenu(this.id,\'right\');return false">'.($is_broken ? nl2br(htmlspecialchars(basename($name))) : '<span style="cursor:pointer" onclick="fileEdit(\'name_'.$objs.'\')">'.nl2br(htmlspecialchars(basename($name))).'</span>').$symlink_tooltip.'</td>';
    $text[] = '<td id="owner_'.$objs.'" class="'.$tag.'">'.$owner.'</td>';
    $text[] = '<td id="perm_'.$objs.'" class="'.$tag.'">'.$perm.'</td>';
    $text[] = '<td data="'.$size.'" class="'.$tag.'">'.my_scale($size,$unit).' '.$unit.'</td>';
    $text[] = '<td data="'.$time.'" class="'.$tag.'"><span class="my_time">'.my_time($time,$fmt).'</span><span class="my_age" style="display:none">'.my_age($time).'</span></td>';
    $text[] = '<td class="loc '.$tag.'">'.my_devs($devs,$dev_name,'deviceFileContextMenu').'</td>';
    $text[] = '<td><i id="row_'.$objs.'" data="'.htmlspecialchars($name, ENT_QUOTES, 'UTF-8').'" type="f" class="fa fa-plus-square-o" onclick="fileContextMenu(this.id,\'both\')" oncontextmenu="fileContextMenu(this.id,\'both\');return false">...</i></td></tr>';
    $files[] = gzdeflate(implode($text));
    $total += $size;
  }
}

if ($link = parent_link()) echo '<tbody class="tablesorter-infoOnly"><tr><td></td><td><i class="fa fa-folder-open-o"></i></td><td>',$link,'</td><td colspan="6"></td></tr></tbody>';
echo write($dirs),write($files),'<tfoot><tr><td></td><td></td><td colspan="7">',add($objs,'object'),': ',add($dirs,'director','y','ies'),', ',add($files,'file'),' (',my_scale($total,$unit),' ',$unit,' ',_('total'),')</td></tr></tfoot>';
?>
