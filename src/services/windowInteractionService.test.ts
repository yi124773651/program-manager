import { describe, expect, it, vi } from 'vitest'
import { disableNativeContextMenu } from './windowInteractionService'

describe('窗口右键菜单', () => {
  it('阻止默认菜单，但仍触发应用自定义的右键处理', () => {
    const target = new EventTarget()
    const dispose = disableNativeContextMenu(target)
    const customMenu = vi.fn()
    target.addEventListener('contextmenu', customMenu)
    const event = new Event('contextmenu', { cancelable: true })

    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(customMenu).toHaveBeenCalledOnce()
    dispose()
    const afterDispose = new Event('contextmenu', { cancelable: true })
    target.dispatchEvent(afterDispose)
    expect(afterDispose.defaultPrevented).toBe(false)
  })
})
