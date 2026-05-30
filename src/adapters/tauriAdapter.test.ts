import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { tauriAdapter } from './tauriAdapter'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

const mockedInvoke = vi.mocked(invoke)

describe('tauriAdapter 本地数据导入导出', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
    mockedInvoke.mockResolvedValue(undefined)
  })

  it('导出本地数据时会传入目标目录', async () => {
    await tauriAdapter.exportLocalData('D:\\backup')

    expect(mockedInvoke).toHaveBeenCalledWith('export_local_data', {
      exportDir: 'D:\\backup'
    })
  })

  it('预览导入时会传入 manifest 路径', async () => {
    await tauriAdapter.previewLocalDataImport('D:\\backup\\manifest.json')

    expect(mockedInvoke).toHaveBeenCalledWith('preview_local_data_import', {
      manifestPath: 'D:\\backup\\manifest.json'
    })
  })

  it('执行导入时会传入选择的数据范围', async () => {
    await tauriAdapter.importLocalData('D:\\backup\\manifest.json', ['config', 'scenes', 'icons'])

    expect(mockedInvoke).toHaveBeenCalledWith('import_local_data', {
      manifestPath: 'D:\\backup\\manifest.json',
      options: {
        sections: ['config', 'scenes', 'icons']
      }
    })
  })
})
