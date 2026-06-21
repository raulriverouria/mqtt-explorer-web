import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useThemeStore, applyTheme } from './store/themeStore'
import './index.css'

// Apply initial theme before React mounts to prevent flickering
applyTheme(useThemeStore.getState().themeMode)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
