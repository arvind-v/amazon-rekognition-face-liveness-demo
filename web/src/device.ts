import type { ClientContext } from './api'

declare const __LIVENESS_SDK_VERSION__: string

export const livenessSdkVersion = __LIVENESS_SDK_VERSION__

/** Describes this browser for the backend's per-result log line. */
export function clientContext(extra: ClientContext = {}): ClientContext {
  return {
    platform: 'web',
    sdk: `@aws-amplify/ui-react-liveness ${livenessSdkVersion}`,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ...extra,
  }
}
