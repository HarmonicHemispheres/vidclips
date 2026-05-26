/// <reference types="vite/client" />

import type { VidclipsApi } from '../preload/index'

declare global {
  interface Window {
    api: VidclipsApi
  }
}

export {}
