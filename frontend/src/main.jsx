import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import { initTheme } from './hooks/useTheme'

// React 렌더보다 먼저 <html>에 data-theme / --app-font를 반영한다.
// 렌더 이후에 하면 라이트로 한 번 그려졌다가 다크로 바뀌는 번쩍임(FOUC)이 생긴다.
initTheme()

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  sendDefaultPii: false,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 0.1,
  tracePropagationTargets: ["localhost", /^https:\/\/reserve\.it\.kr\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
