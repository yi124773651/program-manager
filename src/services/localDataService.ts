import type {
  LocalDataExportResult,
  LocalDataImportResult,
  LocalDataImportPreview,
  LocalDataImportSectionPreview,
  LocalDataSection
} from '@/adapters/tauriAdapter'

export type DataTransferStatus = 'success' | 'error'
export type LocalDataPickerResult = string | string[] | null

export interface DataTransferFeedback {
  message: string
  status: DataTransferStatus
}

export interface ExportLocalDataFlowResult {
  completed: boolean
  feedback?: DataTransferFeedback
  result?: LocalDataExportResult
}

export interface PreviewLocalDataImportFlowResult {
  completed: boolean
  preview: LocalDataImportPreview | null
  selectedSections: LocalDataSection[]
  feedback?: DataTransferFeedback
}

export interface ImportLocalDataFlowResult {
  completed: boolean
  resetPreview: boolean
  feedback?: DataTransferFeedback
  result?: LocalDataImportResult
}

export function selectableImportSections(preview: LocalDataImportPreview): LocalDataSection[] {
  return preview.sections
    .filter((section) => section.available && !section.error)
    .map((section) => section.section)
}

export function canImportLocalData(
  preview: LocalDataImportPreview | null,
  selectedSections: LocalDataSection[]
): boolean {
  return !!preview && preview.errors.length === 0 && selectedSections.length > 0
}

export function importPreviewStatus(preview: LocalDataImportPreview): {
  message: string
  status: DataTransferStatus
} {
  if (preview.errors.length > 0) {
    return {
      message: '数据包校验失败，请检查预览错误',
      status: 'error'
    }
  }

  return {
    message: '数据包已载入，请确认导入范围',
    status: 'success'
  }
}

export function importSectionText(section: LocalDataImportSectionPreview): string {
  if (section.error) return section.error
  if (!section.available) return '数据包中未包含'
  if (section.itemCount !== undefined) return `${section.itemCount} 条数据`
  return '可导入'
}

export function toggleImportSectionSelection(
  selectedSections: LocalDataSection[],
  section: LocalDataSection,
  checked: boolean
): LocalDataSection[] {
  if (checked) {
    return selectedSections.includes(section)
      ? selectedSections
      : [...selectedSections, section]
  }

  return selectedSections.filter((item) => item !== section)
}

export function importConfirmMessage(selectedCount: number): string {
  return `将覆盖导入 ${selectedCount} 类数据。导入前会自动备份当前数据，导入失败会尝试恢复备份。`
}

export async function exportLocalDataWithPicker(options: {
  pickExportDir: () => Promise<LocalDataPickerResult>
  exportLocalData: (exportDir: string) => Promise<LocalDataExportResult>
}): Promise<ExportLocalDataFlowResult> {
  const selected = await options.pickExportDir()
  if (!selected || Array.isArray(selected)) {
    return { completed: false }
  }

  try {
    const result = await options.exportLocalData(selected)
    return {
      completed: true,
      result,
      feedback: {
        message: `数据包已导出：${result.manifestPath}`,
        status: 'success'
      }
    }
  } catch (error) {
    return {
      completed: true,
      feedback: {
        message: `导出失败：${String(error)}`,
        status: 'error'
      }
    }
  }
}

export async function previewLocalDataImportWithPicker(options: {
  pickManifest: () => Promise<LocalDataPickerResult>
  previewLocalDataImport: (manifestPath: string) => Promise<LocalDataImportPreview>
}): Promise<PreviewLocalDataImportFlowResult> {
  const selected = await options.pickManifest()
  if (!selected || Array.isArray(selected)) {
    return {
      completed: false,
      preview: null,
      selectedSections: []
    }
  }

  try {
    const preview = await options.previewLocalDataImport(selected)
    const status = importPreviewStatus(preview)
    return {
      completed: true,
      preview,
      selectedSections: selectableImportSections(preview),
      feedback: status
    }
  } catch (error) {
    return {
      completed: true,
      preview: null,
      selectedSections: [],
      feedback: {
        message: `读取数据包失败：${String(error)}`,
        status: 'error'
      }
    }
  }
}

export async function importLocalDataWithConfirmation(
  preview: LocalDataImportPreview | null,
  selectedSections: LocalDataSection[],
  options: {
    confirmImport: (message: string) => Promise<boolean>
    importLocalData: (
      manifestPath: string,
      sections: LocalDataSection[]
    ) => Promise<LocalDataImportResult>
    refreshImportedData: () => Promise<void>
  }
): Promise<ImportLocalDataFlowResult> {
  if (!preview || selectedSections.length === 0) {
    return {
      completed: false,
      resetPreview: false
    }
  }

  const confirmed = await options.confirmImport(importConfirmMessage(selectedSections.length))
  if (!confirmed) {
    return {
      completed: false,
      resetPreview: false
    }
  }

  try {
    const result = await options.importLocalData(preview.manifestPath, selectedSections)
    if (!result.success) {
      return {
        completed: true,
        resetPreview: false,
        result,
        feedback: {
          message: `导入失败，已尝试恢复备份：${result.errors.join('；')}`,
          status: 'error'
        }
      }
    }

    await options.refreshImportedData()
    return {
      completed: true,
      resetPreview: true,
      result,
      feedback: {
        message: `导入完成，当前数据已备份到：${result.backupDir}`,
        status: 'success'
      }
    }
  } catch (error) {
    return {
      completed: true,
      resetPreview: false,
      feedback: {
        message: `导入失败：${String(error)}`,
        status: 'error'
      }
    }
  }
}
