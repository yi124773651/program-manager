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

function cloneImportedAction(action: unknown, index: number): SceneAction {
  if (!isRecord(action) || !isSceneActionType(action.type)) {
    throw new Error(`第 ${index + 1} 个动作类型无效`)
  }

  const params = isRecord(action.params) ? action.params : {}

  return cloneSceneAction({
    id: typeof action.id === 'string' ? action.id : `import_action_${index}`,
    type: action.type,
    params: { ...params }
  } as SceneAction)
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
    return Array.isArray(storage.scenes) ? storage.scenes : []
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
