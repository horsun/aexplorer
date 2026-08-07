#!/bin/bash
# build.sh — 打包 AExplorer 插件（符合 Unraid 官方规范）
# 官方规范参考: https://github.com/mstrhakr/plugin-docs
# 产出: plugin/aexplorer-<version>.txz + plugin/aexplorer.plg（SHA256 自动注入）
set -euo pipefail

NAME="aexplorer"
VERSION="0.8.7"
ROOT="$(cd "$(dirname "$0")" && pwd)"
PKG="$ROOT/package"
TXZ="$ROOT/plugin/${NAME}-${VERSION}.txz"
PLG="$ROOT/plugin/${NAME}.plg"

echo "==> 清理旧产物"
rm -rf "$PKG"
rm -f "$ROOT"/plugin/${NAME}-*.txz

echo "==> 复制文件树"
mkdir -p "$PKG"
cp -a "$ROOT/source/." "$PKG/"

echo "==> 转换 CRLF → LF（官方：防止 bad interpreter）"
find "$PKG" -type f \( -name "*.sh" -o -name "*.page" -o -name "*.cfg" \) -exec sed -i 's/\r$//' {} \;

echo "==> 设置权限（官方：目录 755 / 文件 644 / 脚本 755）"
find "$PKG" -type d -exec chmod 755 {} \;
find "$PKG" -type f -exec chmod 644 {} \;
find "$PKG" -name "*.sh" -exec chmod 755 {} \;

echo "==> 打包 txz（root 属主）"
cd "$PKG"
tar --owner=root --group=root -cJf "$TXZ" .
cd "$ROOT"

echo "==> 计算 SHA256"
SHA256=$(sha256sum "$TXZ" | cut -d' ' -f1)
echo "    SHA256: $SHA256"

echo "==> 注入 SHA256 到 .plg"
sed -i "s|<SHA256>.*</SHA256>|<SHA256>$SHA256</SHA256>|" "$PLG"
grep -o "<SHA256>[^<]*</SHA256>" "$PLG"

echo "==> 完成: $TXZ"
ls -lh "$TXZ"
