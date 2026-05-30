import { tauriAdapter, type PersistedDataType } from '@/adapters/tauriAdapter'

const LEGACY_STORAGE_KEYS: Record<PersistedDataType, string> = {
  scenes: 'app_scenes_config',
  notes: 'quick_notes',
  todos: 'todo_schedule',
  clipboard: 'clipboard_history',
  actions: 'app_actions_config'
}

const canUseLocalStorage = () => typeof localStorage !== 'undefined'

export const persistenceService = {
  async load<T>(dataType: PersistedDataType, fallback: T): Promise<T> {
    try {
      const envelope = await tauriAdapter.readPersistedData<T>(dataType)
      if (envelope) return envelope.data
    } catch (error) {
      console.error(`读取 ${dataType} 文件失败，尝试旧本地存储:`, error)
    }

    return this.loadLegacy(dataType, fallback)
  },

  async save<T>(dataType: PersistedDataType, data: T): Promise<void> {
    try {
      await tauriAdapter.writePersistedData(dataType, data)
    } catch (error) {
      console.error(`保存 ${dataType} 文件失败:`, error)
      throw error
    }
  },

  loadLegacy<T>(dataType: PersistedDataType, fallback: T): T {
    if (!canUseLocalStorage()) return fallback

    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEYS[dataType])
      return raw ? JSON.parse(raw) as T : fallback
    } catch (error) {
      console.error(`读取 ${dataType} 旧本地存储失败:`, error)
      return fallback
    }
  }
}
