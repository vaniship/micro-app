import { appInstanceMap } from '../create_app'
import { getRootContainer } from './utils'

function unmountNestedApp (): void {
  appInstanceMap.forEach(app => {
    // @ts-ignore
    app.container && getRootContainer(app.container).disconnectedCallback()
  })

  !window.__MICRO_APP_UMD_MODE__ && appInstanceMap.clear()
}

// release listener
function releaseUnmountOfNestedApp (): void {
  if (window.__MICRO_APP_ENVIRONMENT__) {
    window.removeEventListener('unmount', unmountNestedApp, false)
  }
}

// if micro-app run in micro application, delete all next generation application when unmount event received
// unmount event will auto release by sandbox
export function initEnvOfNestedApp (): void {
  if (window.__MICRO_APP_ENVIRONMENT__) {
    releaseUnmountOfNestedApp()
    window.addEventListener('unmount', unmountNestedApp, false)
  }
}
