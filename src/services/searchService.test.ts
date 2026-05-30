import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/appStore'
import { useClipboardStore } from '@/stores/clipboardStore'
import { useNotesStore } from '@/stores/notesStore'
import { useScenesStore } from '@/stores/scenesStore'
import { useTodoStore } from '@/stores/todoStore'
import { DEFAULT_CONFIG, type App, type Config, type Scene } from '@/types'
import type { ClipboardItem } from '@/types'
import type { TodoItem } from '@/types/todo'
import { parseSearchQuery, searchService } from './searchService'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => path)
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn()
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' })
}))

vi.mock('@/adapters/clipboardAdapter', () => ({
  clipboardAdapter: {
    readText: vi.fn(),
    writeText: vi.fn()
  }
}))

vi.mock('@/adapters/shellAdapter', () => ({
  shellAdapter: {
    open: vi.fn()
  }
}))

const makeConfig = (): Config => ({
  ...structuredClone(DEFAULT_CONFIG),
  settings: {
    ...structuredClone(DEFAULT_CONFIG.settings),
    clipboardHistoryEnabled: true,
    quickNotesEnabled: true,
    todoScheduleEnabled: true
  },
  apps: {
    app_1: {
      id: 'app_1',
      name: '晨会工具',
      path: 'C:\\Tools\\meeting.exe',
      category: 'cat_1',
      itemType: 'app',
      createdAt: 1
    } satisfies App
  }
})

const scene: Scene = {
  id: 'scene_1',
  name: '晨会流程',
  icon: 'briefcase',
  actions: [],
  createdAt: 1,
  updatedAt: 1
}

const clipboardItem: ClipboardItem = {
  id: 'clip_1',
  content: '晨会文本片段',
  contentType: 'text',
  createdAt: 1,
  pinned: false
}

const todoItem: TodoItem = {
  id: 'todo_1',
  title: '晨会准备',
  date: '2026-05-30',
  startTime: '09:00',
  description: '准备例会材料',
  completed: false,
  createdAt: 1,
  updatedAt: 1
}

describe('searchService', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    const appStore = useAppStore()
    appStore.config = makeConfig()

    const clipboardStore = useClipboardStore()
    clipboardStore.items = [clipboardItem]
    clipboardStore.initialized = true
    clipboardStore.settingsWatcherSetup = true

    const scenesStore = useScenesStore()
    scenesStore.scenes = [scene]
    scenesStore.initialized = true

    const notesStore = useNotesStore()
    notesStore.notes = [{
      id: 'note_1',
      content: '晨会纪要\n后续事项',
      color: '#fff9c4',
      createdAt: 1,
      updatedAt: 1
    }]
    notesStore.initialized = true

    const todoStore = useTodoStore()
    todoStore.items = [todoItem]
    todoStore.initialized = true
  })

  it('会解析网页、剪贴板、便签、待办和场景前缀', () => {
    expect(parseSearchQuery('/ rust')).toEqual({ source: 'web', query: 'rust' })
    expect(parseSearchQuery('c: 片段')).toEqual({ source: 'clipboard', query: '片段' })
    expect(parseSearchQuery('n: 纪要')).toEqual({ source: 'note', query: '纪要' })
    expect(parseSearchQuery('t: 准备')).toEqual({ source: 'todo', query: '准备' })
    expect(parseSearchQuery('s: 流程')).toEqual({ source: 'scene', query: '流程' })
  })

  it('默认搜索会聚合应用、剪贴板、场景、便签、待办和网页结果', async () => {
    const results = await searchService.search('晨会')

    expect(results.map((result) => result.type)).toEqual([
      'app',
      'clipboard',
      'scene',
      'note',
      'todo',
      'web'
    ])
  })

  it('前缀搜索只返回对应数据源', async () => {
    await expect(searchService.search('c:晨会')).resolves.toMatchObject([{ type: 'clipboard' }])
    await expect(searchService.search('n:晨会')).resolves.toMatchObject([{ type: 'note' }])
    await expect(searchService.search('t:晨会')).resolves.toMatchObject([{ type: 'todo' }])
    await expect(searchService.search('s:晨会')).resolves.toMatchObject([{ type: 'scene' }])
  })

  it('功能禁用后不会返回对应搜索源结果', async () => {
    useAppStore().config.settings.quickNotesEnabled = false

    const results = await searchService.search('n:晨会')

    expect(results).toEqual([])
  })
})
