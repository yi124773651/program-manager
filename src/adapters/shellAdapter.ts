import { invoke } from '@tauri-apps/api/core'

export const shellAdapter = {
  open(url: string) {
    return invoke<void>('open_url', { url })
  }
}
