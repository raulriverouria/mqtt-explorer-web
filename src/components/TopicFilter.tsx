import { useMqttStore } from '../store/mqttStore'
import { useRef, useEffect } from 'react'

export default function TopicFilter() {
  const { filterText, setFilter } = useMqttStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="filter-wrapper">
      <div className="filter-icon">
        <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        className="topic-filter-input"
        placeholder="Filter topics... (⌘K)"
        value={filterText}
        onChange={(e) => setFilter(e.target.value)}
      />
    </div>
  )
}
