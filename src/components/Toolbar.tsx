import { useMqttStore } from '../store/mqttStore'
import { useThemeStore, ThemeMode } from '../store/themeStore'
import { mqttBrowserClient } from '../lib/mqttClient'

interface ToolbarProps {
  onConnect: () => void
  isConnected: boolean
}

export default function Toolbar({ onConnect, isConnected }: ToolbarProps) {
  const { statusInfo } = useMqttStore()
  const { themeMode, setThemeMode } = useThemeStore()

  const disconnect = async () => {
    await mqttBrowserClient.disconnect()
  }

  return (
    <header className="toolbar">
      <div className="toolbar-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="toolbar-title">MQTT Explorer</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-actions">
        {/* Theme Selector */}
        <div className="theme-select-container">
          <svg style={{ width: 13, height: 13, color: 'var(--text-secondary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <select
            className="form-select theme-select-dropdown"
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        {isConnected ? (
          <button className="btn btn-outline" onClick={disconnect}>
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="9" x2="15" y2="15" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
            Disconnect
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onConnect}>
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Connect
          </button>
        )}
      </div>
    </header>
  )
}
