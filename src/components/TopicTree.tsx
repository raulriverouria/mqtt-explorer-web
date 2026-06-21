import { useMqttStore } from '../store/mqttStore'
import type { TopicNode } from '../types'

interface TreeNodeProps {
  node: TopicNode
  depth: number
}

/** Cuenta recursivamente el total de topics hijos directos e indirectos */
function countDescendantTopics(node: TopicNode): number {
  let count = 0
  for (const child of node.children.values()) {
    count += 1 + countDescendantTopics(child)
  }
  return count
}


function TreeNodeComponent({ node, depth }: TreeNodeProps) {
  const { selectedTopic, selectTopic, toggleExpand, filterText } = useMqttStore()

  const hasChildren = node.children.size > 0
  const isSelected = selectedTopic === node.fullPath

  // Filter and sort children
  const visibleChildren = Array.from(node.children.values())
    .filter(child => {
      if (!filterText) return true
      return matchesFilter(child, filterText)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const isExpanded = filterText ? true : node.isExpanded
  const hasVisibleChildren = visibleChildren.length > 0

  // Stats for badges
  // node.messageCount holds the accumulated total for the whole subtree
  // (ensureNode increments every ancestor on each incoming message),
  // including messages received directly by this node itself.
  const childTopicCount = hasChildren ? countDescendantTopics(node) : 0
  const subtreeMessageCount = node.messageCount

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectTopic(node.fullPath)
  }

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleExpand(node.fullPath)
  }

  // Determine short value string to show in tree row
  let shortValue = ''
  if (node.latestMessage) {
    const payload = node.latestMessage.payload
    if (payload.trim().startsWith('{') || payload.trim().startsWith('[')) {
      try {
        const obj = JSON.parse(payload)
        shortValue = JSON.stringify(obj)
      } catch {
        shortValue = payload
      }
    } else {
      shortValue = payload
    }
    if (shortValue.length > 30) {
      shortValue = shortValue.slice(0, 30) + '...'
    }
  }

  return (
    <div className="tree-node" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''}`}
        onClick={handleRowClick}
      >
        <span
          className={`tree-node-toggle ${!hasChildren ? 'leaf' : isExpanded ? 'expanded' : ''}`}
          onClick={handleToggleClick}
        >
          <svg style={{ width: 10, height: 10 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>

        <span className="tree-node-icon">
          {hasChildren ? (
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
        </span>

        <span className="tree-node-name">{node.name}</span>
        {shortValue && <span className="tree-node-value">{shortValue}</span>}

        {/* Badges: two for nodes with children, one for leaves */}
        {hasChildren ? (
          <span className="tree-node-badges">
            <span className="tree-node-badge tree-node-badge-topics" title="Descendant topics">
              {childTopicCount}
            </span>
            <span className="tree-node-badge tree-node-badge-msgs" title="Total messages in subtree">
              {subtreeMessageCount}
            </span>
          </span>
        ) : (
          <span className="tree-node-badge" title="Messages received">
            {node.messageCount}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && hasVisibleChildren && (
        <div className="tree-children">
          {visibleChildren.map((child) => (
            <TreeNodeComponent key={child.fullPath} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function matchesFilter(node: TopicNode, filter: string): boolean {
  if (!filter) return true
  if (node.fullPath.toLowerCase().includes(filter.toLowerCase())) return true
  for (const child of node.children.values()) {
    if (matchesFilter(child, filter)) return true
  }
  return false
}

export default function TopicTree() {
  const { topicTree, filterText, resetCounts } = useMqttStore()

  // Filter and sort top level nodes
  const rootNodes = Array.from(topicTree.values())
    .filter(node => {
      if (!filterText) return true
      return matchesFilter(node, filterText)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const hasTopics = rootNodes.length > 0

  return (
    <div className="topic-tree-wrapper">
      {/* Reset button in tree header */}
      {hasTopics && (
        <div className="tree-stats-bar">
          <button
            className="tree-reset-btn"
            onClick={resetCounts}
            title="Reset all message counters"
          >
            <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
            </svg>
            Reset counters
          </button>
        </div>
      )}

      {hasTopics ? (
        <div className="topic-tree">
          {rootNodes.map((node) => (
            <TreeNodeComponent key={node.fullPath} node={node} depth={0} />
          ))}
        </div>
      ) : (
        <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          No topics match the filter.
        </div>
      )}
    </div>
  )
}
