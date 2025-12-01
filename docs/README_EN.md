<div align="center">

# Program Manager

**A Modern, Lightweight Application Launcher**

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

<div align="center">
  <img src="images/主界面.png" alt="Main Interface" width="45%" />
  <img src="images/设置界面.png" alt="Settings" width="45%" />
</div>

## ✨ Features

- 🚀 **Lightweight** - Only 3-5MB installer, 90% smaller than Electron apps
- ⚡ **Fast** - Cold start < 0.5s, memory usage 30-50MB
- 🎨 **Modern UI** - macOS-style interface with light/dark theme
- 📊 **Smart Sorting** - Recently used apps automatically move to top
- 🖱️ **Drag & Drop** - Batch add apps, drag to reorder
- 💻 **System Integration** - System tray, single instance, context menu

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
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

### Windows Scripts

| Script | Description |
|--------|-------------|
| `scripts/dev.bat` | Start dev mode |
| `scripts/build.bat` | Build release |
| `scripts/clean-debug-only.bat` | Clean debug builds |

## 📖 Usage

1. **Create Category** - Click `+` in sidebar
2. **Add Apps** - Drag `.exe` or `.lnk` files to app area
3. **Launch** - Click app card
4. **Manage** - Right-click for options (move, delete, open location)
5. **Reorder** - Drag to sort apps or categories

### ⚙️ Settings

| Option | Values |
|--------|--------|
| Card Size | Small / Medium / Large |
| Theme | Light / Dark / Auto |
| Sort | Recent / Name / Custom |

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
│   ├── stores/             # Pinia store
│   └── views/              # Views
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands/       # Tauri commands
│       ├── models/         # Data models
│       └── utils/          # Utilities
└── scripts/                # Build scripts
```

## 🗺️ Roadmap

- [x] Category & app management
- [x] Drag & drop support
- [x] Auto icon extraction
- [x] Theme switching
- [x] System tray
- [ ] Usage statistics
- [ ] Global hotkeys
- [ ] Import/Export

## ❓ FAQ

<details>
<summary><b>Why is it so fast?</b></summary>
<br/>
Tauri uses native WebView instead of bundled Chromium, and Rust binaries start instantly.
</details>

<details>
<summary><b>Where is config stored?</b></summary>
<br/>
Windows: <code>%APPDATA%/program-manager/config.json</code>
</details>

<details>
<summary><b>Does closing window exit the app?</b></summary>
<br/>
No, it minimizes to system tray. Right-click tray icon → Exit to quit.
</details>

## 📄 License

[MIT](../LICENSE)

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop apps
- [Vue 3](https://vuejs.org/) - The Progressive JavaScript Framework
- [Pinia](https://pinia.vuejs.org/) - Intuitive Vue Store
- [Lucide Icons](https://lucide.dev/) - Beautiful open-source icons

---

<div align="center">

If you find this project helpful, please consider giving it a ⭐ Star!

</div>
