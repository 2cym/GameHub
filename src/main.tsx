import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { applyTheme, getTheme } from './lib/theme'
import { pruneStaleSaves } from './games/shared/saveGame'
import './styles/global.css'

// 兜底：index.html 里的内联脚本负责首帧前的主题，这里保证任何入口（测试、嵌入）都拿到正确主题
applyTheme(getTheme())

// 清掉超过 7 天的旧存档：既腾 localStorage 空间，也避免弹出早就没意义的残局
pruneStaleSaves()

// 注册 Service Worker 以支持离线（缓存应用壳，断网时单机游戏可玩）。
// 只在生产构建注册：dev 下 SW 会把注入过 HMR 的 index.html 缓存下来，导致热更新失效。
// 用相对路径 './sw.js'，站点挂到子路径时作用域依然正确。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 不支持 SW 的环境、非 https、或安装失败都不该让用户看到报错
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
