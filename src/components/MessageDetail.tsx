import { useState, useMemo, useEffect, useRef } from 'react'
import { useMqttStore } from '../store/mqttStore'
import { mqttBrowserClient } from '../lib/mqttClient'

// ─── JSON syntax highlighter ────────────────────────────────────────────────

function syntaxHighlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    /(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key'
        } else {
          cls = 'json-string'
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-bool'
      } else if (/null/.test(match)) {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

// ─── XML syntax highlighter ─────────────────────────────────────────────────

function syntaxHighlightXml(xml: string): string {
  return xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /(&lt;\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?&gt;|&gt;|\/&gt;)/g,
      (_m, open, tag, rest) => {
        // Highlight attribute names and values inside the rest
        const highlightedRest = rest
          .replace(/([\w:.-]+)(\s*=\s*)("([^"]*?)"|'([^']*?)')/g,
            (_a: string, attrName: string, eq: string, val: string) =>
              `<span class="xml-attr-name">${attrName}</span>${eq}<span class="xml-attr-value">${val}</span>`
          )
        return `<span class="xml-bracket">${open}</span><span class="xml-tag">${tag}</span>${highlightedRest}`
      }
    )
    .replace(/(&gt;)([^&<]+)(&lt;)/g,
      (_m, o, text, c) => `${o}<span class="xml-text">${text}</span>${c}`
    )
}

// ─── XML formatter (pretty-print) ───────────────────────────────────────────

function formatXml(xml: string): string {
  let formatted = ''
  let indent = 0
  const pad = '  '

  xml.replace(/>\s*</g, '><').split(/(<[^>]+>)/).forEach((node) => {
    if (!node.trim()) return

    if (/^<\//.test(node)) {
      indent = Math.max(0, indent - 1)
      formatted += pad.repeat(indent) + node + '\n'
    } else if (/\/>$/.test(node)) {
      formatted += pad.repeat(indent) + node + '\n'
    } else if (/^<[^?!]/.test(node) && !/^<.*\/>/.test(node)) {
      formatted += pad.repeat(indent) + node + '\n'
      indent++
    } else {
      formatted += pad.repeat(indent) + node + '\n'
    }
  })

  return formatted.trim()
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewFormat = 'json' | 'xml' | 'raw'

// ─── Format auto-detection ───────────────────────────────────────────────────

function detectFormat(payload: string): ViewFormat {
  const trimmed = payload.trim()
  if (!trimmed) return 'raw'

  // ── Try JSON ──────────────────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // not valid JSON
    }
  }

  // ── Try XML ───────────────────────────────────────────────────────────────
  // Must start with < (element or declaration) and contain at least one tag
  if (trimmed.startsWith('<')) {
    // Quick structural check: has a closing tag or self-closing tag
    const hasTag = /<[a-zA-Z][\w:.-]*[\s\S]*?>/.test(trimmed)
    const hasClose = /<\/[a-zA-Z][\w:.-]*>/.test(trimmed) || /\/\s*>/.test(trimmed)
    if (hasTag && hasClose) {
      return 'xml'
    }
  }

  return 'raw'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MessageDetail() {
  const { selectedTopic, topicTree } = useMqttStore()
  const [copied, setCopied] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [format, setFormat] = useState<ViewFormat>('json')
  // Track the last payload we auto-detected so we only re-detect on actual changes
  const lastAutoPayload = useRef<string | null>(null)

  // Find the node in the tree to get the latest message details
  const node = useMemo(() => {
    if (!selectedTopic) return null
    const parts = selectedTopic.split('/')
    let current = topicTree
    let foundNode = null
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const n = current.get(part)
      if (!n) break
      if (i === parts.length - 1) {
        foundNode = n
      }
      current = n.children
    }
    return foundNode
  }, [selectedTopic, topicTree])

  const msg = node?.latestMessage

  // Auto-detect format whenever a new (different) payload arrives
  useEffect(() => {
    if (!msg) return
    if (msg.payload === lastAutoPayload.current) return  // same payload, keep user's choice
    lastAutoPayload.current = msg.payload
    setFormat(detectFormat(msg.payload))
  }, [msg?.payload])

  const formattedPayload = useMemo(() => {
    if (!msg) return { html: '', plain: '', canJson: false, canXml: false }
    const trimmed = msg.payload.trim()

    const canJson = trimmed.startsWith('{') || trimmed.startsWith('[')
    const canXml  = trimmed.startsWith('<')

    if (format === 'json' && canJson) {
      try {
        const parsed = JSON.parse(trimmed)
        const pretty = JSON.stringify(parsed, null, 2)
        return { html: syntaxHighlightJson(pretty), plain: pretty, canJson, canXml }
      } catch {
        // fall through to raw
      }
    }

    if (format === 'xml' && canXml) {
      try {
        const pretty = formatXml(trimmed)
        return { html: syntaxHighlightXml(pretty), plain: pretty, canJson, canXml }
      } catch {
        // fall through to raw
      }
    }

    // RAW (or fallback)
    const escaped = msg.payload
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return { html: escaped, plain: msg.payload, canJson, canXml }
  }, [msg, format])

  const copyToClipboard = () => {
    if (!msg) return
    navigator.clipboard.writeText(formattedPayload.plain).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const clearRetained = async () => {
    if (!selectedTopic) return
    setClearing(true)
    try {
      await mqttBrowserClient.publish({
        topic: selectedTopic,
        payload: '',
        qos: 0,
        retain: true
      })
    } catch (err) {
      console.error('Failed to clear retained message:', err)
    } finally {
      setClearing(false)
    }
  }

  if (!selectedTopic) return null

  return (
    <div className="message-detail-container flex-col">
      {/* Panel Header */}
      <div className="panel-header">
        <span className="panel-title">{selectedTopic}</span>
        {msg && (
          <div className="panel-meta">
            <span className="badge badge-qos">QoS {msg.qos}</span>
            {msg.retain && <span className="badge badge-retain">Retained</span>}
          </div>
        )}
      </div>

      {/* Message Detail Card */}
      <div className="message-detail">
        {msg ? (
          <>
            <div className="message-detail-meta">
              <div className="meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="meta-label">Time:</span>
                <span>{new Date(msg.timestamp).toLocaleString()}</span>
              </div>

              {/* Format selector */}
              <div className="format-selector" role="group" aria-label="View format">
                {(['json', 'xml', 'raw'] as ViewFormat[]).map((f) => (
                  <button
                    key={f}
                    className={`format-btn${format === f ? ' format-btn--active' : ''}`}
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>

              {msg.retain && (
                <button
                  className="btn btn-outline btn-sm btn-danger"
                  style={{ marginLeft: 8 }}
                  onClick={clearRetained}
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Clear Retained'}
                </button>
              )}
            </div>

            <div className="payload-box-wrapper" style={{ position: 'relative' }}>
              <pre
                className="payload-box"
                dangerouslySetInnerHTML={{ __html: formattedPayload.html }}
              />

              <button
                className="btn btn-outline btn-sm payload-copy-btn"
                onClick={copyToClipboard}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
            No messages received yet for this topic.
          </div>
        )}
      </div>
    </div>
  )
}
