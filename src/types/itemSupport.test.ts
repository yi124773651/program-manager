import { describe, expect, it } from 'vitest'
import * as typesModule from '@/types'

describe('条目支持辅助函数', () => {
  it('能识别可导入路径对应的条目类型', () => {
    const detectItemTypeFromPath = (typesModule as any).detectItemTypeFromPath

    expect(detectItemTypeFromPath).toBeTypeOf('function')

    if (typeof detectItemTypeFromPath !== 'function') {
      return
    }

    expect(detectItemTypeFromPath('C:\\Program Files\\BitBrowser\\bitbrowser.exe')).toBe('app')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Desktop\\浏览器.lnk')).toBe('app')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Documents\\方案.docx')).toBe('file')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Documents\\README.md')).toBe('file')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Pictures\\封面.png')).toBe('file')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Documents\\资料库', true)).toBe('folder')
    expect(detectItemTypeFromPath('C:\\Users\\ming\\Documents\\archive.7z')).toBeNull()
  })

  it('能根据条目类型生成展示名称', () => {
    const getItemDisplayNameFromPath = (typesModule as any).getItemDisplayNameFromPath

    expect(getItemDisplayNameFromPath).toBeTypeOf('function')

    if (typeof getItemDisplayNameFromPath !== 'function') {
      return
    }

    expect(getItemDisplayNameFromPath('C:\\Program Files\\BitBrowser\\bitbrowser.exe', 'app')).toBe('bitbrowser')
    expect(getItemDisplayNameFromPath('C:\\Users\\ming\\Desktop\\浏览器.lnk', 'app')).toBe('浏览器')
    expect(getItemDisplayNameFromPath('C:\\Users\\ming\\Documents\\方案.docx', 'file')).toBe('方案.docx')
    expect(getItemDisplayNameFromPath('C:\\Users\\ming\\Documents\\资料库', 'folder')).toBe('资料库')
  })

  it('在扩展名无法判断时，可以通过目录探测识别文件夹', async () => {
    const detectItemTypeForImport = (typesModule as any).detectItemTypeForImport

    expect(detectItemTypeForImport).toBeTypeOf('function')

    if (typeof detectItemTypeForImport !== 'function') {
      return
    }

    await expect(
      detectItemTypeForImport('C:\\Users\\ming\\Documents\\资料库', async () => true)
    ).resolves.toBe('folder')

    await expect(
      detectItemTypeForImport('C:\\Users\\ming\\Documents\\README', async () => false)
    ).resolves.toBeNull()
  })

  it('能根据路径和条目类型推导占位图标变体', () => {
    const getItemPlaceholderVariant = (typesModule as any).getItemPlaceholderVariant

    expect(getItemPlaceholderVariant).toBeTypeOf('function')

    if (typeof getItemPlaceholderVariant !== 'function') {
      return
    }

    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\资料库', 'folder')).toBe('folder')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\制度.pdf')).toBe('pdf')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\方案.docx')).toBe('word')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\报表.xlsx')).toBe('excel')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\汇报.pptx')).toBe('ppt')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\说明.txt')).toBe('text')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\README.md')).toBe('text')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Pictures\\封面.webp')).toBe('image')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\附件.zip', 'file')).toBe('file')
    expect(getItemPlaceholderVariant('C:\\Users\\ming\\Documents\\旧方案.doc')).toBe('word')
  })

  it('只允许程序条目使用进程类能力和更新检测', () => {
    const canUseProcessActions = (typesModule as any).canUseProcessActions
    const canCheckForUpdates = (typesModule as any).canCheckForUpdates

    expect(canUseProcessActions).toBeTypeOf('function')
    expect(canCheckForUpdates).toBeTypeOf('function')

    if (typeof canUseProcessActions !== 'function' || typeof canCheckForUpdates !== 'function') {
      return
    }

    expect(canUseProcessActions('app')).toBe(true)
    expect(canUseProcessActions('file')).toBe(false)
    expect(canUseProcessActions('folder')).toBe(false)

    expect(canCheckForUpdates('app')).toBe(true)
    expect(canCheckForUpdates('file')).toBe(false)
    expect(canCheckForUpdates('folder')).toBe(false)
  })
})
