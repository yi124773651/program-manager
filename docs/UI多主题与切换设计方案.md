# 程序管理器 UI 多主题与切换设计方案审阅版

> 本文档基于当前项目代码审阅原《UI 多主题与切换设计方案》，目标是保留“轻量 CSS 变量 + 毛玻璃质感”的方向，同时补齐和当前 Tauri + Vue 实现不匹配的部分，避免方案落地后出现主窗口可用、独立窗口失效或用户自定义主题色被覆盖的问题。

---

## 1. 审阅结论

原方案的方向可继续采用：用 CSS 变量承载主题预设，用配置字段持久化用户选择，不引入第三方主题库，整体符合当前项目的轻量化风格。

但原方案还不够贴近当前工程，主要遗漏如下：

1. **只考虑了 `App.vue`，没有覆盖多入口窗口**
   当前项目存在 `src/main.ts`、`src/search-main.ts`、`src/todo-main.ts`、`src/notes-main.ts` 四个前端入口；快捷搜索、待办、便签窗口由 `src-tauri/src/utils/shortcuts.rs` 动态创建。若只在 `App.vue` 中设置 `data-theme-preset`，独立窗口不会稳定应用主题。

2. **没有处理现有 `theme: light | dark | auto` 的真实状态**
   `src/types/index.ts` 已定义 `theme`，但当前 UI 中没有对应切换控件，`src/style.css` 主要依赖 `@media (prefers-color-scheme: dark)`。新增 `themePreset` 时必须明确二者关系，否则 `@media` 规则可能覆盖预设主题。

3. **主题预设和自定义主题色边界不清**
   当前 `SettingsDialog.vue` 已有主题色拾色器，`App.vue` 会通过内联 CSS 变量覆盖 `--primary-color` 和 `--primary-hover`。如果主题预设 CSS 也直接反复写入主色，切换预设时容易让用户误以为自定义主色丢失。

4. **独立窗口存在硬编码毛玻璃背景**
   `SearchWindow.vue`、`TodoWindow.vue`、`NotesWindow.vue` 中存在 `rgba(...)`、`blur(...) saturate(...)` 和 `@media (prefers-color-scheme: dark)` 的局部样式。仅扩展 `src/style.css` 不足以统一三套主题。

5. **配置迁移说明不完整**
   Rust 侧 `AppSettings` 已使用 `#[serde(default)]`，新增可选字段可以兼容旧配置，但文档需要明确默认值、无效值回退、导入本地数据后的刷新链路。

6. **可读性保障需要落到变量和组件清单**
   原文说“功能说明不被覆盖”，但没有列出需要重点核验的组件。当前项目中 `kbd`、placeholder、副标题、状态提示分散在 `SettingsDialog.vue`、`SpotlightSearch.vue`、`SearchWindow.vue`、`TodoItemRow.vue`、`SceneEditor.vue` 等组件，需要有明确验收点。

---

## 2. 推荐实现方案

### 2.1 配置模型

建议新增主题预设字段，但不要替代现有 `theme` 字段。

```typescript
export type ThemePreset = 'fresh-dawn' | 'deep-obsidian' | 'warm-terracotta'

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  themePreset?: ThemePreset
  themeColor?: string
}
```

推荐命名使用面向用户语义的稳定 ID：

- `fresh-dawn`：清新晨曦
- `deep-obsidian`：深海黑曜
- `warm-terracotta`：赤陶暖砂

默认值建议为 `fresh-dawn`。当前项目默认主题色是 `#007AFF`，如果为了降低迁移惊扰，应保留这个默认主色；如果产品上确定新版默认风格使用薄荷绿，再将 `DEFAULT_CONFIG.settings.themeColor` 调整为 `#0d9488`。两种选择都可行，但必须在版本更新说明中写清楚。

### 2.2 Rust 模型

在 `src-tauri/src/models/mod.rs` 的 `AppSettings` 中新增字段：

```rust
#[serde(skip_serializing_if = "Option::is_none")]
#[serde(rename = "themePreset")]
pub theme_preset: Option<String>,
```

在 `Default for AppSettings` 中增加：

```rust
theme_preset: Some("fresh-dawn".to_string()),
```

当前 `AppSettings` 已有 `#[serde(default)]`，旧配置缺少 `themePreset` 时可以自动填充默认值。仍建议前端再做一次归一化，避免用户手动编辑配置或旧数据包导入无效字符串。

### 2.3 前端主题应用工具

不要把主题应用逻辑继续写在 `App.vue` 中。建议新增 `src/services/themeService.ts`，由四个入口共同调用。

核心职责：

1. 归一化 `themePreset`，无效值回退到 `fresh-dawn`。
2. 将 `themePreset` 写入 `document.documentElement.dataset.themePreset`。
3. 将 `theme` 写入 `document.documentElement.dataset.themeMode`，取值为 `light | dark | auto`。
4. 应用 `themeColor` 到 `--primary-color`、`--primary-hover`。
5. 应用 `windowOpacity` 到 `--window-opacity`。

示例结构：

```typescript
export const THEME_PRESETS = ['fresh-dawn', 'deep-obsidian', 'warm-terracotta'] as const
export type ThemePreset = typeof THEME_PRESETS[number]

export function normalizeThemePreset(value: unknown): ThemePreset {
  return THEME_PRESETS.includes(value as ThemePreset) ? value as ThemePreset : 'fresh-dawn'
}

export function applyThemeSettings(settings: AppSettings) {
  const root = document.documentElement
  root.dataset.themePreset = normalizeThemePreset(settings.themePreset)
  root.dataset.themeMode = settings.theme || 'auto'

  if (settings.themeColor) {
    root.style.setProperty('--primary-color', settings.themeColor)
    root.style.setProperty('--primary-hover', getHoverColor(settings.themeColor))
  }

  if (settings.windowOpacity !== undefined) {
    root.style.setProperty('--window-opacity', String(settings.windowOpacity))
  }
}
```

四个入口建议统一使用组合式函数或入口初始化函数：

- `src/App.vue`
- `src/SearchWindow.vue`
- `src/TodoWindow.vue`
- `src/NotesWindow.vue`

主窗口已经监听 `settings.themeColor` 和 `settings.windowOpacity`，后续应改为监听 `settings` 中与主题有关的字段并统一调用 `applyThemeSettings`。独立窗口在 `appStore.init()` 或各自 Store 初始化之后同样调用。

### 2.4 CSS 变量组织

建议将 `src/style.css` 顶部变量重构为三层：

1. `:root`：只放兜底变量，保证无属性时也能显示。
2. `html[data-theme-preset="..."]`：定义预设外观变量。
3. `html[data-theme-mode="dark"]`、`html[data-theme-mode="light"]`、`@media (prefers-color-scheme: dark)`：只处理“模式”覆盖，且覆盖范围要受控。

关键点：主题预设必须排在 `@media (prefers-color-scheme: dark)` 之后，或者使用更明确的选择器，避免系统暗色媒体查询覆盖用户选中的亮色/暖色预设。

推荐结构：

```css
:root {
  --window-opacity: 0.95;
  --bg-primary: #ffffff;
  --text-primary: #1d1d1f;
  --text-secondary: #5f6368;
  --primary-color: #007aff;
  --primary-hover: #0051d5;
  --backdrop-blur: blur(12px);
}

@media (prefers-color-scheme: dark) {
  html[data-theme-mode="auto"] {
    --bg-primary: #1c1c1e;
    --text-primary: #f5f5f7;
    --text-secondary: #c7c7cc;
  }
}

html[data-theme-mode="dark"] {
  --bg-primary: #1c1c1e;
  --text-primary: #f5f5f7;
  --text-secondary: #c7c7cc;
}

html[data-theme-preset="fresh-dawn"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border-color: #cbd5e1;
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.25);
  --backdrop-blur: blur(20px) saturate(190%);
  --window-bg: rgba(255, 255, 255, 0.95);
}
```

`--primary-color` 和 `--primary-hover` 建议由用户主题色控制。预设可以提供 `defaultPrimaryColor` 给设置页“恢复预设主色”按钮使用，但不要在 CSS 预设中强制覆盖用户已选主色。

### 2.5 独立窗口样式改造

当前独立窗口样式不能只依赖全局变量，因为它们有局部硬编码：

- `src/SearchWindow.vue` 的 `.search-window`
- `src/TodoWindow.vue` 的 `.todo-window`
- `src/NotesWindow.vue` 的 `.notes-window`

建议统一改为：

```css
.search-window,
.todo-window,
.notes-window {
  background: var(--glass-bg);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border: 1px solid var(--glass-border);
}
```

如各窗口需要不同透明度，应新增更具体变量，例如：

- `--spotlight-bg`
- `--floating-window-bg`
- `--floating-window-border`

不要继续在窗口组件内写 `@media (prefers-color-scheme: dark)` 的硬编码背景，否则主题预设会被系统模式打断。

### 2.6 设置界面

`src/components/SettingsDialog.vue` 已有“外观设置”和主题色拾色器，建议在主题色之前增加“界面风格”分段控件。

交互建议：

1. 主题预设卡片显示名称、用途和小型色块，不需要引入新图标库。
2. 切换预设只更新 `themePreset`，不自动改 `themeColor`。
3. 提供“使用该风格推荐主色”按钮，用户明确点击后才写入 `themeColor`。
4. 保留背景来源、背景遮罩、窗口透明度现有控件。

这样可以保持用户当前自定义主色不被主题预设意外覆盖。

### 2.7 配置同步和数据导入

当前 `appStore.setupConfigChangedListener()` 会监听后端 `config-changed` 事件，并在 `applyConfig()` 中替换配置。主题逻辑应挂在配置变更后的响应式监听上，而不是只在首次挂载时应用。

需要覆盖的链路：

1. 设置页修改主题预设后，主窗口立即生效。
2. `config-changed` 事件来自数据导入时，主窗口主题立即刷新。
3. 快捷搜索、便签、待办窗口打开时加载当前配置并应用主题。
4. 已打开的独立窗口如果需要跟随设置实时刷新，应同样监听 `config-changed`；如果暂不实时刷新，文档和验收中要明确“重新打开后生效”。

推荐实现为实时刷新，避免同一应用同时出现两套主题。

---

## 3. 三套主题保留与微调建议

### 3.1 清新晨曦

适合白天和带背景图的主窗口。保留浅色玻璃方向，但 `--text-secondary` 不建议低于 `#475569`，否则设置说明、快捷键说明和卡片副标题会偏淡。

推荐变量：

```css
html[data-theme-preset="fresh-dawn"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border-color: #cbd5e1;
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.25);
  --backdrop-blur: blur(20px) saturate(190%);
  --bg-primary-transparent: rgba(255, 255, 255, 0.65);
  --bg-secondary-transparent: rgba(248, 250, 252, 0.65);
  --card-bg-transparent: rgba(255, 255, 255, 0.5);
  --toolbar-bg-transparent: rgba(255, 255, 255, 0.65);
}
```

### 3.2 深海黑曜

适合夜间，但要注意当前 `SettingsDialog.vue`、`MaintenancePanel.vue` 等组件里有不少 `rgba(0, 122, 255, ...)`、`rgba(255, 59, 48, ...)` 状态色。主题预设不能只换背景，还要确认成功、警告、危险状态在暗色背景上足够清晰。

推荐变量：

```css
html[data-theme-preset="deep-obsidian"] {
  --bg-primary: #0b0f19;
  --bg-secondary: #111827;
  --bg-tertiary: #1f2937;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --border-color: #334155;
  --glass-bg: rgba(11, 15, 25, 0.62);
  --glass-border: rgba(255, 255, 255, 0.12);
  --backdrop-blur: blur(24px) saturate(180%);
  --bg-primary-transparent: rgba(11, 15, 25, 0.68);
  --bg-secondary-transparent: rgba(17, 24, 39, 0.68);
  --card-bg-transparent: rgba(21, 31, 50, 0.58);
  --toolbar-bg-transparent: rgba(11, 15, 25, 0.68);
}
```

### 3.3 赤陶暖砂

暖色方案可保留，但不建议让整个应用过度偏黄。当前项目是程序管理和效率工具，信息密度较高，暖色应主要体现在背景、边框和强调色，正文仍保持高对比。

推荐变量：

```css
html[data-theme-preset="warm-terracotta"] {
  --bg-primary: #fdfbf7;
  --bg-secondary: #f5efe6;
  --bg-tertiary: #eae0d5;
  --text-primary: #2d1f18;
  --text-secondary: #5f4b3f;
  --border-color: #e6dfd5;
  --glass-bg: rgba(253, 251, 247, 0.68);
  --glass-border: rgba(194, 65, 12, 0.12);
  --backdrop-blur: blur(16px) saturate(140%);
  --bg-primary-transparent: rgba(253, 251, 247, 0.76);
  --bg-secondary-transparent: rgba(245, 239, 230, 0.76);
  --card-bg-transparent: rgba(255, 255, 255, 0.66);
  --toolbar-bg-transparent: rgba(253, 251, 247, 0.76);
}
```

---

## 4. 建议实施步骤

1. **补类型和默认值**
   修改 `src/types/index.ts`、`src-tauri/src/models/mod.rs`，新增 `ThemePreset` / `themePreset`，保持旧配置兼容。

2. **新增主题服务**
   新增 `src/services/themeService.ts`，集中处理预设归一化、DOM 属性、主题色、窗口透明度。

3. **接入四个前端入口**
   主窗口、快捷搜索、待办、便签都要在初始化后调用主题服务。主窗口还要监听设置变化；独立窗口建议监听 `config-changed` 或通过 `appStore.init()` 后的响应式监听保持一致。

4. **重构全局 CSS 变量**
   在 `src/style.css` 中按 `:root`、`data-theme-mode`、`data-theme-preset` 分层组织变量，处理 `@media (prefers-color-scheme: dark)` 的覆盖顺序。

5. **替换独立窗口硬编码玻璃样式**
   重点处理 `SearchWindow.vue`、`TodoWindow.vue`、`NotesWindow.vue` 的窗口背景、边框和局部暗色媒体查询。

6. **扩展设置界面**
   在 `SettingsDialog.vue` 的外观设置中增加“界面风格”控件，切换时只更新 `themePreset`。

7. **补充最小测试**
   给 `themeService` 增加单元测试，覆盖无效预设回退、主题色应用、窗口透明度应用。配置保存已有 `configService.test.ts`，不必重复测试 Tauri invoke 封装。

---

## 5. 验收清单

实现后至少验证以下场景：

1. 主窗口切换三套主题后，侧边栏、工具栏、卡片、右键菜单、设置弹窗都同步变化。
2. 快捷搜索窗口重新打开后应用当前主题；若要求实时同步，打开状态下切换主题也要立即变化。
3. 待办窗口和便签窗口不再被局部 `@media (prefers-color-scheme: dark)` 覆盖。
4. 用户自定义主题色在切换主题预设后仍保留。
5. 点击“使用该风格推荐主色”后，才更新 `themeColor`。
6. 背景图、本地图床、背景遮罩、窗口透明度和主题预设可叠加使用。
7. `kbd`、placeholder、设置说明、空状态说明、维护日志文字在三套主题下都可读。
8. 旧配置文件没有 `themePreset` 时可以正常启动，并自动按默认预设显示。
9. 导入本地数据触发 `config-changed` 后，主题状态不会停留在旧配置。

建议执行：

```bash
npm run test
npm run build
```

---

## 6. 最终建议

更好的实现方案不是继续扩大 CSS 片段，而是先建立一条项目级主题链路：

`配置模型 -> 主题服务 -> html data 属性 -> CSS 变量 -> 四个窗口共享`

这样既保留原方案的轻量优势，又能贴合当前项目的多窗口结构、配置持久化方式和已有外观设置。三套主题配色可以沿用，但必须把主色与预设解耦，把局部硬编码玻璃样式收敛到 CSS 变量，否则实际落地时会出现主题不一致和用户设置被覆盖的问题。
