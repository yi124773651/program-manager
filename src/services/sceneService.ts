import type { Scene, SceneAction, SceneFailureStrategy } from '@/types'
import { persistenceService } from '@/services/persistenceService'
import { SCENE_ACTION_REGISTRY, cloneSceneAction } from '@/services/sceneActionRegistry'

interface ScenesStorage {
  scenes?: Scene[]
}

function createEntityId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSceneActionType(type: unknown): type is SceneAction['type'] {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(SCENE_ACTION_REGISTRY, type)
}

function isFailureStrategy(value: unknown): value is SceneFailureStrategy {
  return value === 'continue' || value === 'stop'
}

function safeText(value: unknown, field: string, maxLength: number, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${field}不能为空`)
    return undefined
  }
  if (typeof value !== 'string' || value.length > maxLength || [...value].some(char => /[\u0000-\u001f\u007f]/.test(char))) {
    throw new Error(`${field}无效`)
  }
  return value
}

function optionalNumber(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field}必须在 ${min}-${max} 之间`)
  }
  return value
}

function hasLegacyScriptPayload(action: Record<string, unknown>, params: Record<string, unknown>): boolean {
  const legacyType = typeof action.type === 'string' ? action.type.toLowerCase() : ''
  if (/(power\s*shell|script|shell|execute_action_template|execute_script)/.test(legacyType)) return true

  const unsafeKeys = new Set([
    'script', 'scriptcontent', 'script_content', 'powershell', 'command', 'commandline', 'command_line'
  ])
  return Object.keys(params).some(key => unsafeKeys.has(key.toLowerCase()))
}

function createDisabledLegacyAction(action: Record<string, unknown>, index: number, reason: string): SceneAction {
  const legacyType = typeof action.type === 'string' && action.type.length <= 64 ? action.type : 'unknown'
  return {
    id: typeof action.id === 'string' && action.id.length <= 128 ? action.id : `disabled_action_${index}`,
    type: 'notify',
    disabled: true,
    disabledReason: reason,
    legacyType,
    params: {}
  }
}

function sanitizeActionParams(type: SceneAction['type'], params: Record<string, unknown>): SceneAction['params'] {
  switch (type) {
    case 'launch':
    case 'launch_admin': {
      const appId = safeText(params.appId, '应用 ID', 128)
      const sendKeys = safeText(params.sendKeys, '按键内容', 128, false)
      return {
        appId,
        waitWindow: params.waitWindow === true || undefined,
        waitTimeout: optionalNumber(params.waitTimeout, '等待超时', 1, 300),
        sendKeys,
        delayAfter: optionalNumber(params.delayAfter, '启动后延迟', 0, 300)
      }
    }
    case 'open_url': {
      const value = safeText(params.url, '网址', 2048)!
      let parsed: URL
      try {
        parsed = new URL(value)
      } catch {
        throw new Error('网址格式无效')
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
        throw new Error('网址仅支持无认证信息的 HTTP 或 HTTPS 地址')
      }
      return { url: parsed.toString() }
    }
    case 'open_folder':
    case 'open_file': {
      const path = safeText(params.path, '路径', 4096)!
      if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path) || path.includes('"')) {
        throw new Error('路径必须是有效的 Windows 绝对路径')
      }
      return { path }
    }
    case 'close_app': {
      const appId = safeText(params.appId, '应用 ID', 128, false)
      const processName = safeText(params.processName, '进程名', 255, false)
      if (!appId && !processName) throw new Error('关闭程序动作缺少应用或进程名')
      if (processName && !/^[A-Za-z0-9_.-]+$/.test(processName)) throw new Error('进程名包含非法字符')
      return { appId, processName }
    }
    case 'delay':
      return { seconds: optionalNumber(params.seconds, '延迟秒数', 1, 300) ?? 1 }
    case 'notify':
      return { message: safeText(params.message, '通知内容', 500)! }
  }
}

function sanitizeSceneAction(action: unknown, index: number, disableInvalid: boolean): SceneAction {
  if (!isRecord(action)) {
    if (disableInvalid) return createDisabledLegacyAction({}, index, '旧动作结构无效，已禁用')
    throw new Error(`第 ${index + 1} 个动作结构无效`)
  }

  const params = isRecord(action.params) ? action.params : {}
  if (hasLegacyScriptPayload(action, params)) {
    return createDisabledLegacyAction(action, index, '旧脚本动作无法安全迁移，已禁用且脚本内容未保留')
  }

  if (!isSceneActionType(action.type)) {
    if (disableInvalid) return createDisabledLegacyAction(action, index, '未知旧动作类型，已禁用')
    throw new Error(`第 ${index + 1} 个动作类型无效`)
  }

  try {
    const sanitized: SceneAction = {
      id: typeof action.id === 'string' && action.id.length <= 128 ? action.id : `import_action_${index}`,
      type: action.type,
      params: sanitizeActionParams(action.type, params)
    }
    if (action.disabled === true) {
      sanitized.disabled = true
      sanitized.disabledReason = safeText(action.disabledReason, '禁用原因', 200, false) || '动作已禁用'
      sanitized.legacyType = safeText(action.legacyType, '旧动作类型', 64, false)
    }
    return sanitized
  } catch (error) {
    if (disableInvalid) {
      return createDisabledLegacyAction(action, index, `旧动作参数无效，已禁用：${String(error)}`)
    }
    throw new Error(`第 ${index + 1} 个动作参数无效：${String(error)}`)
  }
}

function sanitizeStoredScene(scene: unknown, index: number): Scene | null {
  if (!isRecord(scene) || typeof scene.name !== 'string' || !Array.isArray(scene.actions)) return null
  const now = Date.now()
  return {
    id: typeof scene.id === 'string' && scene.id.length <= 128 ? scene.id : `migrated_scene_${index}`,
    name: scene.name.slice(0, 100) || `已迁移场景 ${index + 1}`,
    icon: typeof scene.icon === 'string' && scene.icon.length <= 16 ? scene.icon : '⚡',
    shortcut: typeof scene.shortcut === 'string' && scene.shortcut.length <= 64 ? scene.shortcut : undefined,
    failureStrategy: isFailureStrategy(scene.failureStrategy) ? scene.failureStrategy : 'continue',
    actions: scene.actions.map((action, actionIndex) => sanitizeSceneAction(action, actionIndex, true)),
    createdAt: typeof scene.createdAt === 'number' ? scene.createdAt : now,
    updatedAt: typeof scene.updatedAt === 'number' ? scene.updatedAt : now
  }
}

function cloneImportedAction(action: unknown, index: number): SceneAction {
  const sanitized = sanitizeSceneAction(action, index, false)

  return cloneSceneAction(sanitized)
}

export const sceneService = {
  createSceneId() {
    return createEntityId('scene')
  },

  createActionId() {
    return createEntityId('action')
  },

  async loadScenes(): Promise<Scene[]> {
    const storage = await persistenceService.load<ScenesStorage>('scenes', { scenes: [] })
    if (!Array.isArray(storage.scenes)) return []
    const scenes = storage.scenes
      .map((scene, index) => sanitizeStoredScene(scene, index))
      .filter((scene): scene is Scene => scene !== null)

    // 仅在清洗结果与原始数据不同步时回写；正常启动不会重复创建备份。
    if (JSON.stringify(storage.scenes) !== JSON.stringify(scenes)) {
      try {
        await persistenceService.backup('scenes', '清洗旧场景动作配置前自动备份')
        await persistenceService.save('scenes', { scenes })
      } catch (error) {
        // 即使持久化迁移失败，也返回内存中的安全结果，阻止旧脚本被执行。
        console.error('保存清洗后的场景配置失败:', error)
      }
    }

    return scenes
  },

  saveScenes(scenes: Scene[]) {
    return persistenceService.save('scenes', { scenes })
  },

  createScene(scene: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>): Scene {
    const now = Date.now()
    return {
      ...scene,
      failureStrategy: scene.failureStrategy || 'continue',
      id: this.createSceneId(),
      createdAt: now,
      updatedAt: now
    }
  },

  duplicateScene(source: Scene): Scene {
    const now = Date.now()
    return {
      id: this.createSceneId(),
      name: `${source.name} 副本`,
      icon: source.icon,
      shortcut: source.shortcut,
      failureStrategy: source.failureStrategy || 'continue',
      actions: source.actions.map(cloneSceneAction),
      createdAt: now,
      updatedAt: now
    }
  },

  exportSceneJson(scene: Scene) {
    return JSON.stringify(scene, null, 2)
  },

  importSceneJson(rawJson: string): Scene {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      throw new Error('场景 JSON 格式无效')
    }

    if (!isRecord(parsed) || typeof parsed.name !== 'string' || !Array.isArray(parsed.actions)) {
      throw new Error('场景 JSON 缺少名称或动作列表')
    }

    if (parsed.failureStrategy !== undefined && !isFailureStrategy(parsed.failureStrategy)) {
      throw new Error('场景失败策略无效')
    }

    const now = Date.now()
    return {
      id: this.createSceneId(),
      name: parsed.name,
      icon: typeof parsed.icon === 'string' ? parsed.icon : '⚡',
      shortcut: typeof parsed.shortcut === 'string' ? parsed.shortcut : undefined,
      failureStrategy: parsed.failureStrategy || 'continue',
      actions: parsed.actions.map(cloneImportedAction),
      createdAt: now,
      updatedAt: now
    }
  }
}
