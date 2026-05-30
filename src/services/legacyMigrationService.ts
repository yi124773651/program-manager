import { tauriAdapter, type LegacyLocalStoragePayload } from '@/adapters/tauriAdapter'

const LEGACY_STORAGE_KEYS = {
  scenes: 'app_scenes_config',
  notes: 'quick_notes',
  todos: 'todo_schedule',
  clipboard: 'clipboard_history',
  actions: 'app_actions_config'
} as const

type LegacyDataName = keyof typeof LEGACY_STORAGE_KEYS

const canUseLocalStorage = () => typeof localStorage !== 'undefined'

const setParsedValue = (
  payload: LegacyLocalStoragePayload,
  key: LegacyDataName,
  value: unknown
) => {
  payload[key] = value
}

export const legacyMigrationService = {
  collectPayload(): LegacyLocalStoragePayload {
    const payload: LegacyLocalStoragePayload = {
      legacyRaw: {},
      frontendErrors: []
    }

    if (!canUseLocalStorage()) return payload

    for (const [dataName, storageKey] of Object.entries(LEGACY_STORAGE_KEYS) as [LegacyDataName, string][]) {
      const raw = localStorage.getItem(storageKey)
      if (!raw) continue

      payload.legacyRaw![storageKey] = raw

      try {
        setParsedValue(payload, dataName, JSON.parse(raw))
      } catch (error) {
        payload.frontendErrors!.push(`解析 ${storageKey} 失败: ${String(error)}`)
      }
    }

    return payload
  },

  hasLegacyPayload(payload: LegacyLocalStoragePayload) {
    return Boolean(
      payload.scenes ||
      payload.notes ||
      payload.todos ||
      payload.clipboard ||
      payload.actions ||
      payload.frontendErrors?.length
    )
  },

  async migrateIfNeeded() {
    const payload = this.collectPayload()
    if (!this.hasLegacyPayload(payload)) return null

    const status = await tauriAdapter.getLegacyDataStatus(payload)
    if (status.alreadyCompleted) return null

    return tauriAdapter.migrateLegacyLocalStorage(payload)
  }
}
