import type { SceneAction, SceneActionType } from '@/types'
import { SCENE_ACTION_TYPES } from '@/types'

export const SCENE_ACTION_REGISTRY = SCENE_ACTION_TYPES.reduce(
  (registry, actionType) => {
    registry[actionType.type] = actionType
    return registry
  },
  {} as Record<SceneActionType, (typeof SCENE_ACTION_TYPES)[number]>
)

export function getSceneActionName(type: SceneActionType): string {
  return SCENE_ACTION_REGISTRY[type]?.name || type
}

export function getSceneActionDescription(type: SceneActionType): string {
  return SCENE_ACTION_REGISTRY[type]?.description || ''
}

export function cloneSceneAction(action: SceneAction): SceneAction {
  return {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: action.type,
    params: { ...action.params }
  }
}
