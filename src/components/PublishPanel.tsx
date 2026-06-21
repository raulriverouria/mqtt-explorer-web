import { useState, useEffect } from 'react'
import { useMqttStore } from '../store/mqttStore'
import { mqttBrowserClient } from '../lib/mqttClient'

export default function PublishPanel() {
  const { selectedTopic } = useMqttStore()
  const [topic, setTopic] = useState('')
  const [payload, setPayload] = useState('')
  const [qos, setQos] = useState<0 | 1 | 2>(0)
  const [retain, setRetain] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (selectedTopic) {
      setTopic(selectedTopic)
    }
  }, [selectedTopic])

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await mqttBrowserClient.publish({
        topic,
        payload,
        qos,
        retain
      })
      if (res.success) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(res.error ?? 'Unknown publish error')
      }
    } catch (err: unknown) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="publish-panel">
      <div className="publish-panel-header">
        <span className="section-title">Publish</span>
      </div>

      <form className="publish-body" onSubmit={handlePublish}>
        <div className="publish-row">
          <div className="form-field">
            <span className="form-label">Topic</span>
            <input
              type="text"
              className="form-input mono"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. home/kitchen/light"
              required
            />
          </div>
        </div>

        <div className="publish-row">
          <div className="form-field">
            <span className="form-label">Payload</span>
            <textarea
              className="form-textarea"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="Payload (raw string or JSON)..."
              rows={3}
            />
          </div>
        </div>

        <div className="publish-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-field" style={{ width: 80, flex: 'none' }}>
              <span className="form-label">QoS</span>
              <select
                className="form-select"
                value={qos}
                onChange={(e) => setQos(Number(e.target.value) as 0 | 1 | 2)}
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>

            <div className="form-field" style={{ flex: 'none', justifyContent: 'center' }}>
              <span className="form-label" style={{ marginBottom: 6 }}>Retain</span>
              <div className="toggle-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={retain}
                    onChange={(e) => setRetain(e.target.checked)}
                  />
                  <span className="toggle-track" />
                  <span className="toggle-thumb" />
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-end' }}
            disabled={loading || !topic}
          >
            {loading ? 'Publishing...' : 'Publish'}
          </button>
        </div>

        {error && (
          <div className="banner banner-error" style={{ marginTop: 8 }}>
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="banner banner-success" style={{ marginTop: 8 }}>
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Message published successfully</span>
          </div>
        )}
      </form>
    </div>
  )
}
