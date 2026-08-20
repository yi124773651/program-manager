import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './appStore'
import { configService } from '@/services/configService'

vi.mock('@/services/configService', () => ({
  configService: {
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
    fetchImageAsBase64: vi.fn(),
    getIconUrl: vi.fn()
  }
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn()
}))

const mockedConfigService = vi.mocked(configService)

describe('appStore 随机图床背景', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // store 的 state 直接引用 DEFAULT_CONFIG，需显式重置避免用例间污染
    const store = useAppStore()
    store.config.settings.backgroundApiUrl = undefined
    store.config.settings.backgroundImage = undefined
    // debouncedSaveConfig 依赖 window.setTimeout，node 环境下需补桩
    vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未配置图床地址时返回失败原因且不发起请求', async () => {
    const store = useAppStore()

    const result = await store.loadApiBackground()

    expect(result.ok).toBe(false)
    expect(result.error).toBe('未配置图床地址')
    expect(mockedConfigService.fetchImageAsBase64).not.toHaveBeenCalled()
  })

  it('加载成功时写入背景图并返回成功', async () => {
    const store = useAppStore()
    store.config.settings.backgroundApiUrl = 'https://img.example.com/random'
    mockedConfigService.fetchImageAsBase64.mockResolvedValue('data:image/png;base64,AAAA')

    const result = await store.loadApiBackground()

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    expect(mockedConfigService.fetchImageAsBase64).toHaveBeenCalledWith(
      'https://img.example.com/random'
    )
    expect(store.config.settings.backgroundImage).toBe('data:image/png;base64,AAAA')
  })

  it('后端拒绝域名时把失败原因透出而不是静默失败', async () => {
    const store = useAppStore()
    store.config.settings.backgroundApiUrl = 'https://img.blocked.com/random'
    mockedConfigService.fetchImageAsBase64.mockRejectedValue(
      '图片域名不在允许范围内。内置支持：picsum.photos'
    )

    const result = await store.loadApiBackground()

    expect(result.ok).toBe(false)
    expect(result.error).toContain('图片域名不在允许范围内')
    // 失败时必须保留原有背景图，不能被清空
    expect(store.config.settings.backgroundImage).toBeUndefined()
  })

  it('加载失败时保留上一次的背景图', async () => {
    const store = useAppStore()
    store.config.settings.backgroundApiUrl = 'https://img.example.com/random'
    store.config.settings.backgroundImage = 'data:image/png;base64,OLD'
    mockedConfigService.fetchImageAsBase64.mockRejectedValue(new Error('获取图片失败: 超时'))

    const result = await store.loadApiBackground()

    expect(result.ok).toBe(false)
    expect(result.error).toBe('获取图片失败: 超时')
    expect(store.config.settings.backgroundImage).toBe('data:image/png;base64,OLD')
  })
})
