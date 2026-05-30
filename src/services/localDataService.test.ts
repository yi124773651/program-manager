import { describe, expect, it, vi } from 'vitest'
import type { LocalDataImportPreview, LocalDataSection } from '@/adapters/tauriAdapter'
import {
  canImportLocalData,
  exportLocalDataWithPicker,
  importConfirmMessage,
  importLocalDataWithConfirmation,
  importPreviewStatus,
  importSectionText,
  previewLocalDataImportWithPicker,
  selectableImportSections,
  toggleImportSectionSelection
} from './localDataService'

const preview = (overrides: Partial<LocalDataImportPreview> = {}): LocalDataImportPreview => ({
  manifestPath: 'D:\\backup\\manifest.json',
  packageDir: 'D:\\backup',
  appVersion: '1.1.4',
  exportedAt: 1,
  errors: [],
  sections: [
    { section: 'config', label: '主配置', available: true, itemCount: 2 },
    { section: 'scenes', label: '场景', available: false },
    { section: 'notes', label: '便签', available: true, error: '数据文件不存在' },
    { section: 'icons', label: '图标', available: true }
  ],
  ...overrides
})

describe('localDataService', () => {
  it('会只默认勾选数据包中可用且无错误的数据范围', () => {
    expect(selectableImportSections(preview())).toEqual(['config', 'icons'])
  })

  it('会根据预览错误和选择范围判断是否允许导入', () => {
    expect(canImportLocalData(preview(), ['config'])).toBe(true)
    expect(canImportLocalData(null, ['config'])).toBe(false)
    expect(canImportLocalData(preview(), [])).toBe(false)
    expect(canImportLocalData(preview({ errors: ['主配置校验失败'] }), ['config'])).toBe(false)
  })

  it('会生成预览加载后的状态提示', () => {
    expect(importPreviewStatus(preview())).toEqual({
      message: '数据包已载入，请确认导入范围',
      status: 'success'
    })
    expect(importPreviewStatus(preview({ errors: ['场景校验失败'] }))).toEqual({
      message: '数据包校验失败，请检查预览错误',
      status: 'error'
    })
  })

  it('会生成每类导入数据的说明文本', () => {
    expect(importSectionText({ section: 'config', label: '主配置', available: true, itemCount: 3 })).toBe('3 条数据')
    expect(importSectionText({ section: 'icons', label: '图标', available: true })).toBe('可导入')
    expect(importSectionText({ section: 'scenes', label: '场景', available: false })).toBe('数据包中未包含')
    expect(importSectionText({ section: 'notes', label: '便签', available: true, error: '无法解析' })).toBe('无法解析')
  })

  it('会切换选择范围并避免重复加入', () => {
    const selected: LocalDataSection[] = ['config']

    expect(toggleImportSectionSelection(selected, 'config', true)).toEqual(['config'])
    expect(toggleImportSectionSelection(selected, 'icons', true)).toEqual(['config', 'icons'])
    expect(toggleImportSectionSelection(['config', 'icons'], 'config', false)).toEqual(['icons'])
  })

  it('会生成覆盖导入确认文案', () => {
    expect(importConfirmMessage(3)).toBe('将覆盖导入 3 类数据。导入前会自动备份当前数据，导入失败会尝试恢复备份。')
  })

  it('导出流程会处理取消、成功和失败状态', async () => {
    const exportLocalData = vi.fn().mockResolvedValue({
      exportDir: 'D:\\backup\\program-manager-export',
      manifestPath: 'D:\\backup\\program-manager-export\\manifest.json',
      files: []
    })

    await expect(exportLocalDataWithPicker({
      pickExportDir: async () => null,
      exportLocalData
    })).resolves.toEqual({ completed: false })
    expect(exportLocalData).not.toHaveBeenCalled()

    await expect(exportLocalDataWithPicker({
      pickExportDir: async () => 'D:\\backup',
      exportLocalData
    })).resolves.toMatchObject({
      completed: true,
      feedback: {
        message: '数据包已导出：D:\\backup\\program-manager-export\\manifest.json',
        status: 'success'
      }
    })

    await expect(exportLocalDataWithPicker({
      pickExportDir: async () => 'D:\\backup',
      exportLocalData: vi.fn().mockRejectedValue(new Error('磁盘写入失败'))
    })).resolves.toEqual({
      completed: true,
      feedback: {
        message: '导出失败：Error: 磁盘写入失败',
        status: 'error'
      }
    })
  })

  it('导入预览流程会处理取消、成功和读取失败状态', async () => {
    const previewLocalDataImport = vi.fn().mockResolvedValue(preview())

    await expect(previewLocalDataImportWithPicker({
      pickManifest: async () => [],
      previewLocalDataImport
    })).resolves.toEqual({
      completed: false,
      preview: null,
      selectedSections: []
    })
    expect(previewLocalDataImport).not.toHaveBeenCalled()

    await expect(previewLocalDataImportWithPicker({
      pickManifest: async () => 'D:\\backup\\manifest.json',
      previewLocalDataImport
    })).resolves.toMatchObject({
      completed: true,
      selectedSections: ['config', 'icons'],
      feedback: {
        message: '数据包已载入，请确认导入范围',
        status: 'success'
      }
    })

    await expect(previewLocalDataImportWithPicker({
      pickManifest: async () => 'D:\\backup\\manifest.json',
      previewLocalDataImport: vi.fn().mockRejectedValue('manifest.json 无法解析')
    })).resolves.toEqual({
      completed: true,
      preview: null,
      selectedSections: [],
      feedback: {
        message: '读取数据包失败：manifest.json 无法解析',
        status: 'error'
      }
    })
  })

  it('覆盖导入流程会处理取消、后端失败、成功刷新和异常状态', async () => {
    const confirmImport = vi.fn().mockResolvedValue(false)
    const importLocalData = vi.fn()
    const refreshImportedData = vi.fn()

    await expect(importLocalDataWithConfirmation(preview(), ['config'], {
      confirmImport,
      importLocalData,
      refreshImportedData
    })).resolves.toEqual({
      completed: false,
      resetPreview: false
    })
    expect(confirmImport).toHaveBeenCalledWith('将覆盖导入 1 类数据。导入前会自动备份当前数据，导入失败会尝试恢复备份。')
    expect(importLocalData).not.toHaveBeenCalled()

    await expect(importLocalDataWithConfirmation(preview(), ['config'], {
      confirmImport: vi.fn().mockResolvedValue(true),
      importLocalData: vi.fn().mockResolvedValue({
        success: false,
        backupDir: 'D:\\backup\\before-import',
        importedSections: [],
        errors: ['配置文件无效']
      }),
      refreshImportedData
    })).resolves.toMatchObject({
      completed: true,
      resetPreview: false,
      feedback: {
        message: '导入失败，已尝试恢复备份：配置文件无效',
        status: 'error'
      }
    })
    expect(refreshImportedData).not.toHaveBeenCalled()

    const successRefresh = vi.fn().mockResolvedValue(undefined)
    await expect(importLocalDataWithConfirmation(preview(), ['config', 'icons'], {
      confirmImport: vi.fn().mockResolvedValue(true),
      importLocalData: vi.fn().mockResolvedValue({
        success: true,
        backupDir: 'D:\\backup\\before-import',
        importedSections: ['config', 'icons'],
        errors: []
      }),
      refreshImportedData: successRefresh
    })).resolves.toMatchObject({
      completed: true,
      resetPreview: true,
      feedback: {
        message: '导入完成，当前数据已备份到：D:\\backup\\before-import',
        status: 'success'
      }
    })
    expect(successRefresh).toHaveBeenCalledTimes(1)

    await expect(importLocalDataWithConfirmation(preview(), ['config'], {
      confirmImport: vi.fn().mockResolvedValue(true),
      importLocalData: vi.fn().mockRejectedValue(new Error('写入失败')),
      refreshImportedData
    })).resolves.toEqual({
      completed: true,
      resetPreview: false,
      feedback: {
        message: '导入失败：Error: 写入失败',
        status: 'error'
      }
    })
  })
})
