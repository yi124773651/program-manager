<div align="center">

# Program Manager

**A Modern, Lightweight Application Launcher & Productivity Tool**

[![Version](https://img.shields.io/badge/Version-1.1.5-blue?style=flat-square)](https://github.com/yi124773651/program-manager/releases)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/yi124773651/program-manager)

[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Pinia](https://img.shields.io/badge/Pinia-3-F7D336?style=flat-square&logo=pinia&logoColor=white)](https://pinia.vuejs.org/)

[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](../LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://www.microsoft.com/windows)

English | **[简体中文](../README.md)**

</div>

---

## 📸 Preview

### Main Interface & Settings

<div align="center">
  <img src="images/主界面.png" alt="Main Interface" width="45%" />
  <img src="images/设置界面.png" alt="Settings" width="45%" />
</div>

### Productivity Tools

<div align="center">
  <img src="images/效率工具设置.png" alt="Productivity Settings" width="45%" />
  <img src="images/快捷搜索.png" alt="Quick Search" width="45%" />
  <img src="images/快捷便签.png" alt="Quick Notes" width="45%" />
</div>

### Scene Workflow

<div align="center">
  <img src="images/场景设置.png" alt="Scene Settings" width="45%" />
  <img src="images/场景设置-选择动作类型.png" alt="Scene Actions" width="45%" />
</div>

### Maintenance Tools

<div align="center">
  <img src="images/程序维护.png" alt="Program Maintenance" width="45%" />
</div>

## ✨ Features

### Core Features
- 🚀 **Lightweight** - Only 3-5MB installer, 90% smaller than Electron apps
- ⚡ **Fast** - Cold start < 0.5s, memory usage 30-50MB
- 🎨 **Modern UI** - macOS-style interface with light/dark theme
- 📊 **Smart Sorting** - Recently used apps automatically move to top
- 🖱️ **Drag & Drop** - Batch add apps, drag to reorder
- 💻 **System Integration** - System tray, single instance, context menu

### Productivity Tools
- 🎬 **Scene Workflow** - Execute multiple actions with one click, supports 8 action types, failure strategy, and execution logs
- 📋 **Clipboard History** - Auto-record clipboard content, supports pinning
- 🔍 **Quick Search** - Spotlight-style global search across apps, clipboard, scenes, notes, to-dos, and web
- 📝 **Quick Notes** - Record ideas and to-dos anytime
- ✅ **To-do Schedule** - Dedicated to-do window with dates, completion state, and quick-search integration
- 🧮 **Calculator** - Calculate expressions directly in search box
- ⌨️ **Configurable Shortcuts** - Global launcher, quick search, notes, and to-do shortcuts with conflict hints and restore defaults
- 🎨 **Personalization** - Custom theme color, background image (local / random image API), window opacity

### Maintenance Tools
- 🧹 **Clean Invalid Items** - One-click detection of invalid programs, with confirmation before batch deletion
- 🔄 **Update Detection** - Smart update detection with version number and file metadata hybrid approach
- 📦 **Local Import / Export** - Export full local data package with import preview, selective overwrite, and pre-import backup
- 💾 **Unified Local Storage** - Scenes, notes, to-dos, clipboard, and action settings are persisted as local JSON files, with legacy data migration

## 🎬 Scene Feature

Scenes are action sequences that can be executed with one click, similar to Quicker's action combinations.

### Supported Action Types

| Action | Description |
|--------|-------------|
| 🚀 Launch App | Select and launch from added applications |
| 🛡️ Run as Admin | Launch program with administrator privileges |
| 🌐 Open URL | Open specified URL in browser |
| 📂 Open Folder | Open specified directory in Explorer |
| 📄 Open File | Open specified file with default program |
| ❌ Close App | Terminate all processes of specified program |
| ⏱️ Delay | Wait for specified seconds before continuing |
| 🔔 Send Notification | Display Windows system notification |

### Usage Examples

**Work Scene**: One-click to launch VS Code, open project folder, start local server

**Entertainment Scene**: Launch game platform, open game forum, close work software

## 🛠️ Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run tauri dev
```

### Build

```bash
npm run check:versions
npm run test
npm run build
npm run tauri build
```

Output is usually under `src-tauri/target/release/bundle/nsis/`. If `CARGO_TARGET_DIR` is set, artifacts are written under that target directory.

Recommended release checks:

```bash
cd src-tauri
cargo fmt --check
cargo test
cargo check
```

### GitHub Actions

- `CI`: runs on branch push and pull requests targeting `main`; it checks version consistency, frontend tests, frontend build, Rust formatting, Rust tests, and `cargo check`, without building a Tauri installer.
- `Release`: runs only on `v*` tags; it requires the tag version to match `package.json` / `src-tauri/tauri.conf.json`, then builds and publishes the Tauri installer.
- The release workflow no longer bumps versions automatically. Version changes, release notes, and tag creation must be completed manually before publishing.

### Windows Scripts

| Script | Description |
|--------|-------------|
| `scripts/dev.bat` | Start dev mode |
| `scripts/build.bat` | Build release |
| `scripts/clean-debug-only.bat` | Clean debug builds |

## 📖 Usage Guide

### Basic Operations

1. **Create Category** - Click `+` in sidebar
2. **Add Apps** - Drag `.exe` or `.lnk` files to app area
3. **Launch** - Click app card
4. **Manage** - Right-click for options (move, delete, open location)
5. **Reorder** - Drag to sort apps or categories

### Scene Workflow

1. **Create Scene** - Click `+` in scene area of sidebar
2. **Add Actions** - Click "Add Action" in scene editor
3. **Configure** - Select app, enter URL or path
4. **Reorder** - Drag actions to adjust execution order
5. **Execute** - Click scene to execute all actions

### App Quick Actions

Right-click app card for quick actions:

| Action | Description |
|--------|-------------|
| Open Location | Locate file in Explorer |
| Copy Path | Copy full path to clipboard |
| Run as Admin | Launch with elevated privileges |
| Kill Process | Force close program |

### Maintenance Tools

Click the "Maintenance" button at the bottom of the sidebar or open it from settings:

#### Clean Invalid Items
1. Click "Start Detection" to scan all programs
2. View invalid program list (❌ File not found, ⚠️ Network path unreachable)
3. Click "Batch Delete Invalid Items" for one-click cleanup

#### Update Detection
1. First use requires clicking "Initialize Now" to establish baseline data
2. Click "Start Update Detection" to scan for program updates
3. View update list with confidence levels:
   - 🔵 **High Confidence** - Registry version number changed
   - 🟡 **Medium Confidence** - Both file size and modification time changed
   - ⚪ **Low Confidence** - Only modification time changed

### ⚙️ Settings

| Option | Values |
|--------|--------|
| Card Size | Small / Medium / Large |
| Theme | Light / Dark / Auto |
| Theme Color | 8 preset colors |
| Background | Local image / Random image API |
| Window Opacity | 0% - 100% |
| Sort | Recent / Name / Custom |

### Productivity Tool Switches

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Clipboard History | - | Auto-record clipboard content |
| Quick Search | Ctrl+K | Spotlight-style search |
| Quick Notes | Alt+N | Quick note recording |
| To-do Schedule | Alt+T | Show or hide the dedicated to-do window |
| Calculator | - | Calculate in search box |

All global shortcuts can be changed in Settings. If saving fails, the old shortcut is preserved and the conflict or registration error is shown.

### Local Data Import / Export

In Settings, the data import/export section can:

1. Export a full local data package, including `manifest.json`, config files, scenes, notes, to-dos, clipboard, action settings, and `icons/`.
2. Select a package `manifest.json` and preview import contents.
3. Selectively overwrite data sections.
4. Automatically back up current data before import and try to restore it when import fails.

## 🏗️ Tech Stack

<table>
  <tr>
    <th>Frontend</th>
    <th>Backend</th>
  </tr>
  <tr>
    <td>
      <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vue.js&logoColor=white" alt="Vue" /><br/>
      <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /><br/>
      <img src="https://img.shields.io/badge/Pinia-3-F7D336?style=flat-square&logo=pinia&logoColor=white" alt="Pinia" /><br/>
      <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
    </td>
    <td>
      <img src="https://img.shields.io/badge/Tauri-2.0-24C8D8?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" /><br/>
      <img src="https://img.shields.io/badge/Rust-1.70+-DEA584?style=flat-square&logo=rust&logoColor=white" alt="Rust" /><br/>
      <img src="https://img.shields.io/badge/Windows_API-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows API" />
    </td>
  </tr>
</table>

## 📁 Project Structure

```
program-manager/
├── src/                    # Vue frontend
│   ├── components/         # UI components
│   │   ├── AppCard.vue          # App card
│   │   ├── CategoryList.vue     # Category list
│   │   ├── SceneEditor.vue      # Scene editor
│   │   ├── ClipboardHistory.vue # Clipboard history
│   │   ├── SpotlightSearch.vue  # Quick search
│   │   ├── QuickNotes.vue       # Quick notes
│   │   ├── MaintenancePanel.vue # Maintenance panel
│   │   └── SettingsDialog.vue   # Settings dialog
│   ├── stores/             # Pinia state management
│   │   ├── appStore.ts          # App state
│   │   ├── scenesStore.ts       # Scene state
│   │   ├── notesStore.ts        # Notes state
│   │   ├── todoStore.ts         # To-do state
│   │   ├── clipboardStore.ts    # Clipboard state
│   │   ├── maintenanceStore.ts  # Maintenance state
│   │   └── actionsStore.ts      # Actions state
│   ├── services/           # Frontend business services
│   ├── adapters/           # Tauri / clipboard / shell adapters
│   ├── types/              # TypeScript type definitions
│   └── views/              # Views
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands/       # Tauri commands
│       ├── models/         # Data models
│       ├── storage/        # JSON storage, atomic write, backup, and migration
│       └── utils/          # Utilities
│           ├── app_validator.rs # App validation
│           └── update_checker.rs # Update detection
└── scripts/                # Build scripts
```

## 🗺️ Roadmap

- [x] Category & app management
- [x] Drag & drop support
- [x] Auto icon extraction
- [x] Theme switching
- [x] System tray
- [x] Scene workflow
- [x] Clipboard history
- [x] Quick search
- [x] Quick notes
- [x] Custom theme color
- [x] Background image (local & random image API)
- [x] Clean invalid items
- [x] Update detection
- [x] Global hotkeys
- [x] Import/Export
- [x] Legacy data migration
- [x] Unified JSON local storage
- [ ] Usage statistics

## ❓ FAQ

<details>
<summary><b>Why is it so fast?</b></summary>
<br/>
Tauri uses native WebView instead of bundled Chromium, and Rust binaries start instantly.
</details>

<details>
<summary><b>Where is config stored?</b></summary>
<br/>
Windows: <code>%APPDATA%/program-manager/</code>
<br/>
Main files include <code>config.json</code>, <code>scenes.json</code>, <code>notes.json</code>, <code>todos.json</code>, <code>clipboard.json</code>, <code>actions.json</code>, <code>migrations.json</code>, <code>icons/</code>, and <code>backups/</code>.
</details>

<details>
<summary><b>Does closing window exit the app?</b></summary>
<br/>
No, it minimizes to system tray. Right-click tray icon → Exit to quit.
</details>

<details>
<summary><b>Where is scene data stored?</b></summary>
<br/>
Scene data is now stored in <code>%APPDATA%/program-manager/scenes.json</code>. Legacy localStorage data is migrated to local JSON files on startup, with automatic backup before migration.
</details>

## 📄 License

[MIT](../LICENSE)

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop apps
- [Vue 3](https://vuejs.org/) - The Progressive JavaScript Framework
- [Pinia](https://pinia.vuejs.org/) - Intuitive Vue Store
- [Lucide Icons](https://lucide.dev/) - Beautiful open-source icons
- [SortableJS](https://sortablejs.github.io/Sortable/) - Drag and drop library

---

<div align="center">

If you find this project helpful, please consider giving it a ⭐ Star!

</div>
