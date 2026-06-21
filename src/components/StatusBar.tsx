import { useMqttStore } from '../store/mqttStore'

export default function StatusBar() {
  const { statusInfo, totalTopics, totalMessages, messagesPerSecond } = useMqttStore()

  const { status, brokerUrl, error } = statusInfo

  const getStatusLabel = () => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'error':
        return `Error: ${error ?? 'Connection error'}`
      default:
        return 'Disconnected'
    }
  }

  return (
    <footer className="status-bar">
      <div className="status-indicator">
        <span className={`status-dot ${status}`} />
        <span>{getStatusLabel()}</span>
      </div>

      {status === 'connected' && brokerUrl && (
        <div className="status-url" title={brokerUrl}>
          {brokerUrl}
        </div>
      )}

      <div className="status-spacer" />

      {status === 'connected' && (
        <>
          <div className="status-stat">
            <span>Topics:</span>
            <span className="stat-value">{totalTopics}</span>
          </div>

          <div className="status-stat" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
            <span>Messages:</span>
            <span className="stat-value">{totalMessages}</span>
          </div>

          <div className="status-stat" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
            <span>Rate:</span>
            <span className="stat-value">{messagesPerSecond} msg/s</span>
          </div>
        </>
      )}
    </footer>
  )
}
