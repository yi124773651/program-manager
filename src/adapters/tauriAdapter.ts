import { invoke } from '@tauri-apps/api/core'

export type PersistedDataType = 'scenes' | 'notes' | 'todos' | 'clipboard' | 'actions'

export interface DataEnvelope<T> {
  schemaVersion: number
  updatedAt: number
  data: T
}

export interface LegacyLocalStoragePayload {
  scenes?: unknown
  notes?: unknown
  todos?: unknown
  clipboard?: unknown
  actions?: unknown
  legacyRaw?: Record<string, string>
  frontendErrors?: string[]
}

export interface LegacyDataStatus {
  migrationId: string
  alreadyCompleted: boolean
  hasScenes: boolean
  hasNotes: boolean
  hasTodos: boolean
  hasClipboard: boolean
  hasActions: boolean
}

export interface LegacyMigrationResult {
  migrationId: string
  success: boolean
  skipped: boolean
  backupDir?: string
  writtenFiles: string[]
  errors: string[]
}

export type LocalDataSection = 'config' | 'scenes' | 'notes' | 'todos' | 'clipboard' | 'actions' | 'icons'

export interface LocalDataFileEntry {
  section: LocalDataSection
  path: string
  exists: boolean
  size?: number
}

export interface LocalDataExportResult {
  exportDir: string
  manifestPath: string
  files: LocalDataFileEntry[]
}

export interface LocalDataImportSectionPreview {
  section: LocalDataSection
  label: string
  available: boolean
  itemCount?: number
  error?: string
}

export interface LocalDataImportPreview {
  manifestPath: string
  packageDir: string
  appVersion: string
  exportedAt: number
  sections: LocalDataImportSectionPreview[]
  errors: string[]
}

export interface LocalDataImportResult {
  success: boolean
  backupDir: string
  importedSections: LocalDataSection[]
  errors: string[]
}

export const tauriAdapter = {
  readPersistedData<T>(dataType: PersistedDataType) {
    return invoke<DataEnvelope<T> | null>('read_persisted_data', { dataType })
  },

  writePersistedData<T>(dataType: PersistedDataType, data: T) {
    return invoke<DataEnvelope<T>>('write_persisted_data', { dataType, data })
  },

  getLegacyDataStatus(payload?: LegacyLocalStoragePayload) {
    return invoke<LegacyDataStatus>('get_legacy_data_status', { payload })
  },

  migrateLegacyLocalStorage(payload: LegacyLocalStoragePayload) {
    return invoke<LegacyMigrationResult>('migrate_legacy_local_storage', { payload })
  },

  exportLocalData(exportDir: string) {
    return invoke<LocalDataExportResult>('export_local_data', { exportDir })
  },

  previewLocalDataImport(manifestPath: string) {
    return invoke<LocalDataImportPreview>('preview_local_data_import', { manifestPath })
  },

  importLocalData(manifestPath: string, sections: LocalDataSection[]) {
    return invoke<LocalDataImportResult>('import_local_data', {
      manifestPath,
      options: { sections }
    })
  }
}
