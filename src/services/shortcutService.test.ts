import { describe, expect, it } from 'vitest'
import {
  getActiveShortcutConflicts,
  matchesKeyboardEvent,
  normalizeShortcutText,
  shortcutFromKeyboardEvent
} from './shortcutService'

describe('shortcutService', () => {
  it('会规范化快捷键文本并阻止裸字母快捷键', () => {
    expect(normalizeShortcutText('control + shift + k').shortcut).toBe('Ctrl+Shift+K')
    expect(normalizeShortcutText('Alt + Space').shortcut).toBe('Alt+Space')
    expect(normalizeShortcutText('k').error).toContain('至少需要包含')
  })

  it('会把键盘事件转换为统一快捷键格式', () => {
    const event = {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true
    } as KeyboardEvent

    expect(shortcutFromKeyboardEvent(event)).toBe('Ctrl+K')
    expect(matchesKeyboardEvent(event, 'Ctrl+K')).toBe(true)
  })

  it('主窗口内匹配时允许 Cmd 等价为 Ctrl', () => {
    const event = {
      key: 'k',
      code: 'KeyK',
      metaKey: true
    } as KeyboardEvent

    expect(matchesKeyboardEvent(event, 'Ctrl+K', { metaAsCtrl: true })).toBe(true)
  })

  it('会识别启用状态下的快捷键冲突', () => {
    const conflicts = getActiveShortcutConflicts({
      cardSize: 'medium',
      theme: 'auto',
      sortBy: 'lastLaunched',
      quickerEnabled: true,
      globalShortcutEnabled: true,
      globalShortcut: 'Ctrl+K',
      spotlightSearchEnabled: true,
      spotlightShortcut: 'Ctrl+K',
      quickNotesEnabled: true,
      quickNotesShortcut: 'Alt+N',
      todoScheduleEnabled: false,
      todoShortcut: 'Ctrl+K'
    })

    expect(conflicts).toEqual(['全局唤起 与 快捷搜索 都使用 Ctrl+K'])
  })
})
