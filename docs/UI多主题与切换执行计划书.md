# 程序管理器 UI 多主题与切换执行计划书

> 本执行计划书配套 `docs/UI多主题与切换设计方案.md` 使用，目标是在不引入第三方主题库、不破坏现有用户外观设置的前提下，落地三套主题预设，并保证主窗口、快捷搜索、待办、便签四类窗口主题一致。

## 1. 执行原则

1. 先打通主题链路，再优化视觉细节。
2. 主题预设不覆盖用户自定义主题色。
3. 主窗口和独立窗口必须共享同一套主题应用逻辑。
4. 旧配置缺少主题字段时必须平滑回退到默认预设。
5. CSS 变量优先，避免在组件中继续新增硬编码颜色和毛玻璃参数。
6. 每个阶段都要可单独验证，避免一次性改动过大。

## 2. 范围与非目标

本轮实现范围：

1. 新增三套主题预设：清新晨曦、深海黑曜、赤陶暖砂。
2. 新增 `themePreset` 配置字段并保持旧配置兼容。
3. 新增统一主题服务，支撑四个前端入口。
4. 重构全局 CSS 变量和独立窗口玻璃样式。
5. 在设置界面增加界面风格切换。
6. 补充主题服务单元测试和手动验收清单。

本轮不做：

1. 不引入第三方主题库。
2. 不做在线主题市场。
3. 不做用户自定义完整主题编辑器。
4. 不重设计整体布局。
5. 不改变现有背景图、背景遮罩、窗口透明度的用户语义。

## 3. 总体阶段

本轮任务分为 6 个阶段：

1. 阶段一：配置模型与默认值。
2. 阶段二：主题服务与测试。
3. 阶段三：全局 CSS 变量重构。
4. 阶段四：多窗口主题接入。
5. 阶段五：设置界面与交互闭环。
6. 阶段六：视觉回归、轻量验证和发布说明。

## 4. 阶段一：配置模型与默认值

### 4.1 目标

让前端类型、默认配置和 Rust 模型同时识别 `themePreset`，保证旧配置和本地数据导入不会破坏应用启动。

### 4.2 任务

1. 修改 `src/types/index.ts`：
   - 新增 `ThemePreset` 联合类型。
   - 在 `AppSettings` 中新增 `themePreset?: ThemePreset`。
   - 在 `DEFAULT_CONFIG.settings` 中增加 `themePreset: 'fresh-dawn'`。

2. 修改 `src-tauri/src/models/mod.rs`：
   - 在 `AppSettings` 中新增 `theme_preset: Option<String>`。
   - 使用 `#[serde(rename = "themePreset")]` 保持前后端字段一致。
   - 在 `Default for AppSettings` 中设置默认值 `fresh-dawn`。

3. 明确默认主题色策略：
   - 优先保留当前默认 `#007AFF`，降低迁移惊扰。
   - 三套预设的推荐主色只作为设置页按钮使用，不在切换预设时自动写入。

### 4.3 交付物

1. 前端主题预设类型。
2. Rust 配置字段。
3. 默认配置兼容能力。

### 4.4 验收标准

1. 旧配置缺少 `themePreset` 时应用可正常启动。
2. 前端 `settings.themePreset` 可读取默认值。
3. 保存配置后 JSON 中字段名为 `themePreset`。
4. 不改变用户已有 `themeColor`。

## 5. 阶段二：主题服务与测试

### 5.1 目标

把主题应用逻辑从 `App.vue` 抽出，形成四个入口可复用的前端服务。

### 5.2 任务

1. 新增 `src/services/themeService.ts`：
   - 导出 `THEME_PRESETS`。
   - 导出 `normalizeThemePreset`。
   - 导出 `applyThemeSettings`。
   - 支持写入 `data-theme-preset`。
   - 支持写入 `data-theme-mode`。
   - 支持应用 `themeColor` 到 `--primary-color` 和 `--primary-hover`。
   - 支持应用 `windowOpacity` 到 `--window-opacity`。

2. 保留现有主色 hover 计算逻辑：
   - 将 `App.vue` 中的 `hexToRgb` 和 hover 色计算迁移到主题服务。
   - 对非法颜色做容错，非法值不更新 hover 色。

3. 新增 `src/services/themeService.test.ts`：
   - 无效预设回退到 `fresh-dawn`。
   - 合法预设原样保留。
   - `applyThemeSettings` 正确写入根节点数据属性。
   - `themeColor` 正确写入主色变量。
   - `windowOpacity` 正确写入窗口透明度变量。

### 5.3 交付物

1. `themeService.ts`。
2. `themeService.test.ts`。
3. 从 `App.vue` 移除重复主题工具函数的准备条件。

### 5.4 验收标准

1. 主题服务不依赖 Vue 组件实例。
2. 单元测试覆盖默认值、非法值和 CSS 变量写入。
3. 后续四个入口可以共用同一个函数。

## 6. 阶段三：全局 CSS 变量重构

### 6.1 目标

让 `src/style.css` 成为主题变量的唯一主来源，解决现有 `@media (prefers-color-scheme: dark)` 和主题预设互相覆盖的问题。

### 6.2 任务

1. 重构 `src/style.css` 顶部变量结构：
   - `:root` 只保留兜底变量。
   - `html[data-theme-mode="dark"]` 处理强制暗色模式。
   - `html[data-theme-mode="light"]` 处理强制亮色模式。
   - `@media (prefers-color-scheme: dark)` 只作用于 `html[data-theme-mode="auto"]`。
   - 三套 `html[data-theme-preset="..."]` 写在不被媒体查询覆盖的位置。

2. 增加或统一变量：
   - `--glass-bg`
   - `--glass-border`
   - `--backdrop-blur`
   - `--bg-primary-transparent`
   - `--bg-secondary-transparent`
   - `--card-bg-transparent`
   - `--toolbar-bg-transparent`
   - `--floating-window-bg`
   - `--floating-window-border`

3. 保持自定义主色优先级：
   - 预设 CSS 不固定写死 `--primary-color`。
   - 如果需要推荐主色，放到主题元数据而不是全局 CSS 强制覆盖。

4. 检查全局 body 背景：
   - 当前 `body` 使用 `rgba(..., var(--window-opacity))`。
   - 建议改为使用 `--window-bg` 或按 `data-theme-mode` 设置，避免深色预设下 body 仍走浅色背景。

### 6.3 交付物

1. 三套主题变量。
2. 受控的亮暗模式覆盖规则。
3. 主色与预设解耦后的全局样式。

### 6.4 验收标准

1. 手动给 `html` 设置三套 `data-theme-preset` 都能看到变量变化。
2. 系统暗色模式不会覆盖用户选择的浅色或暖色预设。
3. 自定义 `themeColor` 在切换预设后仍保留。
4. 背景图、背景遮罩、窗口透明度仍能叠加。

## 7. 阶段四：多窗口主题接入

### 7.1 目标

让主窗口、快捷搜索、待办、便签四类窗口都使用同一套主题应用逻辑。

### 7.2 任务

1. 修改 `src/App.vue`：
   - 删除本地 `applyThemeColor` 和 `hexToRgb`。
   - 引入 `applyThemeSettings`。
   - 监听 `settings.themePreset`、`settings.theme`、`settings.themeColor`、`settings.windowOpacity`。
   - 初始化和配置变更后统一调用主题服务。

2. 修改 `src/SearchWindow.vue`：
   - 在 `appStore.init()` 后调用主题服务。
   - 增加对 `appStore.settings` 的主题字段监听。
   - 移除 `.search-window` 中硬编码 `rgba`、`blur` 和暗色媒体查询背景。

3. 修改 `src/TodoWindow.vue`：
   - 引入 `useAppStore` 或复用统一入口初始化逻辑。
   - 在窗口初始化后应用主题。
   - 移除 `.todo-window` 中硬编码玻璃背景和暗色媒体查询背景。

4. 修改 `src/NotesWindow.vue`：
   - 引入 `useAppStore` 或复用统一入口初始化逻辑。
   - 在窗口初始化后应用主题。
   - 移除 `.notes-window` 中硬编码玻璃背景和暗色媒体查询背景。

5. 评估是否新增组合式函数：
   - 可新增 `src/services/themeService.ts` 中的轻量绑定函数。
   - 如需 Vue watch，可新增 `src/services/themeBinding.ts` 或在各窗口中少量接入。
   - 不建议为了单次调用引入过度抽象。

### 7.3 交付物

1. 四类窗口主题一致。
2. 独立窗口不再依赖局部暗色媒体查询。
3. 配置变更后主题可刷新。

### 7.4 验收标准

1. 主窗口切换预设后立即生效。
2. 快捷搜索窗口打开时使用当前预设。
3. 待办窗口打开时使用当前预设。
4. 便签窗口打开时使用当前预设。
5. 已打开独立窗口若监听配置，则能实时刷新；若不监听，必须保证重新打开后生效。

## 8. 阶段五：设置界面与交互闭环

### 8.1 目标

在已有“外观设置”中加入界面风格切换，并保证用户能理解预设和主题色的关系。

### 8.2 任务

1. 修改 `src/components/SettingsDialog.vue`：
   - 在主题色选择前增加“界面风格”设置项。
   - 展示三套预设名称和简短描述。
   - 提供小型色块预览。
   - 当前预设显示选中状态。

2. 新增更新函数：
   - `updateThemePreset(preset: ThemePreset)` 只保存 `themePreset`。
   - `applyPresetRecommendedColor(preset: ThemePreset)` 用户明确点击后才保存推荐 `themeColor`。

3. 主题元数据建议放在 `themeService.ts`：
   - 名称。
   - 描述。
   - 推荐主色。
   - 预览色块。

4. 保持现有控件语义：
   - 背景来源不变。
   - 背景遮罩不变。
   - 窗口透明度不变。
   - 主题色拾色器不变。

### 8.3 交付物

1. 设置页界面风格控件。
2. 推荐主色明确按钮。
3. 预设与自定义主题色互不覆盖的交互闭环。

### 8.4 验收标准

1. 切换预设后 `themeColor` 不变。
2. 点击推荐主色按钮后才改变 `themeColor`。
3. 设置页说明文字、快捷键说明和按钮文字在三套主题下可读。
4. 设置保存失败时仍沿用现有错误处理机制。

## 9. 阶段六：视觉回归、轻量验证和发布说明

### 9.1 目标

通过单元测试和手动检查确认主题功能完整、可读。完整应用 build 只作为发布前、依赖变更、构建配置变更或疑似打包问题时的按需检查，不作为本主题改动每轮完成的默认门槛。

### 9.2 自动化验证

默认执行：

```bash
npm run test
```

按需执行：

```bash
npm run build
cd src-tauri
cargo check
```

触发条件：

1. 修改了 `package.json`、`vite.config.ts`、`tsconfig*.json` 等构建相关文件。
2. 修改了 Rust 配置模型、Tauri 命令注册或打包配置。
3. 准备发布版本或需要确认最终产物可构建。
4. 单元测试无法覆盖的类型、入口或资源加载问题需要通过构建确认。

### 9.3 手动验证清单

1. 清新晨曦：
   - 主窗口侧边栏、工具栏、卡片、设置弹窗可读。
   - 带背景图时玻璃层次明显，但文字不被背景干扰。

2. 深海黑曜：
   - 设置说明、副标题、placeholder、`kbd` 不发灰。
   - 成功、警告、危险状态可区分。

3. 赤陶暖砂：
   - 整体不明显偏黄过重。
   - 正文和副文本有足够对比。

4. 多窗口一致性：
   - 快捷搜索窗口使用当前预设。
   - 待办窗口使用当前预设。
   - 便签窗口使用当前预设。
   - 系统暗色模式不会强行覆盖已选预设。

5. 用户设置兼容：
   - 自定义主题色在切换预设后保留。
   - 背景图、背景遮罩、窗口透明度仍生效。
   - 旧配置缺少 `themePreset` 可以启动。
   - 导入本地数据触发 `config-changed` 后主题刷新。

### 9.4 发布说明

更新发布说明时至少说明：

1. 新增三套界面风格预设。
2. 自定义主题色仍独立保留。
3. 旧配置会自动使用默认预设。
4. 背景图和窗口透明度可继续与主题预设叠加使用。

## 10. 任务依赖关系

推荐顺序：

1. 配置模型。
2. 主题服务。
3. 主题服务测试。
4. 全局 CSS 变量。
5. 主窗口接入。
6. 独立窗口接入。
7. 设置界面。
8. 视觉回归。
9. 按需构建验证。
10. 发布说明。

不能提前做的事项：

1. 不能在主题服务完成前分别在四个窗口复制主题逻辑。
2. 不能在主色与预设解耦前让预设切换自动覆盖 `themeColor`。
3. 不能在独立窗口硬编码清理前宣称多窗口主题一致。
4. 不能只验证主窗口而跳过快捷搜索、待办、便签窗口。

## 11. 风险与应对

### 11.1 媒体查询覆盖预设

风险：

- `@media (prefers-color-scheme: dark)` 覆盖用户选择的亮色或暖色预设。

应对：

- 媒体查询只作用于 `html[data-theme-mode="auto"]`。
- 预设选择器放在明确的覆盖层级中。

### 11.2 用户主题色被误覆盖

风险：

- 切换预设时重写 `themeColor`，导致用户自定义主色丢失。

应对：

- 预设切换只写 `themePreset`。
- 推荐主色必须由用户单独点击触发。

### 11.3 独立窗口主题不同步

风险：

- 快捷搜索、待办、便签窗口启动入口不同，遗漏主题服务调用。

应对：

- 四个入口全部调用同一主题服务。
- 手动验收必须覆盖三个独立窗口。

### 11.4 玻璃透明度影响可读性

风险：

- 背景图较复杂时，副文本、placeholder、快捷键提示可读性下降。

应对：

- 三套预设都保持较高 `--text-secondary` 对比度。
- 对浮层窗口使用 `--floating-window-bg` 提供更高遮罩。

### 11.5 配置字段兼容遗漏

风险：

- Rust 或前端只改一侧字段，保存后字段丢失或默认值异常。

应对：

- 前后端同时新增字段。
- 单元测试覆盖归一化。
- 手动检查保存后的配置 JSON。

## 12. 回滚策略

1. 配置字段回滚：
   - `themePreset` 是可选字段，回滚前端读取后旧配置仍可用。

2. CSS 回滚：
   - 保留原变量名，组件仍通过变量读取。
   - 如果某个预设效果异常，可先回退该预设变量，不影响其它功能。

3. 窗口接入回滚：
   - 主题服务是独立模块，可逐个窗口恢复旧样式。
   - 不回退用户配置数据。

4. 设置界面回滚：
   - 可隐藏预设控件，保留主题服务和默认预设。

## 13. 完成判定

满足以下条件后，本任务可视为完成：

1. `themePreset` 在前后端模型中可读写。
2. `themeService` 有单元测试。
3. `src/style.css` 包含三套预设变量和受控亮暗模式规则。
4. 主窗口、快捷搜索、待办、便签都使用统一主题服务。
5. 设置页可以切换预设，且不会自动覆盖用户主题色。
6. 三套主题下核心文本、说明文字、placeholder、`kbd` 可读。
7. `npm run test` 通过；如触发按需条件，再执行 `npm run build` 或 `cargo check`，未执行时需记录原因。
