export type ManagedItemType = 'app' | 'folder' | 'file'
export type ItemPlaceholderVariant = 'folder' | 'file' | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'image'

const 程序扩展名 = new Set(['exe', 'lnk'])
const 文本扩展名 = new Set(['txt', 'md', 'markdown'])
const 图片扩展名 = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif', 'tif', 'tiff', 'heic'])
const 文档扩展名 = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'pdf',
  ...文本扩展名,
  ...图片扩展名
])
const 允许显示的文件动作 = new Set(['open_folder', 'copy_path'])

export const SUPPORTED_IMPORT_EXTENSIONS = [...程序扩展名, ...文档扩展名]

function 获取路径文件名(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

function 获取扩展名(path: string): string {
  const fileName = 获取路径文件名(path)
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return fileName.slice(dotIndex + 1).toLowerCase()
}

export function normalizeItemType(itemType?: ManagedItemType | string | null): ManagedItemType {
  if (itemType === 'folder' || itemType === 'file') {
    return itemType
  }
  return 'app'
}

export function detectItemTypeFromPath(path: string, isDirectory = false): ManagedItemType | null {
  if (!path) return null
  if (isDirectory) return 'folder'

  const extension = 获取扩展名(path)
  if (程序扩展名.has(extension)) return 'app'
  if (文档扩展名.has(extension)) return 'file'
  return null
}

export function isSupportedImportPath(path: string, isDirectory = false): boolean {
  return detectItemTypeFromPath(path, isDirectory) !== null
}

export async function detectItemTypeForImport(
  path: string,
  probeIsDirectory?: () => Promise<boolean>
): Promise<ManagedItemType | null> {
  const directType = detectItemTypeFromPath(path)
  if (directType) {
    return directType
  }

  if (!probeIsDirectory) {
    return null
  }

  return (await probeIsDirectory()) ? 'folder' : null
}

export function getItemDisplayNameFromPath(path: string, itemType?: ManagedItemType | string | null): string {
  const fileName = 获取路径文件名(path)
  if (normalizeItemType(itemType) === 'app') {
    return fileName.replace(/\.(exe|lnk)$/i, '')
  }
  return fileName
}

export function getItemPlaceholderVariant(
  path: string,
  itemType?: ManagedItemType | string | null
): ItemPlaceholderVariant {
  if (normalizeItemType(itemType) === 'folder') {
    return 'folder'
  }

  const extension = 获取扩展名(path)

  if (extension === 'pdf') return 'pdf'
  if (extension === 'doc' || extension === 'docx') return 'word'
  if (extension === 'xls' || extension === 'xlsx') return 'excel'
  if (extension === 'ppt' || extension === 'pptx') return 'ppt'
  if (文本扩展名.has(extension)) return 'text'
  if (图片扩展名.has(extension)) return 'image'

  return 'file'
}

export function canUseProcessActions(itemType?: ManagedItemType | string | null): boolean {
  return normalizeItemType(itemType) === 'app'
}

export function canCheckForUpdates(itemType?: ManagedItemType | string | null): boolean {
  return normalizeItemType(itemType) === 'app'
}

export function isActionSupportedForItem(actionId: string, itemType?: ManagedItemType | string | null): boolean {
  if (canUseProcessActions(itemType)) {
    return true
  }
  return 允许显示的文件动作.has(actionId)
}

export function getPrimaryActionLabel(itemType?: ManagedItemType | string | null): string {
  return normalizeItemType(itemType) === 'app' ? '启动' : '打开'
}
