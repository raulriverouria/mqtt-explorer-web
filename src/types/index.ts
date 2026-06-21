export interface ConnectionProfile {
  id: string
  name: string
  host: string
  port: number
  protocol: 'ws' | 'wss'
  clientId: string
  username: string
  password: string
  useTls: boolean
  rejectUnauthorized: boolean
  /** Contenido PEM del certificado CA (en memoria, no se persiste) */
  tlsCa?: string
  /** Nombre del fichero CA seleccionado */
  tlsCaName?: string
  /** Contenido PEM del certificado de cliente (en memoria, no se persiste) */
  tlsCert?: string
  /** Nombre del fichero CRT seleccionado */
  tlsCertName?: string
  /** Contenido PEM de la clave privada (en memoria, no se persiste) */
  tlsKey?: string
  /** Nombre del fichero KEY seleccionado */
  tlsKeyName?: string
  mqttVersion: 3 | 4 | 5
  keepalive: number
  subscriptions: string[]
}

export interface MqttMessage {
  topic: string
  payload: string
  qos: number
  retain: boolean
  timestamp: number
}

export interface TopicNode {
  name: string          // just the segment, e.g. "temperature"
  fullPath: string      // full topic path, e.g. "home/kitchen/temperature"
  children: Map<string, TopicNode>
  latestMessage?: MqttMessage
  messageCount: number
  isExpanded: boolean
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface StatusInfo {
  status: ConnectionStatus
  brokerUrl: string
  error?: string
}
