// 应用程序数据模型
export interface App {
  id: string
  name: string
  path: string
  category: string
  icon?: string  // base64 编码的图标
  lastLaunched?: number
  createdAt: number
}

// 分类数据模型
export interface Category {
  id: string
  name: string
  icon?: string
  apps: string[]  // App IDs
  order: number
}

// 剪贴板历史项
export interface ClipboardItem {
  id: string
  content: string
  contentType: 'text' | 'image' | 'html'
  createdAt: number
  preview?: string  // 长文本预览
  pinned: boolean   // 是否置顶
}

// 应用设置
export interface AppSettings {
  cardSize: 'small' | 'medium' | 'large'
  lastCategory?: string
  theme: 'light' | 'dark' | 'auto'
  sortBy: 'name' | 'lastLaunched' | 'custom'
  themeColor?: string  // 自定义主题色
  backgroundImage?: string  // 背景图片（base64 或路径）
  backgroundOpacity?: number  // 背景图透明度 (0-1)
  windowOpacity?: number  // 窗口透明度 (0-1)
  // Quicker 效率工具设置
  quickerEnabled?: boolean  // 总开关
  globalShortcutEnabled?: boolean  // 全局快捷键唤起
  globalShortcut?: string  // 全局快捷键（默认 Alt+Space）
  clipboardHistoryEnabled?: boolean  // 剪贴板历史
  clipboardMaxItems?: number  // 剪贴板最大保存数量
  spotlightSearchEnabled?: boolean  // 快捷搜索
  spotlightShortcut?: string  // 快捷搜索快捷键（默认 Ctrl+K）
  // 快捷便签
  quickNotesEnabled?: boolean  // 快捷便签开关
  quickNotesShortcut?: string  // 快捷便签快捷键（默认 Alt+N）
  // 计算器增强
  calculatorEnabled?: boolean  // 计算器增强开关（在搜索框中使用）
}

// 完整配置
export interface Config {
  version: string
  categories: Record<string, Category>
  apps: Record<string, App>
  settings: AppSettings
}

// 卡片尺寸配置
export const CARD_SIZES = {
  small: { width: 110, height: 120, iconSize: 48 },
  medium: { width: 140, height: 150, iconSize: 64 },
  large: { width: 180, height: 190, iconSize: 80 }
} as const

// 默认主题色（可选）
export const DEFAULT_THEME_COLORS = [
  '#007AFF', // 蓝色（默认）
  '#34C759', // 绿色
  '#FF9500', // 橙色
  '#FF3B30', // 红色
  '#AF52DE', // 紫色
  '#5856D6', // 靛蓝
  '#FF2D55', // 粉色
  '#5AC8FA', // 青色
] as const

// 默认配置
export const DEFAULT_CONFIG: Config = {
  version: '1.0',
  categories: {},
  apps: {},
  settings: {
    cardSize: 'medium',
    theme: 'auto',
    sortBy: 'lastLaunched',
    themeColor: '#007AFF',
    backgroundOpacity: 0.3,
    windowOpacity: 0.95,
    // Quicker 效率工具默认设置
    quickerEnabled: true,
    globalShortcutEnabled: true,
    globalShortcut: 'Alt+Space',
    clipboardHistoryEnabled: false,
    clipboardMaxItems: 100,
    spotlightSearchEnabled: true,
    spotlightShortcut: 'Ctrl+K',
    // 快捷便签默认设置
    quickNotesEnabled: true,
    quickNotesShortcut: 'Alt+N',
    // 计算器增强默认设置
    calculatorEnabled: true
  }
}

// ============ 应用快捷动作类型 ============

// 动作分组
export type ActionGroup = 'file' | 'process'

// 预设动作定义
export interface ActionTemplate {
  id: string
  name: string
  description: string
  icon: string
  group: ActionGroup
  // 脚本模板（使用 PowerShell）
  scriptTemplate: string
  // 是否默认启用
  defaultEnabled: boolean
  // 是否需要输出
  showOutput: boolean
  // 排序权重
  order: number
}

// 用户启用的动作配置
export interface EnabledActions {
  // 记录启用的动作ID列表
  enabled: string[]
}

// ============ 场景功能类型 ============

// 场景动作类型
export type SceneActionType =
  | 'launch'        // 启动程序
  | 'launch_admin'  // 管理员启动
  | 'open_url'      // 打开网页
  | 'open_folder'   // 打开文件夹
  | 'open_file'     // 打开文件
  | 'close_app'     // 关闭程序
  | 'delay'         // 延迟等待
  | 'notify'        // 发送通知

// 场景动作
export interface SceneAction {
  id: string
  type: SceneActionType
  // 根据类型不同，params 包含不同的参数
  params: {
    appId?: string      // launch, launch_admin, close_app
    url?: string        // open_url
    path?: string       // open_folder, open_file
    processName?: string // close_app (备选)
    seconds?: number    // delay
    message?: string    // notify
    // 启动动作的附属选项
    waitWindow?: boolean   // launch, launch_admin: 是否等待窗口出现
    waitTimeout?: number   // launch, launch_admin: 等待超时秒数
    sendKeys?: string      // launch, launch_admin: 启动后发送按键
    delayAfter?: number    // launch, launch_admin: 启动后延迟秒数
  }
}

// 场景
export interface Scene {
  id: string
  name: string
  icon: string
  shortcut?: string  // 快捷键（可选）
  actions: SceneAction[]
  createdAt: number
  updatedAt: number
}

// 场景配置
export interface ScenesConfig {
  scenes: Scene[]
}

// 场景动作类型信息（用于 UI 显示）
export const SCENE_ACTION_TYPES: {
  type: SceneActionType
  name: string
  description: string
  icon: string
  needsApp?: boolean
  needsPath?: boolean
  needsUrl?: boolean
  needsSeconds?: boolean
  needsMessage?: boolean
  hasLaunchOptions?: boolean  // 是否有启动附属选项（等待窗口、发送按键）
}[] = [
  {
    type: 'launch',
    name: '启动程序',
    description: '程序未运行时启动，可选等待窗口和发送按键',
    icon: 'play',
    needsApp: true,
    hasLaunchOptions: true
  },
  {
    type: 'launch_admin',
    name: '管理员启动',
    description: '以管理员权限启动，可选等待窗口和发送按键',
    icon: 'shield',
    needsApp: true,
    hasLaunchOptions: true
  },
  {
    type: 'open_url',
    name: '打开网页',
    description: '在浏览器中打开指定网址',
    icon: 'globe',
    needsUrl: true
  },
  {
    type: 'open_folder',
    name: '打开文件夹',
    description: '在资源管理器中打开指定目录',
    icon: 'folder-open',
    needsPath: true
  },
  {
    type: 'open_file',
    name: '打开文件',
    description: '使用默认程序打开指定文件',
    icon: 'file',
    needsPath: true
  },
  {
    type: 'close_app',
    name: '关闭程序',
    description: '程序运行中才关闭，未运行则跳过',
    icon: 'x-circle',
    needsApp: true
  },
  {
    type: 'delay',
    name: '延迟等待',
    description: '等待指定秒数后继续',
    icon: 'clock',
    needsSeconds: true
  },
  {
    type: 'notify',
    name: '发送通知',
    description: '显示系统通知提示',
    icon: 'bell',
    needsMessage: true
  }
]

// 默认场景图标选项
export const SCENE_ICONS = [
  '💼', '🎮', '📚', '🎵', '🎬', '💻', '🏠', '✈️',
  '🌙', '☀️', '🔧', '📝', '🎯', '⚡', '🚀', '🔥'
]


// 动作分组信息
export const ACTION_GROUPS: { id: ActionGroup; name: string; icon: string }[] = [
  { id: 'file', name: '文件操作', icon: 'folder' },
  { id: 'process', name: '进程管理', icon: 'cpu' }
]

// 预设动作列表
export const PRESET_ACTIONS: ActionTemplate[] = [
  // ============ 文件操作 ============
  {
    id: 'open_folder',
    name: '打开所在文件夹',
    description: '在资源管理器中打开应用程序所在目录并选中文件',
    icon: 'folder-open',
    group: 'file',
    scriptTemplate: '[System.Diagnostics.Process]::Start("explorer.exe", (\'/select,"{0}"\' -f $env:APP_PATH))',
    defaultEnabled: true,
    showOutput: false,
    order: 1
  },
  {
    id: 'copy_path',
    name: '复制文件路径',
    description: '将应用程序完整路径复制到剪贴板',
    icon: 'copy',
    group: 'file',
    scriptTemplate: `Set-Clipboard -Value $env:APP_PATH
Write-Host "已复制: $env:APP_PATH"`,
    defaultEnabled: true,
    showOutput: true,
    order: 2
  },

  // ============ 进程管理 ============
  {
    id: 'run_as_admin',
    name: '以管理员身份运行',
    description: '使用管理员权限启动该应用程序',
    icon: 'shield',
    group: 'process',
    scriptTemplate: `Start-Process -FilePath $env:APP_PATH -Verb RunAs`,
    defaultEnabled: true,
    showOutput: false,
    order: 10
  },
  {
    id: 'kill_process',
    name: '结束进程',
    description: '强制结束该应用程序的所有进程',
    icon: 'x-circle',
    group: 'process',
    scriptTemplate: `$name = [IO.Path]::GetFileNameWithoutExtension($env:APP_PATH)
$ps = Get-Process -Name $name -ErrorAction SilentlyContinue
if ($ps) {
    $c = $ps.Count
    $ps | Stop-Process -Force
    Write-Host "已结束 $c 个 $name 进程"
} else { Write-Host "$name 未运行" }`,
    defaultEnabled: true,
    showOutput: true,
    order: 11
  }
]

// 默认启用的动作
export const DEFAULT_ENABLED_ACTIONS: EnabledActions = {
  enabled: PRESET_ACTIONS.filter(a => a.defaultEnabled).map(a => a.id)
}

// 获取分组下的动作
export function getActionsByGroup(group: ActionGroup): ActionTemplate[] {
  return PRESET_ACTIONS.filter(a => a.group === group).sort((a, b) => a.order - b.order)
}

// 获取动作模板
export function getActionTemplate(id: string): ActionTemplate | undefined {
  return PRESET_ACTIONS.find(a => a.id === id)
}
