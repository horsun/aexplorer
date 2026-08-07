# 🦐 AExplorer

A file manager rewritten on top of **Unraid 7's built-in Dynamix File Manager**: it keeps all of the official backend mechanisms (Control.php protocol / nchan task queue / ACE editor), while the frontend is rewritten in a **Windows 11 Explorer style** (vanilla JS + virtual scrolling, local vendored libraries, zero external-network dependencies).

![Version](https://img.shields.io/badge/version-0.8.7-blue) ![Based On](https://img.shields.io/badge/based_on-Unraid_7_builtin-orange)

**[中文](README.md) | [English](README.en.md)**

> 🤖 **Powered by AI** — This project is developed, debugged, and maintained with the assistance of an AI agent (Nous Research Hermes).

## 🖼 Screenshots

![Demo](docs/screenshots/demo.gif)

![Main interface](docs/screenshots/main.png)

![Embedded terminal](docs/screenshots/terminal.png)

![ACE editor](docs/screenshots/editor.png)

## 📚 Documentation

- **Design document** (architecture / feature list / security design / changelog): `docs/DESIGN.md`
- **English version**: `docs/DESIGN.en.md`

## 🧭 Keyboard Shortcuts

`F5` refresh · `F2` rename · `Delete` delete · `Ctrl+F` search · `Ctrl+A` select all · `Backspace` parent directory · `Alt+←/→/↑` navigation · mouse side buttons back/forward · `Ctrl+1/2` view · **letter keys first-letter select** (type-ahead)
