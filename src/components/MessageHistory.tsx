import { useMqttStore } from '../store/mqttStore'

interface DiffPart {
  type: 'added' | 'removed' | 'unchanged'
  value: string
}

function diffStrings(oldStr: string, newStr: string): DiffPart[] {
  // Tokenize by words, spaces, symbols to keep it fast and highly readable
  const oldTokens = oldStr.match(/(\w+|[^\w\s]|\s+)/g) || []
  const newTokens = newStr.match(/(\w+|[^\w\s]|\s+)/g) || []

  const dp: number[][] = Array(oldTokens.length + 1)
    .fill(0)
    .map(() => Array(newTokens.length + 1).fill(0))

  for (let i = 1; i <= oldTokens.length; i++) {
    for (let j = 1; j <= newTokens.length; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result: DiffPart[] = []
  let i = oldTokens.length
  let j = newTokens.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldTokens[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newTokens[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', value: oldTokens[i - 1] })
      i--
    }
  }

  // Merge consecutive parts of same type
  const merged: DiffPart[] = []
  for (const part of result) {
    const last = merged[merged.length - 1]
    if (last && last.type === part.type) {
      last.value += part.value
    } else {
      merged.push(part)
    }
  }

  return merged
}

export default function MessageHistory() {
  const { selectedTopic, messageHistory, clearTopic } = useMqttStore()

  if (!selectedTopic) return null

  const history = messageHistory.get(selectedTopic) ?? []

  const handleClear = () => {
    clearTopic(selectedTopic)
  }

  return (
    <div className="history-section">
      <div className="history-header">
        <span className="section-title">History ({history.length})</span>
        {history.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={handleClear}>
            <svg style={{ width: 12, height: 12, marginRight: 4 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            Clear
          </button>
        )}
      </div>

      <div className="history-scroll">
        {history.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
            No history available for this topic.
          </div>
        ) : (
          history.map((msg, index) => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString()
            const prevMsg = history[index + 1]

            let content: React.ReactNode
            if (prevMsg && prevMsg.payload !== msg.payload) {
              const diffs = diffStrings(prevMsg.payload, msg.payload)
              content = (
                <>
                  {diffs.map((part, pIdx) => {
                    if (part.type === 'added') {
                      return <span key={pIdx} className="diff-added">{part.value}</span>
                    } else if (part.type === 'removed') {
                      return <span key={pIdx} className="diff-removed">{part.value}</span>
                    } else {
                      return part.value
                    }
                  })}
                </>
              )
            } else {
              content = msg.payload
            }

            return (
              <div key={index} className="history-item">
                <span className="history-time">{timeStr}</span>
                {msg.retain && <span className="history-retain-dot" title="Retained Message" />}
                <span className="history-payload">{content}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
