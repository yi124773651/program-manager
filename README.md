# Program Manager

A modern, lightweight application launcher built with Tauri + Vue 3.

## Preview
<div align="center">
    <tr>
      <td><img src="docs/images/主界面.png" alt="主界面" /></td>
      <td><img src="docs/images/设置界面.png" alt="设置界面" /></td>
    </tr>
</div>

## Features

- **Lightweight** - Only 3-5MB installer, 90% smaller than Electron apps
- **Fast** - Cold start <0.5s, memory usage 30-50MB
- **Modern UI** - macOS-style interface with light/dark theme
- **Smart Sorting** - Recently used apps automatically move to top
- **Drag & Drop** - Batch add apps, drag to reorder
- **System Integration** - System tray, single instance, context menu

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+

### Development

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

### Windows Scripts

- `scripts/dev.bat` - Start dev mode
- `scripts/build.bat` - Build release
- `scripts/clean-debug-only.bat` - Clean debug builds

## Usage

1. **Create Category** - Click `+` in sidebar
2. **Add Apps** - Drag `.exe` or `.lnk` files to app area
3. **Launch** - Click app card
4. **Manage** - Right-click for options (move, delete, open location)
5. **Reorder** - Drag to sort apps or categories

### Settings

- Card size: Small / Medium / Large
- Theme: Light / Dark / Auto
- Sort: Recent / Name / Custom

## Tech Stack

| Frontend | Backend |
|----------|---------|
| Vue 3 | Tauri 2.0 |
| TypeScript | Rust |
| Pinia | Windows API |
| Vite 7 | |

## Project Structure

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

## Roadmap

- [x] Category & app management
- [x] Drag & drop support
- [x] Auto icon extraction
- [x] Theme switching
- [x] System tray
- [ ] Usage statistics
- [ ] Global hotkeys
- [ ] Import/Export

## FAQ

<details>
<summary>Why is it so fast?</summary>
Tauri uses native WebView instead of bundled Chromium, and Rust binaries start instantly.
</details>

<details>
<summary>Where is config stored?</summary>
Windows: <code>%APPDATA%/program-manager/config.json</code>
</details>

<details>
<summary>Does closing window exit the app?</summary>
No, it minimizes to system tray. Right-click tray icon → Exit to quit.
</details>

## License

[MIT](LICENSE)

## Acknowledgments

- [Tauri](https://tauri.app/)
- [Vue 3](https://vuejs.org/)
- [Pinia](https://pinia.vuejs.org/)
- [Lucide Icons](https://lucide.dev/)
