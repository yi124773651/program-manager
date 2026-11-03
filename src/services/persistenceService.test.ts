import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistenceService } from './persistenceService'
import { tauriAdapter } from '@/adapters/tauriAdapter'

vi.mock('@/adapters/tauriAdapter', () => ({
  tauriAdapter: { readPersistedData: vi.fn(), writePersistedData: vi.fn(), backupPersistedData: vi.fn() }
}))

afterEach(() => vi.unstubAllGlobals())

describe('日程严格读取', () => {
  it('文件读取失败直接报告错误，不能用旧存储掩盖失败', async () => {
    vi.mocked(tauriAdapter.readPersistedData).mockRejectedValueOnce(new Error('文件损坏'))
    const getItem = vi.fn(() => '{"items":[]}')
    vi.stubGlobal('localStorage', { getItem })
    await expect(persistenceService.load('todos', {}, { strict: true })).rejects.toThrow('文件损坏')
    expect(getItem).not.toHaveBeenCalled()
  })

  it('文件不存在时仍兼容旧存储，损坏的旧存储不能变成空数据', async () => {
    vi.mocked(tauriAdapter.readPersistedData).mockResolvedValue(null)
    const getItem = vi.fn(() => '{"items":[{"id":"旧事项","time":"09:15"}]}')
    vi.stubGlobal('localStorage', { getItem })
    await expect(persistenceService.load('todos', {}, { strict: true })).resolves.toEqual({ items: [{ id: '旧事项', time: '09:15' }] })
    getItem.mockReturnValue('损坏的 JSON')
    await expect(persistenceService.load('todos', {}, { strict: true })).rejects.toThrow()
  })
})
