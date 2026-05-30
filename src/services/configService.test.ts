import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { configService } from './configService'
import { DEFAULT_CONFIG } from '@/types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`)
}))

const mockedInvoke = vi.mocked(invoke)
const mockedConvertFileSrc = vi.mocked(convertFileSrc)

describe('configService', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
    mockedConvertFileSrc.mockClear()
    configService.clearIconDirCache()
  })

  it('保存配置时会封装 save_config 参数', async () => {
    const config = structuredClone(DEFAULT_CONFIG)

    await configService.saveConfig(config)

    expect(mockedInvoke).toHaveBeenCalledWith('save_config', { config })
  })

  it('新增应用时会把分类字段转换为后端参数名', async () => {
    await configService.addApp({
      name: '测试应用',
      path: 'D:\\Tools\\demo.exe',
      category: 'cat_1',
      itemType: 'app'
    })

    expect(mockedInvoke).toHaveBeenCalledWith('add_app', {
      name: '测试应用',
      path: 'D:\\Tools\\demo.exe',
      categoryId: 'cat_1',
      itemType: 'app'
    })
  })

  it('图标文件名会使用图标目录转换为可渲染 URL', async () => {
    mockedInvoke.mockResolvedValueOnce('D:\\ProgramManager\\icons')

    const url = await configService.getIconUrl('app.png')

    expect(url).toBe('asset://D:\\ProgramManager\\icons\\app.png')
    expect(mockedInvoke).toHaveBeenCalledWith('get_icons_dir')
    expect(mockedConvertFileSrc).toHaveBeenCalledWith('D:\\ProgramManager\\icons\\app.png')
  })

  it('旧 base64 图标直接返回，不触发目录读取', async () => {
    const dataUrl = 'data:image/png;base64,abc'

    await expect(configService.getIconUrl(dataUrl)).resolves.toBe(dataUrl)
    expect(mockedInvoke).not.toHaveBeenCalled()
  })
})
