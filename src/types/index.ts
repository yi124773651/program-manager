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
    windowOpacity: 0.95
  }
}
