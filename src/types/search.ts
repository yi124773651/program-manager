// 搜索结果类型
export type SearchResultType = 'app' | 'clipboard' | 'web' | 'calculator'

// 搜索结果项
export interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  subtitle?: string
  icon?: string
  data: any
}

// 搜索提供者
export interface SearchProvider {
  type: SearchResultType
  name: string
  icon: string
  search: (query: string) => Promise<SearchResult[]> | SearchResult[]
  execute: (result: SearchResult) => void | Promise<void>
}

// 搜索状态
export interface SearchState {
  query: string
  isOpen: boolean
  results: SearchResult[]
  selectedIndex: number
  isLoading: boolean
}

// 网页搜索引擎
export interface WebSearchEngine {
  id: string
  name: string
  urlTemplate: string
  icon?: string
}

// 默认搜索引擎
export const DEFAULT_SEARCH_ENGINES: WebSearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}'
  },
  {
    id: 'bing',
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}'
  },
  {
    id: 'baidu',
    name: '百度',
    urlTemplate: 'https://www.baidu.com/s?wd={query}'
  }
]
