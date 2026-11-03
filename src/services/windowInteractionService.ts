export function disableNativeContextMenu(target: EventTarget = document): () => void {
  // 只取消浏览器默认菜单，不阻止事件传播，让应用自己的编辑菜单继续工作。
  const preventNativeMenu = (event: Event) => event.preventDefault()
  target.addEventListener('contextmenu', preventNativeMenu)

  const dispose = () => target.removeEventListener('contextmenu', preventNativeMenu)
  if (import.meta.hot) import.meta.hot.dispose(dispose)
  return dispose
}
