import { create } from 'zustand'
import type { TopicNode, MqttMessage, ConnectionStatus, StatusInfo } from '../types'

const MAX_HISTORY = 200

function ensureNode(root: Map<string, TopicNode>, fullPath: string): { node: TopicNode; newNodesCount: number } {
  const parts = fullPath.split('/')
  let current = root
  let node: TopicNode | undefined
  let path = ''
  let newNodesCount = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    path = i === 0 ? part : `${path}/${part}`
    if (!current.has(part)) {
      current.set(part, {
        name: part,
        fullPath: path,
        children: new Map(),
        messageCount: 0,
        isExpanded: false
      })
      newNodesCount++
    }
    node = current.get(part)!
    node.messageCount += 1 // Sum count of all messages received in this node's branch
    current = node.children
  }
  return { node: node!, newNodesCount }
}

interface MqttStore {
  // Connection state
  statusInfo: StatusInfo
  brokerUrl: string

  // Topic tree
  topicTree: Map<string, TopicNode>

  // Selected topic
  selectedTopic: string | null

  // Message history per topic
  messageHistory: Map<string, MqttMessage[]>

  // Stats
  totalTopics: number
  totalMessages: number
  messagesPerSecond: number
  _msgCountBuffer: number
  _lastSecond: number

  // Filter
  filterText: string

  // Actions
  setStatus: (info: Partial<StatusInfo>) => void
  addMessage: (msg: MqttMessage) => void
  selectTopic: (path: string | null) => void
  toggleExpand: (path: string) => void
  clearTopic: (path: string) => void
  clearAll: () => void
  resetCounts: () => void
  setFilter: (text: string) => void
}

export const useMqttStore = create<MqttStore>((set, get) => ({
  statusInfo: { status: 'disconnected', brokerUrl: '' },
  brokerUrl: '',
  topicTree: new Map(),
  selectedTopic: null,
  messageHistory: new Map(),
  totalTopics: 0,
  totalMessages: 0,
  messagesPerSecond: 0,
  _msgCountBuffer: 0,
  _lastSecond: Date.now(),
  filterText: '',

  setStatus: (info) => {
    set((state) => ({
      statusInfo: { ...state.statusInfo, ...info }
    }))
  },

  addMessage: (msg) => {
    set((state) => {
      // Clone maps for reactivity
      const newTree = new Map(state.topicTree)
      const { node, newNodesCount } = ensureNode(newTree, msg.topic)
      node.latestMessage = msg

      const newHistory = new Map(state.messageHistory)
      const existing = newHistory.get(msg.topic) ?? []
      const updated = [msg, ...existing].slice(0, MAX_HISTORY)
      newHistory.set(msg.topic, updated)

      // Messages per second tracking
      const now = Date.now()
      const elapsed = now - state._lastSecond
      let mps = state.messagesPerSecond
      let buf = state._msgCountBuffer + 1
      let lastSec = state._lastSecond
      if (elapsed >= 1000) {
        mps = Math.round(buf / (elapsed / 1000))
        buf = 0
        lastSec = now
      }

      return {
        topicTree: newTree,
        messageHistory: newHistory,
        totalTopics: state.totalTopics + newNodesCount,
        totalMessages: state.totalMessages + 1,
        messagesPerSecond: mps,
        _msgCountBuffer: buf,
        _lastSecond: lastSec
      }
    })
  },

  selectTopic: (path) => set({ selectedTopic: path }),

  toggleExpand: (path) => {
    set((state) => {
      const newTree = new Map(state.topicTree)
      const parts = path.split('/')
      let current = newTree
      for (let i = 0; i < parts.length; i++) {
        const node = current.get(parts[i])
        if (!node) break
        if (i === parts.length - 1) {
          node.isExpanded = !node.isExpanded
        }
        current = node.children
      }
      return { topicTree: newTree }
    })
  },

  clearTopic: (path) => {
    set((state) => {
      const newHistory = new Map(state.messageHistory)
      newHistory.delete(path)
      return { messageHistory: newHistory }
    })
  },

  clearAll: () => {
    set({
      topicTree: new Map(),
      messageHistory: new Map(),
      selectedTopic: null,
      totalTopics: 0,
      totalMessages: 0,
      messagesPerSecond: 0
    })
  },

  resetCounts: () => {
    set((state) => {
      // Recursively reset messageCount on all nodes without touching structure
      function zeroNode(node: TopicNode) {
        node.messageCount = 0
        for (const child of node.children.values()) {
          zeroNode(child)
        }
      }
      const newTree = new Map(state.topicTree)
      for (const node of newTree.values()) {
        zeroNode(node)
      }
      return { topicTree: newTree, totalMessages: 0, messagesPerSecond: 0, _msgCountBuffer: 0 }
    })
  },

  setFilter: (text) => set({ filterText: text })
}))
