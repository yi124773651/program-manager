import type { AppSettings, ThemePreset } from '@/types'

export const THEME_PRESETS = ['fresh-dawn', 'deep-obsidian', 'warm-terracotta'] as const

export interface ThemePresetMeta {
  id: ThemePreset
  name: string
  description: string
  recommendedPrimaryColor: string
  swatches: string[]
}

export const THEME_PRESET_META: Record<ThemePreset, ThemePresetMeta> = {
  'fresh-dawn': {
    id: 'fresh-dawn',
    name: '清新晨曦',
    description: '通透浅色玻璃，适合白天和背景图。',
    recommendedPrimaryColor: '#007AFF',
    swatches: ['#ffffff', '#f8fafc', '#0f172a', '#007AFF']
  },
  'deep-obsidian': {
    id: 'deep-obsidian',
    name: '深海黑曜',
    description: '低亮度深色界面，适合夜间专注。',
    recommendedPrimaryColor: '#38bdf8',
    swatches: ['#0b0f19', '#111827', '#f8fafc', '#38bdf8']
  },
  'warm-terracotta': {
    id: 'warm-terracotta',
    name: '赤陶暖砂',
    description: '克制暖色背景，适合长时间浏览。',
    recommendedPrimaryColor: '#c2410c',
    swatches: ['#fdfbf7', '#f5efe6', '#2d1f18', '#c2410c']
  }
}

const THEME_MODE_VALUES = ['light', 'dark', 'auto'] as const
const DEFAULT_THEME_PRESET: ThemePreset = 'fresh-dawn'
const DEFAULT_THEME_MODE = 'auto'

export function normalizeThemePreset(value: unknown): ThemePreset {
  return THEME_PRESETS.includes(value as ThemePreset) ? value as ThemePreset : DEFAULT_THEME_PRESET
}

function normalizeThemeMode(value: unknown): AppSettings['theme'] {
  return THEME_MODE_VALUES.includes(value as AppSettings['theme']) ? value as AppSettings['theme'] : DEFAULT_THEME_MODE
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

export function getThemeHoverColor(color: string): string | null {
  const rgb = hexToRgb(color)
  if (!rgb) return null

  return `rgb(${Math.max(rgb.r - 20, 0)}, ${Math.max(rgb.g - 20, 0)}, ${Math.max(rgb.b - 20, 0)})`
}

export function applyThemeSettings(settings: Pick<AppSettings, 'theme' | 'themePreset' | 'themeColor' | 'windowOpacity'>, root = document.documentElement) {
  root.dataset.themePreset = normalizeThemePreset(settings.themePreset)
  root.dataset.themeMode = normalizeThemeMode(settings.theme)

  if (settings.themeColor) {
    root.style.setProperty('--primary-color', settings.themeColor)
    const hoverColor = getThemeHoverColor(settings.themeColor)
    if (hoverColor) {
      root.style.setProperty('--primary-hover', hoverColor)
    }
  }

  if (settings.windowOpacity !== undefined) {
    root.style.setProperty('--window-opacity', String(settings.windowOpacity))
  }
}
