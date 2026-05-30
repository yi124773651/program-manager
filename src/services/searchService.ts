import { invoke } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '@/stores/appStore'
import { useClipboardStore } from '@/stores/clipboardStore'
import { useNotesStore } from '@/stores/notesStore'
import { useScenesStore } from '@/stores/scenesStore'
import { useTodoStore } from '@/stores/todoStore'
import type { App, AppSettings, Scene } from '@/types'
import type { TodoItem } from '@/types/todo'
import type { SearchResult, SearchResultType } from '@/types/search'
import { DEFAULT_SEARCH_ENGINES } from '@/types/search'
import { clipboardAdapter } from '@/adapters/clipboardAdapter'
import { shellAdapter } from '@/adapters/shellAdapter'

type SearchSource = 'all' | 'web' | 'clipboard' | 'note' | 'todo' | 'scene' | 'calculator'

interface ParsedSearchQuery {
  source: SearchSource
  query: string
}

interface AppSearchIndexItem {
  id: string
  app: App
  searchableText: string
}

const SEARCH_RESULT_LIMIT = 10
const DEFAULT_SECONDARY_LIMIT = 3
const WINDOW_SELECTION_DELAY = 250

let appIndexSignature = ''
let appIndex: AppSearchIndexItem[] = []

export const SEARCH_RESULT_ORDER: SearchResultType[] = [
  'calculator',
  'app',
  'clipboard',
  'scene',
  'note',
  'todo',
  'web'
]

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const query = rawQuery.trim()
  if (!query) return { source: 'all', query: '' }

  if (query.startsWith('=')) {
    return { source: 'calculator', query: query.slice(1).trim() }
  }

  if (query.startsWith('/')) {
    return { source: 'web', query: query.slice(1).trim() }
  }

  const prefix = query.slice(0, 2).toLowerCase()
  const rest = query.slice(2).trim()

  if (prefix === 'c:') return { source: 'clipboard', query: rest }
  if (prefix === 'n:') return { source: 'note', query: rest }
  if (prefix === 't:') return { source: 'todo', query: rest }
  if (prefix === 's:') return { source: 'scene', query: rest }

  return { source: 'all', query }
}

export const searchService = {
  async search(rawQuery: string): Promise<SearchResult[]> {
    const parsed = parseSearchQuery(rawQuery)
    if (!parsed.query) return []

    const appStore = useAppStore()
    const settings = appStore.settings

    await initRequiredStores(parsed.source, settings)

    switch (parsed.source) {
      case 'calculator':
        return settings.calculatorEnabled === false
          ? []
          : [evaluateExpression(parsed.query)].filter((result): result is SearchResult => !!result)

      case 'web':
        return getWebSearchResults(parsed.query)

      case 'clipboard':
        return isClipboardSearchEnabled(settings) ? searchClipboard(parsed.query) : []

      case 'note':
        return isNotesSearchEnabled(settings) ? searchNotes(parsed.query) : []

      case 'todo':
        return isTodoSearchEnabled(settings) ? searchTodos(parsed.query) : []

      case 'scene':
        return searchScenes(parsed.query)

      case 'all':
      default: {
        const results: SearchResult[] = [
          ...searchApps(parsed.query),
          ...searchScenes(parsed.query).slice(0, DEFAULT_SECONDARY_LIMIT)
        ]

        if (isClipboardSearchEnabled(settings)) {
          results.push(...searchClipboard(parsed.query).slice(0, DEFAULT_SECONDARY_LIMIT))
        }

        if (isNotesSearchEnabled(settings)) {
          results.push(...searchNotes(parsed.query).slice(0, DEFAULT_SECONDARY_LIMIT))
        }

        if (isTodoSearchEnabled(settings)) {
          results.push(...searchTodos(parsed.query).slice(0, DEFAULT_SECONDARY_LIMIT))
        }

        results.push(...getWebSearchResults(parsed.query).slice(0, 1))
        return sortByTypeOrder(results)
      }
    }
  },

  async executeResult(result: SearchResult): Promise<void> {
    switch (result.type) {
      case 'app':
        await useAppStore().launchApp(result.data.id)
        break

      case 'clipboard':
        await useClipboardStore().pasteItem(result.data.id)
        break

      case 'scene':
        await useScenesStore().executeScene(result.data.id)
        break

      case 'note':
        await openNoteResult(result.data.id)
        break

      case 'todo':
        await openTodoResult(result.data.id, result.data.date)
        break

      case 'web': {
        const { engine, query } = result.data
        const url = engine.urlTemplate.replace('{query}', encodeURIComponent(query))
        await shellAdapter.open(url)
        break
      }

      case 'calculator':
        await clipboardAdapter.writeText(result.data.result)
        break
    }
  }
}

async function initRequiredStores(source: SearchSource, settings: AppSettings) {
  const initJobs: Promise<unknown>[] = []

  if (source === 'all' || source === 'clipboard') {
    if (isClipboardSearchEnabled(settings)) {
      const clipboardStore = useClipboardStore()
      if (!clipboardStore.initialized) {
        initJobs.push(clipboardStore.init())
      }
    }
  }

  if (source === 'all' || source === 'scene') {
    const scenesStore = useScenesStore()
    if (!scenesStore.initialized) {
      initJobs.push(scenesStore.init())
    }
  }

  if (source === 'all' || source === 'note') {
    if (isNotesSearchEnabled(settings)) {
      const notesStore = useNotesStore()
      if (!notesStore.initialized) {
        initJobs.push(notesStore.init())
      }
    }
  }

  if (source === 'all' || source === 'todo') {
    if (isTodoSearchEnabled(settings)) {
      const todoStore = useTodoStore()
      if (!todoStore.initialized) {
        initJobs.push(todoStore.init())
      }
    }
  }

  await Promise.all(initJobs)
}

function isClipboardSearchEnabled(settings: AppSettings) {
  return settings.quickerEnabled !== false && settings.clipboardHistoryEnabled !== false
}

function isNotesSearchEnabled(settings: AppSettings) {
  return settings.quickerEnabled !== false && settings.quickNotesEnabled !== false
}

function isTodoSearchEnabled(settings: AppSettings) {
  return settings.quickerEnabled !== false && settings.todoScheduleEnabled !== false
}

function searchApps(query: string): SearchResult[] {
  const appStore = useAppStore()
  const lowerQuery = query.toLowerCase()
  const index = getAppSearchIndex()

  return index
    .filter((item) => item.searchableText.includes(lowerQuery))
    .sort((a, b) => {
      const aStartsWith = a.app.name.toLowerCase().startsWith(lowerQuery)
      const bStartsWith = b.app.name.toLowerCase().startsWith(lowerQuery)
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      return a.app.name.localeCompare(b.app.name)
    })
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ app }) => ({
      id: `app-${app.id}`,
      type: 'app',
      title: app.name,
      subtitle: app.path,
      icon: appStore.iconUrlCache[app.id] || (app.icon?.startsWith('data:') ? app.icon : undefined),
      data: app
    }))
}

function getAppSearchIndex(): AppSearchIndexItem[] {
  const apps = Object.values(useAppStore().config.apps)
  const signature = apps
    .map((app) => `${app.id}:${app.name}:${app.path}:${app.lastLaunched ?? ''}`)
    .join('|')

  if (signature === appIndexSignature) return appIndex

  appIndexSignature = signature
  appIndex = apps.map((app) => ({
    id: app.id,
    app,
    searchableText: `${app.name}\n${app.path}`.toLowerCase()
  }))

  return appIndex
}

function searchClipboard(query: string): SearchResult[] {
  const lowerQuery = query.toLowerCase()

  return useClipboardStore()
    .items
    .filter((item) => item.content.toLowerCase().includes(lowerQuery))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((item) => ({
      id: `clipboard-${item.id}`,
      type: 'clipboard',
      title: item.preview || item.content.slice(0, 50),
      subtitle: new Date(item.createdAt).toLocaleString(),
      data: item
    }))
}

function searchScenes(query: string): SearchResult[] {
  const lowerQuery = query.toLowerCase()

  return useScenesStore()
    .scenes
    .filter((scene) => sceneSearchText(scene).includes(lowerQuery))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((scene) => ({
      id: `scene-${scene.id}`,
      type: 'scene',
      title: scene.name,
      subtitle: `${scene.actions.length} 个动作，回车执行`,
      data: scene
    }))
}

function sceneSearchText(scene: Scene): string {
  const actionText = scene.actions
    .map((action) => JSON.stringify(action.params))
    .join('\n')
  return `${scene.name}\n${scene.shortcut ?? ''}\n${actionText}`.toLowerCase()
}

function searchNotes(query: string): SearchResult[] {
  const lowerQuery = query.toLowerCase()

  return useNotesStore()
    .sortedNotes
    .filter((note) => note.content.toLowerCase().includes(lowerQuery))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((note) => ({
      id: `note-${note.id}`,
      type: 'note',
      title: getNoteTitle(note.content),
      subtitle: `更新于 ${new Date(note.updatedAt).toLocaleString()}`,
      data: note
    }))
}

function getNoteTitle(content: string): string {
  const firstLine = content.trim().split(/\r?\n/)[0]?.trim()
  return firstLine || '空便签'
}

function searchTodos(query: string): SearchResult[] {
  const lowerQuery = query.toLowerCase()

  return useTodoStore()
    .items
    .filter((item) => todoSearchText(item).includes(lowerQuery))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((item) => ({
      id: `todo-${item.id}`,
      type: 'todo',
      title: item.title,
      subtitle: getTodoSubtitle(item),
      data: item
    }))
}

function todoSearchText(item: TodoItem): string {
  return `${item.title}\n${item.description}\n${item.date}\n${item.startTime ?? ''}\n${item.endTime ?? ''}`.toLowerCase()
}

function getTodoSubtitle(item: TodoItem): string {
  const timeRange = item.startTime
    ? `${item.startTime}${item.endTime ? `-${item.endTime}` : ''}`
    : '未设置时间'
  return `${item.date} ${timeRange}${item.completed ? '，已完成' : ''}`
}

function getWebSearchResults(query: string): SearchResult[] {
  return DEFAULT_SEARCH_ENGINES.map((engine) => ({
    id: `web-${engine.id}`,
    type: 'web',
    title: `在 ${engine.name} 中搜索`,
    subtitle: query,
    data: { engine, query }
  }))
}

function evaluateExpression(expression: string): SearchResult | null {
  try {
    const sanitized = expression.replace(/\s/g, '')
    if (!/^[\d+\-*/().%^]+$/.test(sanitized)) {
      return null
    }

    const jsExpression = sanitized.replace(/\^/g, '**')
    const result = new Function(`return (${jsExpression})`)()

    if (typeof result === 'number' && !Number.isNaN(result) && Number.isFinite(result)) {
      const formattedResult = Number.isInteger(result)
        ? result.toString()
        : result.toFixed(10).replace(/\.?0+$/, '')

      return {
        id: 'calculator-result',
        type: 'calculator',
        title: formattedResult,
        subtitle: `${expression} = ${formattedResult}（回车复制结果）`,
        data: { expression, result: formattedResult }
      }
    }
  } catch {
    return null
  }

  return null
}

function sortByTypeOrder(results: SearchResult[]): SearchResult[] {
  return results.sort((a, b) => SEARCH_RESULT_ORDER.indexOf(a.type) - SEARCH_RESULT_ORDER.indexOf(b.type))
}

async function openNoteResult(noteId: string) {
  const notesStore = useNotesStore()
  await notesStore.init()

  if (getCurrentWindow().label === 'main') {
    notesStore.open()
    notesStore.selectNote(noteId)
    return
  }

  await invoke('show_notes_window')
  await waitForWindowSelection()
  await emitTo('notes', 'select-note', { noteId })
}

async function openTodoResult(todoId: string, date: string) {
  const todoStore = useTodoStore()
  await todoStore.init()

  if (getCurrentWindow().label === 'todo') {
    todoStore.setSelectedDate(date)
    return
  }

  await invoke('show_todo_window')
  await waitForWindowSelection()
  await emitTo('todo', 'select-todo', { todoId, date })
}

function waitForWindowSelection() {
  return new Promise((resolve) => window.setTimeout(resolve, WINDOW_SELECTION_DELAY))
}
