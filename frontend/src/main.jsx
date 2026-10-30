import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import { initTheme } from './hooks/useTheme'
import { installChunkReloadHandler } from './utils/chunkReload'
import { scheduleSessionReplay } from './utils/sessionReplay'

// React 렌더보다 먼저 <html>에 data-theme / --app-font를 반영한다.
// 렌더 이후에 하면 라이트로 한 번 그려졌다가 다크로 바뀌는 번쩍임(FOUC)이 생긴다.
initTheme()

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  // SDK 11의 기본 수집 범위가 넓어져, 기존 개인정보 비수집 설정을 명시한다.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
  },
  attachStacktrace: false,
  traceLifecycle: 'static',
  integrations: [
    Sentry.browserTracingIntegration({ webVitals: { softNavigations: false, bfcacheNavigations: false } }),
    Sentry.browserSessionIntegration({ lifecycle: 'route' }),
  ],
  tracesSampleRate: 0.1,
  tracePropagationTargets: ["localhost", /^https:\/\/reserve\.it\.kr\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
})

// 배포 뒤 옛 탭이 라우트 청크를 못 받으면 한 번만 새로고침한다(무한 반복 방지는 chunkReload.js).
installChunkReloadHandler()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const cancelReplay = scheduleSessionReplay()
if (import.meta.hot) import.meta.hot.dispose(cancelReplay)
