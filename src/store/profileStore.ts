import { create } from 'zustand'
import type { ConnectionProfile } from '../types'

const STORAGE_KEY = 'mqtt-explorer-profiles'

function loadProfiles(): ConnectionProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultProfiles()
  } catch {
    return defaultProfiles()
  }
}

function defaultProfiles(): ConnectionProfile[] {
  return [
    {
      id: 'mosquitto-test',
      name: 'Mosquitto Test Broker (WebSocket)',
      host: 'test.mosquitto.org',
      port: 8081,
      protocol: 'wss',
      clientId: '',
      username: '',
      password: '',
      useTls: true,
      rejectUnauthorized: true,
      mqttVersion: 4,
      keepalive: 60,
      subscriptions: ['#']
    },
    {
      id: 'hivemq-public',
      name: 'HiveMQ Public Broker (WebSocket)',
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
    },
    {
      id: 'emqx-public',
      name: 'EMQX Public Broker (WebSocket)',
      host: 'broker.emqx.io',
      port: 8084,
      protocol: 'wss',
      clientId: '',
      username: '',
      password: '',
      useTls: true,
      rejectUnauthorized: true,
      mqttVersion: 4,
      keepalive: 60,
      subscriptions: ['#']
    }
  ]
}

interface ProfileStore {
  profiles: ConnectionProfile[]
  activeProfileId: string | null
  saveProfile: (profile: ConnectionProfile) => void
  deleteProfile: (id: string) => void
  setActive: (id: string | null) => void
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles: loadProfiles(),
  activeProfileId: null,

  saveProfile: (profile) => {
    const profiles = get().profiles
    const idx = profiles.findIndex(p => p.id === profile.id)

    // No persistir el contenido PEM de los certificados en localStorage por seguridad.
    // Solo se guardan los nombres de fichero para referencia visual.
    const profileToPersist: ConnectionProfile = {
      ...profile,
      tlsCa: undefined,
      tlsCert: undefined,
      tlsKey: undefined,
    }

    let updated: ConnectionProfile[]
    if (idx >= 0) {
      updated = [...profiles]
      // Preservar los certificados en memoria si ya estaban cargados
      updated[idx] = { ...profileToPersist, tlsCa: profile.tlsCa, tlsCert: profile.tlsCert, tlsKey: profile.tlsKey }
    } else {
      updated = [...profiles, { ...profileToPersist, tlsCa: profile.tlsCa, tlsCert: profile.tlsCert, tlsKey: profile.tlsKey }]
    }

    // Persistir sin el contenido PEM de los certificados
    const persistable = updated.map(p => ({
      ...p,
      tlsCa: undefined,
      tlsCert: undefined,
      tlsKey: undefined,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
    set({ profiles: updated })
  },

  deleteProfile: (id) => {
    const updated = get().profiles.filter(p => p.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    set({ profiles: updated })
  },

  setActive: (id) => set({ activeProfileId: id })
}))
