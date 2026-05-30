import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyThemeSettings,
  getThemeHoverColor,
  normalizeThemePreset,
  THEME_PRESETS
} from './themeService'

describe('themeService', () => {
  let root: HTMLElement

  beforeEach(() => {
    const styleValues: Record<string, string> = {}
    root = {
      dataset: {},
      style: {
        setProperty(name: string, value: string) {
          styleValues[name] = value
        },
        getPropertyValue(name: string) {
          return styleValues[name] || ''
        }
      }
    } as unknown as HTMLElement
  })

  it('会归一化界面风格预设', () => {
    expect(normalizeThemePreset('deep-obsidian')).toBe('deep-obsidian')
    expect(normalizeThemePreset('unknown')).toBe('fresh-dawn')
    expect(THEME_PRESETS).toContain('warm-terracotta')
  })

  it('会把主题设置写入根节点数据属性', () => {
    applyThemeSettings({
      theme: 'dark',
      themePreset: 'warm-terracotta'
    }, root)

    expect(root.dataset.themePreset).toBe('warm-terracotta')
    expect(root.dataset.themeMode).toBe('dark')
  })

  it('缺失或非法值会回退到默认主题状态', () => {
    applyThemeSettings({
      theme: 'broken' as never,
      themePreset: 'broken' as never
    }, root)

    expect(root.dataset.themePreset).toBe('fresh-dawn')
    expect(root.dataset.themeMode).toBe('auto')
  })

  it('会应用主题色和 hover 颜色', () => {
    applyThemeSettings({
      theme: 'auto',
      themePreset: 'fresh-dawn',
      themeColor: '#336699'
    }, root)

    expect(root.style.getPropertyValue('--primary-color')).toBe('#336699')
    expect(root.style.getPropertyValue('--primary-hover')).toBe('rgb(31, 82, 133)')
    expect(getThemeHoverColor('not-a-color')).toBeNull()
  })

  it('会应用窗口透明度', () => {
    applyThemeSettings({
      theme: 'auto',
      themePreset: 'fresh-dawn',
      windowOpacity: 0.82
    }, root)

    expect(root.style.getPropertyValue('--window-opacity')).toBe('0.82')
  })
})
