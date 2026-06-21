import mqtt, { type MqttClient as MqttJsClient, type IClientOptions } from 'mqtt'
import type { MqttMessage } from '../types'

export interface ConnectionOptions {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  clientId: string
  username?: string
  password?: string
  useTls: boolean
  rejectUnauthorized: boolean
  /** Contenido PEM del certificado CA */
  tlsCa?: string
  /** Contenido PEM del certificado de cliente */
  tlsCert?: string
  /** Contenido PEM de la clave privada del cliente */
  tlsKey?: string
  mqttVersion: 3 | 4 | 5
  keepalive: number
  subscriptions: string[]
}

export interface MqttStatus {
  connected?: boolean
  reconnecting?: boolean
  error?: string
  url?: string
}

export type MessageCallback = (msg: MqttMessage) => void
export type StatusCallback = (status: MqttStatus) => void

/**
 * Wrapper sobre mqtt.js que funciona íntegramente en el navegador.
 *
 * En el navegador solo se pueden usar conexiones WebSocket (ws:// o wss://),
 * por lo que el protocolo MQTT nativo (tcp) no está disponible. El broker
 * debe exponer un endpoint WebSocket (por ejemplo Mosquitto con
 * `listener 9001` y `protocol websockets`).
 */
class MqttBrowserClient {
  private client: MqttJsClient | null = null
  private messageCallbacks = new Set<MessageCallback>()
  private statusCallbacks = new Set<StatusCallback>()

  connect(opts: ConnectionOptions): Promise<{ success: boolean; error?: string }> {
    // Cerrar conexión previa si existe
    if (this.client) {
      this.client.end(true)
      this.client = null
    }

    const protocol = opts.useTls ? 'wss' : 'ws'
    const url = `${protocol}://${opts.host}:${opts.port}`

    const clientOptions: IClientOptions = {
      clientId: opts.clientId || `mqtt-explorer-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      keepalive: opts.keepalive || 60,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      protocolVersion: opts.mqttVersion === 5 ? 5 : opts.mqttVersion === 3 ? 3 : 4,
    }

    if (opts.username) clientOptions.username = opts.username
    if (opts.password) clientOptions.password = opts.password

    // Certificados TLS para mTLS (mutual TLS).
    // En el navegador, mqtt.js pasa estas opciones al WebSocket subyacente.
    // Los certificados se proporcionan como contenido PEM (string) leídos
    // desde el input type="file" del diálogo de conexión.
    if (opts.useTls) {
      clientOptions.rejectUnauthorized = opts.rejectUnauthorized

      if (opts.tlsCa) {
        clientOptions.ca = opts.tlsCa
      }
      if (opts.tlsCert) {
        clientOptions.cert = opts.tlsCert
      }
      if (opts.tlsKey) {
        clientOptions.key = opts.tlsKey
      }
    }

    return new Promise((resolve) => {
      try {
        this.client = mqtt.connect(url, clientOptions)

        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Connection timeout' })
        }, 12000)

        this.client.on('connect', () => {
          clearTimeout(timeout)
          const subs = opts.subscriptions?.length ? opts.subscriptions : ['#']
          subs.forEach((sub) => this.client?.subscribe(sub, { qos: 1 }))
          this.emitStatus({ connected: true, url })
          resolve({ success: true })
        })

        this.client.on('error', (err) => {
          clearTimeout(timeout)
          this.emitStatus({ connected: false, error: err.message })
          resolve({ success: false, error: err.message })
        })

        this.client.on('close', () => {
          this.emitStatus({ connected: false })
        })

        this.client.on('reconnect', () => {
          this.emitStatus({ reconnecting: true })
        })

        this.client.on('message', (topic, payload, packet) => {
          const payloadStr = payload.toString()
          const msg: MqttMessage = {
            topic,
            payload: payloadStr,
            qos: packet.qos,
            retain: packet.retain,
            timestamp: Date.now(),
          }
          this.messageCallbacks.forEach((cb) => cb(msg))
        })
      } catch (err: unknown) {
        resolve({ success: false, error: String(err) })
      }
    })
  }

  async disconnect(): Promise<{ success: boolean }> {
    if (this.client) {
      this.client.end(true)
      this.client = null
    }
    return { success: true }
  }

  async publish(args: {
    topic: string
    payload: string
    qos: 0 | 1 | 2
    retain: boolean
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.client || !this.client.connected) {
      return { success: false, error: 'Not connected' }
    }
    return new Promise((resolve) => {
      this.client!.publish(args.topic, args.payload, { qos: args.qos, retain: args.retain }, (err) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  }

  async subscribe(args: { topic: string; qos: 0 | 1 | 2 }): Promise<{ success: boolean; error?: string }> {
    if (!this.client || !this.client.connected) {
      return { success: false, error: 'Not connected' }
    }
    return new Promise((resolve) => {
      this.client!.subscribe(args.topic, { qos: args.qos }, (err) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  }

  async unsubscribe(args: { topic: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.client || !this.client.connected) {
      return { success: false, error: 'Not connected' }
    }
    return new Promise((resolve) => {
      this.client!.unsubscribe(args.topic, (err?: Error) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  }

  async isConnected(): Promise<{ connected: boolean }> {
    return { connected: this.client?.connected ?? false }
  }

  onMessage(cb: MessageCallback): () => void {
    this.messageCallbacks.add(cb)
    return () => this.messageCallbacks.delete(cb)
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb)
    return () => this.statusCallbacks.delete(cb)
  }

  private emitStatus(status: MqttStatus) {
    this.statusCallbacks.forEach((cb) => cb(status))
  }
}

// Singleton
export const mqttBrowserClient = new MqttBrowserClient()