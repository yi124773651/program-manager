<div align="center">

# Program Manager

**简洁高效的程序启动器**

[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Pinia](https://img.shields.io/badge/Pinia-3-F7D336?style=flat-square&logo=pinia&logoColor=white)](https://pinia.vuejs.org/)

[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://www.microsoft.com/windows)

**[English](./docs/README_EN.md)** | 简体中文

</div>

---

## 📸 预览

<div align="center">
  <img src="docs/images/主界面.png" alt="主界面" width="45%" />
  <img src="docs/images/设置界面.png" alt="设置界面" width="45%" />
</div>

## ✨ 特性

- 🚀 **轻量快速** - 安装包仅 3-5MB，比 Electron 应用小 90%
- ⚡ **极速启动** - 冷启动 < 0.5s，内存占用 30-50MB
- 🎨 **现代界面** - macOS 风格 UI，支持亮色/暗色主题
- 📊 **智能排序** - 最近使用的应用自动置顶
- 🖱️ **拖拽操作** - 批量添加应用，拖拽排序
- 💻 **系统集成** - 系统托盘、单实例运行、右键菜单

## 🛠️ 快速开始

### 环境要求

- Node.js 18+
- Rust 1.70+

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev
```

### 构建发布

```bash
npm run tauri build
```

构建产物位于：`src-tauri/target/release/bundle/`

### Windows 脚本

| 脚本 | 说明 |
|------|------|
| `scripts/dev.bat` | 启动开发模式 |
| `scripts/build.bat` | 构建发布版本 |
| `scripts/clean-debug-only.bat` | 清理调试构建 |

## 📖 使用指南

1. **创建分类** - 点击侧边栏的 `+` 按钮
2. **添加应用** - 将 `.exe` 或 `.lnk` 文件拖入应用区域
3. **启动程序** - 点击应用卡片
4. **管理应用** - 右键点击查看选项（移动、删除、打开位置）
5. **调整顺序** - 拖拽排序应用或分类

### ⚙️ 设置选项

| 选项 | 可选值 |
|------|--------|
| 卡片大小 | 小 / 中 / 大 |
| 主题 | 亮色 / 暗色 / 跟随系统 |
| 排序方式 | 最近使用 / 名称 / 自定义 |

## 🏗️ 技术栈

<table>
  <tr>
    <th>前端</th>
    <th>后端</th>
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

## 📁 项目结构

```
program-manager/
├── src/                    # Vue 前端
│   ├── components/         # UI 组件
│   ├── stores/             # Pinia 状态管理
│   └── views/              # 视图
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── commands/       # Tauri 命令
│       ├── models/         # 数据模型
│       └── utils/          # 工具函数
└── scripts/                # 构建脚本
```

## 🗺️ 路线图

- [x] 分类与应用管理
- [x] 拖拽支持
- [x] 自动提取图标
- [x] 主题切换
- [x] 系统托盘
- [ ] 使用统计
- [ ] 全局热键
- [ ] 导入/导出

## ❓ 常见问题

<details>
<summary><b>为什么启动这么快？</b></summary>
<br/>
Tauri 使用系统原生 WebView 而非打包 Chromium，且 Rust 二进制文件启动几乎是即时的。
</details>

<details>
<summary><b>配置文件存储在哪里？</b></summary>
<br/>
Windows: <code>%APPDATA%/program-manager/config.json</code>
</details>

<details>
<summary><b>关闭窗口会退出应用吗？</b></summary>
<br/>
不会，窗口会最小化到系统托盘。右键点击托盘图标 → 退出 即可完全退出。
</details>

## 📄 许可证

[MIT](LICENSE)

## 🙏 致谢

- [Tauri](https://tauri.app/) - 构建更小、更快、更安全的桌面应用
- [Vue 3](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Pinia](https://pinia.vuejs.org/) - Vue 状态管理
- [Lucide Icons](https://lucide.dev/) - 精美的开源图标库

---

<div align="center">

如果这个项目对你有帮助，欢迎 ⭐ Star 支持一下！

</div>
