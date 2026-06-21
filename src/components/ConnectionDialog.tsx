import React, { useState, useEffect } from 'react'
import { useProfileStore } from '../store/profileStore'
import { useMqttStore } from '../store/mqttStore'
import { mqttBrowserClient } from '../lib/mqttClient'
import type { ConnectionProfile } from '../types'

interface ConnectionDialogProps {
  onClose: () => void
}

const emptyProfile = (): ConnectionProfile => ({
  id: '',
  name: 'New Connection',
  host: 'broker.hivemq.com',
  port: 8884,
  protocol: 'wss',
  clientId: '',
  username: '',
  password: '',
  useTls: true,
  rejectUnauthorized: true,
  mqttVersion: 4,
  keepalive: 60,
  subscriptions: ['#']
})

export default function ConnectionDialog({ onClose }: ConnectionDialogProps) {
  const { profiles, saveProfile, deleteProfile, activeProfileId, setActive } = useProfileStore()
  const { setStatus, clearAll } = useMqttStore()

  const [selectedProfile, setSelectedProfile] = useState<ConnectionProfile>(emptyProfile())
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Load active or first profile on mount
  useEffect(() => {
    if (activeProfileId) {
      const active = profiles.find(p => p.id === activeProfileId)
      if (active) {
        setSelectedProfile({ ...active })
        return
      }
    }
    if (profiles.length > 0) {
      setSelectedProfile({ ...profiles[0] })
      setActive(profiles[0].id)
    } else {
      const newP = emptyProfile()
      newP.id = `profile-${Date.now()}`
      setSelectedProfile(newP)
    }
  }, [activeProfileId, profiles, setActive])

  const handleProtocolChange = (proto: 'ws' | 'wss') => {
    const isTls = proto === 'wss'
    let port = selectedProfile.port
    if (proto === 'ws') port = 8080
    else if (proto === 'wss') port = 8443

    setSelectedProfile(prev => ({
      ...prev,
      protocol: proto,
      useTls: isTls,
      port
    }))
  }

  const handleAddSubscription = () => {
    setSelectedProfile(prev => ({
      ...prev,
      subscriptions: [...prev.subscriptions, '#']
    }))
  }

  const handleSubChange = (idx: number, val: string) => {
    setSelectedProfile(prev => {
      const subs = [...prev.subscriptions]
      subs[idx] = val
      return { ...prev, subscriptions: subs }
    })
  }

  const handleRemoveSub = (idx: number) => {
    setSelectedProfile(prev => {
      const subs = prev.subscriptions.filter((_, i) => i !== idx)
      return { ...prev, subscriptions: subs.length ? subs : ['#'] }
    })
  }

  /** Devuelve el badge de formato según la extensión del fichero */
  function certFormatBadge(filePath: string | undefined): string | null {
    if (!filePath) return null
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (ext === 'pem') return 'PEM'
    if (ext === 'crt' || ext === 'cer') return 'CRT'
    if (ext === 'key') return 'KEY'
    return ext?.toUpperCase() ?? '?'
  }

  /** Devuelve solo el nombre del fichero (sin ruta) */
  function basename(filePath: string | undefined): string {
    if (!filePath) return ''
    return filePath.split(/[\\/]/).pop() ?? filePath
  }

  /**
   * Lee un fichero seleccionado por el usuario y devuelve su contenido como string.
   * Detecta si el fichero está en formato PEM (texto) o DER (binario) y,
   * en este último caso, lo convierte a PEM usando la API Web Crypto.
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          // El fichero es texto — probablemente ya está en formato PEM
          resolve(result.trim())
        } else if (result instanceof ArrayBuffer) {
          // El fichero es binario (DER) — intentar convertir a PEM
          const bytes = new Uint8Array(result)
          const pem = derToPem(bytes)
          resolve(pem)
        } else {
          reject(new Error('No se pudo leer el fichero'))
        }
      }
      reader.onerror = () => reject(reader.error ?? new Error('Error leyendo fichero'))
      // Intentar leer como texto primero; si falla, leer como ArrayBuffer
      reader.readAsText(file)
    })
  }

  /** Convierte un buffer DER (binario) a formato PEM */
  function derToPem(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let base64 = ''
    for (let i = 0; i < bytes.length; i += 3) {
      const b1 = bytes[i]
      const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0
      const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0
      base64 += chars[b1 >> 2]
      base64 += chars[((b1 & 0x03) << 4) | (b2 >> 4)]
      base64 += i + 1 < bytes.length ? chars[((b2 & 0x0f) << 2) | (b3 >> 6)] : '='
      base64 += i + 2 < bytes.length ? chars[b3 & 0x3f] : '='
    }
    // Dividir en líneas de 64 caracteres
    const lines = base64.match(/.{1,64}/g) ?? []
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
  }

  /**
   * Valida que el contenido PEM tenga el tipo correcto de bloque.
   * - CA y CRT: deben contener "CERTIFICATE"
   * - KEY: debe contener "PRIVATE KEY"
   */
  function validatePemContent(content: string, expectedType: 'certificate' | 'key'): { valid: boolean; error?: string } {
    if (expectedType === 'certificate') {
      if (!/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/.test(content)) {
        return { valid: false, error: 'El fichero no contiene un certificado PEM válido (falta bloque CERTIFICATE)' }
      }
    } else {
      if (!/-----BEGIN ([A-Z ]*PRIVATE KEY[A-Z ]*)-----[\s\S]*?-----END \1-----/.test(content)) {
        return { valid: false, error: 'El fichero no contiene una clave privada PEM válida (falta bloque PRIVATE KEY)' }
      }
    }
    return { valid: true }
  }

  /** Abre el diálogo nativo del navegador para seleccionar un fichero de certificado */
  const handleSelectCertFile = (field: 'tlsCa' | 'tlsCert' | 'tlsKey', nameField: 'tlsCaName' | 'tlsCertName' | 'tlsKeyName', title: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.title = title
    input.accept = '.pem,.crt,.cer,.key,text/plain,application/x-pem-file'

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      try {
        const content = await readFileAsText(file)
        const expectedType: 'certificate' | 'key' = field === 'tlsKey' ? 'key' : 'certificate'
        const validation = validatePemContent(content, expectedType)
        if (!validation.valid) {
          setError(validation.error ?? 'Fichero de certificado inválido')
          return
        }

        setError(null)
        setSelectedProfile(prev => ({
          ...prev,
          [field]: content,
          [nameField]: file.name
        }))
      } catch (err: unknown) {
        setError(`Error al leer el fichero: ${String(err)}`)
      }
    }

    input.click()
  }

  const handleSave = () => {
    saveProfile(selectedProfile)
    setActive(selectedProfile.id)
  }

  const handleCreateNew = () => {
    const newP = emptyProfile()
    newP.id = `profile-${Date.now()}`
    setSelectedProfile(newP)
    setActive(null)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteProfile(id)
    if (activeProfileId === id) {
      setActive(null)
    }
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setConnecting(true)
    setError(null)

    // Save the profile before connecting
    saveProfile(selectedProfile)
    setActive(selectedProfile.id)

    // Clear state in preparation for new messages
    clearAll()
    setStatus({ status: 'connecting' })

    try {
      const connOpts = {
        host: selectedProfile.host,
        port: Number(selectedProfile.port),
        protocol: selectedProfile.protocol,
        clientId: selectedProfile.clientId,
        username: selectedProfile.username || undefined,
        password: selectedProfile.password || undefined,
        useTls: selectedProfile.useTls,
        rejectUnauthorized: selectedProfile.rejectUnauthorized,
        tlsCa: selectedProfile.tlsCa || undefined,
        tlsCert: selectedProfile.tlsCert || undefined,
        tlsKey: selectedProfile.tlsKey || undefined,
        mqttVersion: Number(selectedProfile.mqttVersion) as 3 | 5,
        keepalive: Number(selectedProfile.keepalive) || 60,
        subscriptions: selectedProfile.subscriptions
      }

      const res = await mqttBrowserClient.connect(connOpts)
      if (res.success) {
        onClose()
      } else {
        setError(res.error ?? 'Failed to connect')
        setStatus({ status: 'error', error: res.error })
      }
    } catch (err: unknown) {
      setError(String(err))
      setStatus({ status: 'error', error: String(err) })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <span className="dialog-title">Connect to Broker</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="dialog-body">
          {/* Profiles list */}
          <div className="dialog-profiles">
            <div className="dialog-profiles-title">Saved Connections</div>
            {profiles.map(p => (
              <div
                key={p.id}
                className={`profile-item ${selectedProfile.id === p.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedProfile({ ...p })
                  setActive(p.id)
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="profile-name">{p.name}</div>
                  <div className="profile-host">{p.host}</div>
                </div>
                <span className="profile-delete" onClick={(e) => handleDelete(p.id, e)}>
                  <svg style={{ width: 12, height: 12 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </span>
              </div>
            ))}
            <button
              className="btn btn-outline btn-sm"
              style={{ width: '100%', marginTop: 8 }}
              onClick={handleCreateNew}
            >
              + New Profile
            </button>
          </div>

          {/* Form */}
          <form className="dialog-form" onSubmit={handleConnect}>
            <div className="form-row">
              <div className="form-field">
                <span className="form-label">Profile Name</span>
                <input
                  type="text"
                  className="form-input"
                  value={selectedProfile.name}
                  onChange={e => setSelectedProfile({ ...selectedProfile, name: e.target.value })}
                  placeholder="e.g. Local Mosquitto"
                  required
                />
              </div>
            </div>

            <div className="form-row form-row-3">
              <div className="form-field">
                <span className="form-label">Host</span>
                <input
                  type="text"
                  className="form-input mono"
                  value={selectedProfile.host}
                  onChange={e => setSelectedProfile({ ...selectedProfile, host: e.target.value })}
                  placeholder="broker.hivemq.com"
                  required
                />
              </div>
              <div className="form-field">
                <span className="form-label">Protocol</span>
                <select
                  className="form-select"
                  value={selectedProfile.protocol}
                  onChange={e => handleProtocolChange(e.target.value as 'ws' | 'wss')}
                >
                  <option value="ws">ws://</option>
                  <option value="wss">wss://</option>
                </select>
              </div>
              <div className="form-field">
                <span className="form-label">Port</span>
                <input
                  type="number"
                  className="form-input mono"
                  value={selectedProfile.port}
                  onChange={e => setSelectedProfile({ ...selectedProfile, port: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-field">
                <span className="form-label">Username</span>
                <input
                  type="text"
                  className="form-input"
                  value={selectedProfile.username}
                  onChange={e => setSelectedProfile({ ...selectedProfile, username: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="form-field">
                <span className="form-label">Password</span>
                <input
                  type="password"
                  className="form-input"
                  value={selectedProfile.password}
                  onChange={e => setSelectedProfile({ ...selectedProfile, password: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-field">
                <span className="form-label">Client ID</span>
                <input
                  type="text"
                  className="form-input mono"
                  value={selectedProfile.clientId}
                  onChange={e => setSelectedProfile({ ...selectedProfile, clientId: e.target.value })}
                  placeholder="auto-generated"
                />
              </div>
              <div className="form-field">
                <span className="form-label">MQTT Version</span>
                <select
                  className="form-select"
                  value={selectedProfile.mqttVersion}
                  onChange={e => setSelectedProfile({ ...selectedProfile, mqttVersion: Number(e.target.value) as 3 | 4 | 5 })}
                >
                  <option value={4}>v3.1.1</option>
                  <option value={5}>v5.0</option>
                </select>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-field">
                <span className="form-label">Keep Alive (s)</span>
                <input
                  type="number"
                  className="form-input mono"
                  value={selectedProfile.keepalive}
                  onChange={e => setSelectedProfile({ ...selectedProfile, keepalive: Number(e.target.value) })}
                />
              </div>
              <div className="form-field" style={{ justifyContent: 'center' }}>
                <span className="form-label" style={{ marginBottom: 4 }}>TLS: Reject Unauthorized</span>
                <div className="toggle-row">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={selectedProfile.rejectUnauthorized}
                      disabled={!selectedProfile.useTls}
                      onChange={e => setSelectedProfile({ ...selectedProfile, rejectUnauthorized: e.target.checked })}
                    />
                    <span className="toggle-track" />
                    <span className="toggle-thumb" />
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {selectedProfile.useTls ? 'Enable CA validation' : 'Not TLS'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Sección TLS / Certificados ── solo visible cuando useTls está activo */}
            {selectedProfile.useTls && (
              <>
                <div className="tls-section-header">
                  <svg style={{ width: 13, height: 13 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>TLS / Client Certificates</span>
                </div>

                {/* CA Certificate */}
                <div className="form-field">
                  <span className="form-label">CA Certificate</span>
                  <div className="cert-picker">
                    <div className="cert-picker-info">
                      {selectedProfile.tlsCaName ? (
                        <>
                          <span className="cert-badge">{certFormatBadge(selectedProfile.tlsCaName)}</span>
                          <span className="cert-filename mono">{basename(selectedProfile.tlsCaName)}</span>
                        </>
                      ) : (
                        <span className="cert-placeholder">No file selected (.pem / .crt)</span>
                      )}
                    </div>
                    <div className="cert-picker-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleSelectCertFile('tlsCa', 'tlsCaName', 'Select CA Certificate')}
                      >
                        Browse…
                      </button>
                      {selectedProfile.tlsCaName && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          onClick={() => setSelectedProfile(p => ({ ...p, tlsCa: undefined, tlsCaName: undefined }))}
                          title="Clear"
                        >
                          <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Client Certificate */}
                <div className="form-field">
                  <span className="form-label">Client Certificate</span>
                  <div className="cert-picker">
                    <div className="cert-picker-info">
                      {selectedProfile.tlsCertName ? (
                        <>
                          <span className="cert-badge">{certFormatBadge(selectedProfile.tlsCertName)}</span>
                          <span className="cert-filename mono">{basename(selectedProfile.tlsCertName)}</span>
                        </>
                      ) : (
                        <span className="cert-placeholder">No file selected (.pem / .crt)</span>
                      )}
                    </div>
                    <div className="cert-picker-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleSelectCertFile('tlsCert', 'tlsCertName', 'Select Client Certificate')}
                      >
                        Browse…
                      </button>
                      {selectedProfile.tlsCertName && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          onClick={() => setSelectedProfile(p => ({ ...p, tlsCert: undefined, tlsCertName: undefined }))}
                          title="Clear"
                        >
                          <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Client Key */}
                <div className="form-field">
                  <span className="form-label">Client Key</span>
                  <div className="cert-picker">
                    <div className="cert-picker-info">
                      {selectedProfile.tlsKeyName ? (
                        <>
                          <span className="cert-badge">{certFormatBadge(selectedProfile.tlsKeyName)}</span>
                          <span className="cert-filename mono">{basename(selectedProfile.tlsKeyName)}</span>
                        </>
                      ) : (
                        <span className="cert-placeholder">No file selected (.key / .pem)</span>
                      )}
                    </div>
                    <div className="cert-picker-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleSelectCertFile('tlsKey', 'tlsKeyName', 'Select Client Key')}
                      >
                        Browse…
                      </button>
                      {selectedProfile.tlsKeyName && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          onClick={() => setSelectedProfile(p => ({ ...p, tlsKey: undefined, tlsKeyName: undefined }))}
                          title="Clear"
                        >
                          <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Info banner about WebSocket */}
            <div className="banner banner-info" style={{ marginTop: 8 }}>
              <svg style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>El navegador solo soporta conexiones WebSocket (ws:// o wss://). El broker debe tener un endpoint WebSocket habilitado. Los certificados de cliente se cargan en memoria y no se persistan.</span>
            </div>

            <div className="divider" />

            <div className="form-field">
              <span className="form-label">Subscriptions</span>
              <div className="subs-list">
                {selectedProfile.subscriptions.map((sub, idx) => (
                  <div key={idx} className="subs-item">
                    <input
                      type="text"
                      className="form-input mono"
                      value={sub}
                      onChange={e => handleSubChange(idx, e.target.value)}
                      placeholder="#"
                      required
                    />
                    {selectedProfile.subscriptions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-outline btn-icon"
                        onClick={() => handleRemoveSub(idx)}
                      >
                        <svg style={{ width: 12, height: 12 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="subs-add-btn"
                  onClick={handleAddSubscription}
                >
                  + Add Topic Subscription
                </button>
              </div>
            </div>

            {error && (
              <div className="banner banner-error">
                <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>

        <div className="dialog-footer">
          <div className="dialog-footer-left">
            <button className="btn btn-outline" onClick={handleSave}>
              Save
            </button>
          </div>
          <div className="dialog-footer-right">
            <button className="btn btn-outline" onClick={onClose} disabled={connecting}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}