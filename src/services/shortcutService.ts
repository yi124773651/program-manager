import type { AppSettings } from '@/types'

export type ShortcutField =
  | 'globalShortcut'
  | 'spotlightShortcut'
  | 'quickNotesShortcut'
  | 'todoShortcut'

type ShortcutEnabledField =
  | 'globalShortcutEnabled'
  | 'spotlightSearchEnabled'
  | 'quickNotesEnabled'
  | 'todoScheduleEnabled'

interface ShortcutDefinition {
  field: ShortcutField
  enabledField: ShortcutEnabledField
  label: string
  defaultValue: string
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    field: 'globalShortcut',
    enabledField: 'globalShortcutEnabled',
    label: '全局唤起',
    defaultValue: 'Alt+Space'
  },
  {
    field: 'spotlightShortcut',
    enabledField: 'spotlightSearchEnabled',
    label: '快捷搜索',
    defaultValue: 'Ctrl+K'
  },
  {
    field: 'quickNotesShortcut',
    enabledField: 'quickNotesEnabled',
    label: '快捷便签',
    defaultValue: 'Alt+N'
  },
  {
    field: 'todoShortcut',
    enabledField: 'todoScheduleEnabled',
    label: '待办日程表',
    defaultValue: 'Alt+T'
  }
]

export const DEFAULT_SHORTCUTS = SHORTCUT_DEFINITIONS.reduce(
  (shortcuts, definition) => {
    shortcuts[definition.field] = definition.defaultValue
    return shortcuts
  },
  {} as Record<ShortcutField, string>
)

interface NormalizeResult {
  shortcut: string | null
  error: string | null
}

const MODIFIER_ALIASES: Record<string, 'Ctrl' | 'Alt' | 'Shift'> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Ctrl',
  command: 'Ctrl',
  meta: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift'
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight'
}

const MODIFIER_ORDER: Array<'Ctrl' | 'Alt' | 'Shift'> = ['Ctrl', 'Alt', 'Shift']
const FUNCTION_KEY_PATTERN = /^F(?:[1-9]|1[0-9]|2[0-4])$/i

export function normalizeShortcutText(value: string): NormalizeResult {
  const parts = value
    .trim()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return { shortcut: null, error: '快捷键不能为空' }
  }

  const modifiers = new Set<'Ctrl' | 'Alt' | 'Shift'>()
  let key: string | null = null

  for (const part of parts) {
    const lowerPart = part.toLowerCase()
    const modifier = MODIFIER_ALIASES[lowerPart]

    if (modifier) {
      modifiers.add(modifier)
      continue
    }

    if (key) {
      return { shortcut: null, error: '快捷键只能包含一个主按键' }
    }

    key = normalizeKeyPart(part)
  }

  if (!key) {
    return { shortcut: null, error: '快捷键缺少主按键' }
  }

  // 普通字母和数字必须带修饰键，避免覆盖输入区的基础键入行为。
  if (modifiers.size === 0 && !FUNCTION_KEY_PATTERN.test(key)) {
    return { shortcut: null, error: '快捷键至少需要包含 Ctrl、Alt 或 Shift' }
  }

  return {
    shortcut: [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+'),
    error: null
  }
}

export function shortcutFromKeyboardEvent(
  event: KeyboardEvent,
  options: { metaAsCtrl?: boolean } = {}
): string | null {
  const key = keyFromKeyboardEvent(event)
  if (!key) return null

  const modifiers: string[] = []
  if (event.ctrlKey || (options.metaAsCtrl && event.metaKey)) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')

  const normalized = normalizeShortcutText([...modifiers, key].join('+'))
  return normalized.shortcut
}

export function matchesKeyboardEvent(
  event: KeyboardEvent,
  shortcut: string,
  options: { metaAsCtrl?: boolean } = {}
): boolean {
  const eventShortcut = shortcutFromKeyboardEvent(event, options)
  if (!eventShortcut) return false

  const normalized = normalizeShortcutText(shortcut)
  return normalized.shortcut === eventShortcut
}

export function getShortcutValue(settings: AppSettings, field: ShortcutField): string {
  const configuredValue = settings[field]?.trim()
  return configuredValue || DEFAULT_SHORTCUTS[field]
}

export function getActiveShortcutConflicts(settings: AppSettings): string[] {
  if (settings.quickerEnabled === false) return []

  const shortcuts = new Map<string, ShortcutDefinition>()
  const conflicts: string[] = []

  for (const definition of SHORTCUT_DEFINITIONS) {
    if (settings[definition.enabledField] === false) continue

    const normalized = normalizeShortcutText(getShortcutValue(settings, definition.field))
    if (!normalized.shortcut) continue

    const existing = shortcuts.get(normalized.shortcut)
    if (existing) {
      conflicts.push(`${existing.label} 与 ${definition.label} 都使用 ${normalized.shortcut}`)
      continue
    }

    shortcuts.set(normalized.shortcut, definition)
  }

  return conflicts
}

function normalizeKeyPart(value: string): string {
  const lowerValue = value.toLowerCase()
  const aliasedKey = KEY_ALIASES[lowerValue]
  if (aliasedKey) return aliasedKey

  if (/^[a-z]$/i.test(value)) return value.toUpperCase()
  if (/^[0-9]$/.test(value)) return value
  if (FUNCTION_KEY_PATTERN.test(value)) return value.toUpperCase()

  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function keyFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  if (event.key === 'Dead' || event.key === 'Process') return null

  if (event.code?.startsWith('Key')) return event.code.slice(3)
  if (event.code?.startsWith('Digit')) return event.code.slice(5)
  if (event.key === ' ') return 'Space'

  return normalizeKeyPart(event.key)
}
