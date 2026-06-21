import { useEffect, useState, useRef } from 'react'
import { useMqttStore } from './store/mqttStore'
import { mqttBrowserClient } from './lib/mqttClient'
import Toolbar from './components/Toolbar'
import TopicTree from './components/TopicTree'
import TopicFilter from './components/TopicFilter'
import MessageDetail from './components/MessageDetail'
import MessageHistory from './components/MessageHistory'
import PublishPanel from './components/PublishPanel'
import StatusBar from './components/StatusBar'
import ConnectionDialog from './components/ConnectionDialog'

export default function App() {
  const [showConnect, setShowConnect] = useState(true)
  const { setStatus, addMessage, clearAll, selectedTopic, statusInfo } = useMqttStore()

  const sidebarRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const isResizing = useRef(false)

  // Register MQTT event listeners once
  useEffect(() => {
    const offMsg = mqttBrowserClient.onMessage((msg) => {
      addMessage(msg)
    })

    const offStatus = mqttBrowserClient.onStatus((s) => {
      if (s.connected) {
        setStatus({ status: 'connected', brokerUrl: s.url ?? '' })
        setShowConnect(false)
      } else if (s.reconnecting) {
        setStatus({ status: 'reconnecting' })
      } else if (s.error) {
        setStatus({ status: 'error', error: s.error })
        clearAll()
        setShowConnect(true)
      } else {
        setStatus({ status: 'disconnected' })
        clearAll()
        setShowConnect(true)
      }
    })

    return () => {
      offMsg()
      offStatus()
    }
  }, [addMessage, setStatus, clearAll])

  // Sidebar resize
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const delta = ev.clientX - startX
      setSidebarWidth(Math.min(600, Math.max(180, startW + delta)))
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="app-root">
      <Toolbar
        onConnect={() => setShowConnect(true)}
        isConnected={statusInfo.status === 'connected'}
      />

      <div className="app-body">
        {/* Sidebar */}
        <div
          className="sidebar"
          ref={sidebarRef}
          style={{ width: sidebarWidth }}
        >
          <div className="sidebar-header">
            <TopicFilter />
          </div>
          <div className="topic-tree-scroll">
            <TopicTree />
          </div>
        </div>

        {/* Resize handle */}
        <div
          className={`resize-handle${isResizing.current ? ' active' : ''}`}
          onMouseDown={startResize}
        />

        {/* Main panel */}
        <div className="main-panel">
          {selectedTopic ? (
            <div className="panel-sections">
              <MessageDetail />
              <MessageHistory />
              <PublishPanel />
            </div>
          ) : (
            <div className="main-panel-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              <p>Select a topic from the tree to inspect</p>
            </div>
          )}
        </div>
      </div>

      <StatusBar />

      {showConnect && (
        <ConnectionDialog onClose={() => setShowConnect(false)} />
      )}
    </div>
  )
}
