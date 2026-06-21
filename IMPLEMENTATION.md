# IMPLEMENTATION.md — MQTT Explorer Web

Documentación técnica completa del desarrollo: arquitectura, componentes, flujo de datos y funcionamiento de la aplicación.

---

## 1. Visión general

**MQTT Explorer Web** es un cliente MQTT estructurado que funciona íntegramente en el navegador. No hay backend, ni proceso de Node.js en tiempo de ejecución, ni Electron: todo el código se ejecuta en el cliente y se sirve como archivos estáticos desde NGINX (o cualquier servidor web).

La aplicación se conecta directamente al broker MQTT mediante **WebSocket** (`ws://` o `wss://`), ya que los navegadores no pueden abrir sockets TCP directos. La librería `mqtt.js` soporta WebSocket nativamente, por lo que toda la lógica MQTT —conexión, suscripción, publicación, recepción de mensajes— ocurre en el navegador.

### Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Navegador (cliente)                    │
│                                                          │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │  React UI  │──▶│  Zustand     │──▶│  mqttClient   │  │
│  │ Componentes│◀──│   Stores     │◀──│  (mqtt.js)    │  │
│  └────────────┘   └──────────────┘   └───────┬───────┘  │
│                                                │         │
└────────────────────────────────────────────────┼─────────┘
                                                 │ WebSocket
                                                 │ (ws/wss)
                                                 ▼
                                    ┌────────────────────────┐
                                    │   Broker MQTT          │
                                    │   (Mosquitto, HiveMQ,  │
                                    │    EMQX, etc.)         │
                                    └────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Servidor NGINX (solo estático)               │
│                                                           │
│   Sirve dist/index.html + assets (JS, CSS, fuentes)      │
│   No procesa lógica de aplicación                        │
└─────────────────────────────────────────────────────────┘
```

### Stack tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| UI Framework | React 18 | Renderizado de componentes |
| Build tool | Vite 8 | Bundling, HMR, build de producción |
| Lenguaje | TypeScript 5 | Tipado estático |
| MQTT | mqtt.js 5 | Cliente MQTT sobre WebSocket |
| Estado global | Zustand 4 | Stores reactivos |
| Estilos | Vanilla CSS | Variables CSS, sin frameworks |
| Persistencia | localStorage | Perfiles y tema |
| Servidor | NGINX | Servir archivos estáticos |
| Contenedor | Docker | Empaquetado y despliegue |

---

## 2. Estructura del proyecto

```
mqtt-explorer-web/
├── index.html                     # Entry point HTML (Vite)
├── vite.config.ts                 # Configuración de Vite
├── tsconfig.json                  # Configuración TypeScript
├── package.json                   # Dependencias y scripts
├── nginx.conf                     # Configuración NGINX para producción
├── Dockerfile                     # Imagen Docker (build + NGINX)
├── .dockerignore
├── README.md
├── IMPLEMENTATION.md              # Este documento
└── src/
    ├── main.tsx                   # Bootstrap de React
    ├── App.tsx                     # Componente raíz, layout principal
    ├── index.css                   # Estilos globales (design system)
    ├── lib/
    │   └── mqttClient.ts          # Cliente MQTT para navegador
    ├── store/
    │   ├── mqttStore.ts            # Estado MQTT (topics, mensajes, stats)
    │   ├── profileStore.ts         # Perfiles de conexión (localStorage)
    │   └── themeStore.ts           # Tema visual (light/dark/system)
    ├── components/
    │   ├── ConnectionDialog.tsx    # Modal de conexión al broker
    │   ├── Toolbar.tsx             # Barra superior (conectar, tema)
    │   ├── TopicTree.tsx           # Árbol jerárquico de topics
    │   ├── TopicFilter.tsx         # Filtro de búsqueda de topics
    │   ├── MessageDetail.tsx       # Detalle del último mensaje
    │   ├── MessageHistory.tsx      # Historial de mensajes del topic
    │   ├── PublishPanel.tsx        # Panel de publicación
    │   └── StatusBar.tsx           # Barra de estado inferior
    └── types/
        └── index.ts               # Tipos compartidos
```

---

## 3. Tipos compartidos (`src/types/index.ts`)

Definiciones TypeScript que se usan en toda la aplicación:

### `ConnectionProfile`

Representa un perfil de conexión guardado. Se persiste en `localStorage` (los certificados TLS **no** se persisten por seguridad).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador único del perfil |
| `name` | `string` | Nombre descriptivo |
| `host` | `string` | Hostname del broker |
| `port` | `number` | Puerto WebSocket del broker |
| `protocol` | `'ws' \| 'wss'` | Protocolo de transporte |
| `clientId` | `string` | Client ID MQTT (vacío = auto-generado) |
| `username` | `string` | Usuario (opcional) |
| `password` | `string` | Contraseña (opcional) |
| `useTls` | `boolean` | Si usa TLS (wss) |
| `rejectUnauthorized` | `boolean` | Validar certificado TLS |
| `tlsCa` | `string?` | Contenido PEM del certificado CA (en memoria, no se persiste) |
| `tlsCaName` | `string?` | Nombre del fichero CA seleccionado |
| `tlsCert` | `string?` | Contenido PEM del certificado de cliente (en memoria, no se persiste) |
| `tlsCertName` | `string?` | Nombre del fichero CRT seleccionado |
| `tlsKey` | `string?` | Contenido PEM de la clave privada (en memoria, no se persiste) |
| `tlsKeyName` | `string?` | Nombre del fichero KEY seleccionado |
| `mqttVersion` | `3 \| 4 \| 5` | Versión del protocolo MQTT |
| `keepalive` | `number` | Keepalive en segundos |
| `subscriptions` | `string[]` | Topics a los que suscribirse al conectar |

### `MqttMessage`

Mensaje MQTT recibido del broker.

| Campo | Tipo | Descripción |
|---|---|---|
| `topic` | `string` | Topic del mensaje |
| `payload` | `string` | Contenido del mensaje |
| `qos` | `number` | QoS (0, 1 o 2) |
| `retain` | `boolean` | Si es un mensaje retained |
| `timestamp` | `number` | Timestamp de recepción (`Date.now()`) |

### `TopicNode`

Nodo del árbol jerárquico de topics.

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | `string` | Segmento del topic (ej. `"temperature"`) |
| `fullPath` | `string` | Ruta completa (ej. `"home/kitchen/temperature"`) |
| `children` | `Map<string, TopicNode>` | Nodos hijos |
| `latestMessage` | `MqttMessage?` | Último mensaje recibido |
| `messageCount` | `number` | Total de mensajes en este nodo y subnodos |
| `isExpanded` | `boolean` | Estado de expansión en el árbol visual |

### `ConnectionStatus` y `StatusInfo`

```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface StatusInfo {
  status: ConnectionStatus
  brokerUrl: string
  error?: string
}
```

---

## 4. Cliente MQTT (`src/lib/mqttClient.ts`)

### Propósito

Es el componente central que sustituye toda la lógica que antes residía en el proceso principal de Electron (IPC handlers, gestión del cliente MQTT, lectura de certificados). Ahora todo ocurre en el navegador.

### Diseño

Implementa un patrón **singleton** mediante la clase `MqttBrowserClient` exportada como instancia única `mqttBrowserClient`. Internamente envuelve `mqtt.js` y expone una API asíncrona con callbacks para mensajes y cambios de estado.

### API pública

| Método | Retorno | Descripción |
|---|---|---|
| `connect(opts)` | `Promise<{success, error?}>` | Conecta al broker por WebSocket, suscribe a los topics indicados |
| `disconnect()` | `Promise<{success}>` | Cierra la conexión |
| `publish(args)` | `Promise<{success, error?}>` | Publica un mensaje (topic, payload, qos, retain) |
| `subscribe(args)` | `Promise<{success, error?}>` | Suscribe a un topic |
| `unsubscribe(args)` | `Promise<{success, error?}>` | Cancela suscripción |
| `isConnected()` | `Promise<{connected}>` | Consulta estado de conexión |
| `onMessage(cb)` | `() => void` | Registra callback de mensaje; retorna función de desuscripción |
| `onStatus(cb)` | `() => void` | Registra callback de cambio de estado; retorna función de desuscripción |

### Flujo de conexión

1. Se construye la URL: `${protocol}://${host}:${port}` donde protocol es `ws` o `wss` según `useTls`.
2. Se configuran las opciones del cliente: `clientId`, `keepalive`, `reconnectPeriod` (3s), `connectTimeout` (10s), `protocolVersion` (3, 4 o 5), credenciales.
3. Si `useTls` está activo, se configuran los certificados TLS para mTLS:
   - `rejectUnauthorized` se pasa a las opciones del cliente.
   - `tlsCa` (contenido PEM) se pasa como `ca`.
   - `tlsCert` (contenido PEM) se pasa como `cert`.
   - `tlsKey` (contenido PEM) se pasa como `key`.
4. Se llama a `mqtt.connect(url, options)` que crea el `MqttJsClient`.
5. Se registra un timeout de 12s que resuelve con error si no hay conexión.
6. Se escuchan los eventos del cliente:
   - **`connect`**: limpia el timeout, suscribe a los topics, emite estado `{connected: true, url}`, resuelve la promesa.
   - **`error`**: emite estado `{connected: false, error}`, resuelve con error.
   - **`close`**: emite estado `{connected: false}`.
   - **`reconnect`**: emite estado `{reconnecting: true}`.
   - **`message`**: construye un `MqttMessage` y notifica a todos los callbacks registrados.

### Gestión de callbacks

Usa `Set<MessageCallback>` y `Set<StatusCallback>` para permitir múltiples suscriptores. Los métodos `onMessage` y `onStatus` retornan una función de cleanup que elimina el callback del Set — patrón compatible con `useEffect` de React.

### Certificados TLS (mTLS)

Cuando `useTls` está activo (protocolo `wss://`), el cliente MQTT puede recibir certificados de cliente para autenticación mutua (mTLS):

- **`tlsCa`**: contenido PEM del certificado de la CA. Se pasa como `clientOptions.ca`.
- **`tlsCert`**: contenido PEM del certificado de cliente. Se pasa como `clientOptions.cert`.
- **`tlsKey`**: contenido PEM de la clave privada. Se pasa como `clientOptions.key`.

Estos contenidos se leen en el navegador desde el input `type="file"` del diálogo de conexión (ver sección 6.2). Los ficheros pueden estar en formato PEM (texto) o DER (binario); en este último caso se convierten a Base64/PEM automáticamente.

### Limitaciones del navegador

- Solo se pueden usar protocolos `ws://` y `wss://` (no `mqtt://` ni `mqtts://` que requieren TCP).
- La API WebSocket del navegador no permite pasar certificados de cliente (mTLS) directamente desde JavaScript de forma universal. El soporte depende del navegador y de mqtt.js. Para mTLS estricto en producción, se recomienda un proxy inverso que termine TLS.
- El campo `rejectUnauthorized` se pasa a mqtt.js pero su efecto depende del contexto del navegador.

---

## 5. Stores (Zustand)

### 5.1 `mqttStore.ts` — Estado MQTT

Es el store más complejo. Gestiona todo el estado relacionado con la conexión MQTT y los mensajes recibidos.

#### Estado

| Campo | Tipo | Descripción |
|---|---|---|
| `statusInfo` | `StatusInfo` | Estado de conexión actual |
| `brokerUrl` | `string` | URL del broker al que se está conectado |
| `topicTree` | `Map<string, TopicNode>` | Raíz del árbol de topics |
| `selectedTopic` | `string \| null` | Topic seleccionado en el árbol |
| `messageHistory` | `Map<string, MqttMessage[]>` | Historial por topic (máx 200) |
| `totalTopics` | `number` | Contador total de topics |
| `totalMessages` | `number` | Contador total de mensajes |
| `messagesPerSecond` | `number` | Tasa de mensajes calculada |
| `filterText` | `string` | Texto de filtro del árbol |

#### Acciones

| Acción | Descripción |
|---|---|
| `setStatus(info)` | Actualiza el estado de conexión |
| `addMessage(msg)` | Procesa un mensaje entrante: actualiza árbol, historial y stats |
| `selectTopic(path)` | Selecciona un topic en el árbol |
| `toggleExpand(path)` | Expande/colapsa un nodo del árbol |
| `clearTopic(path)` | Borra el historial de un topic |
| `clearAll()` | Resetea todo el estado (al reconectar) |
| `resetCounts()` | Pone a cero los contadores de mensajes |
| `setFilter(text)` | Establece el texto de filtro |

#### Función `ensureNode(root, fullPath)`

Es el corazón del árbol de topics. Dado un topic completo (ej. `"home/kitchen/temperature"`), lo divide por `/` y recorre/crea los nodos jerárquicos. Cada nodo ancestro incrementa su `messageCount` en cada mensaje, de modo que el conteo de un nodo padre incluye todos los mensajes de sus descendientes.

Retorna el nodo hoja y el número de nodos nuevos creados (para actualizar `totalTopics`).

#### Cálculo de mensajes por segundo

En `addMessage`, se mantiene un buffer (`_msgCountBuffer`) y un timestamp (`_lastSecond`). Cuando pasa más de 1 segundo desde el último cálculo, se computa la tasa: `mps = buffer / (elapsed / 1000)`.

### 5.2 `profileStore.ts` — Perfiles de conexión

Gestiona los perfiles de conexión guardados. Usa `localStorage` con la clave `mqtt-explorer-profiles`.

#### Perfiles por defecto

Incluye tres brokers públicos con WebSocket:

| Perfil | Host | Puerto | Protocolo |
|---|---|---|---|
| Mosquitto Test | `test.mosquitto.org` | 8081 | wss |
| HiveMQ Public | `broker.hivemq.com` | 8884 | wss |
| EMQX Public | `broker.emqx.io` | 8084 | wss |

#### Acciones

| Acción | Descripción |
|---|---|
| `saveProfile(profile)` | Crea o actualiza un perfil y lo persiste. Los certificados TLS (`tlsCa`, `tlsCert`, `tlsKey`) **no se persisten** en localStorage por seguridad; solo se guardan los nombres de fichero. El contenido PEM se mantiene en memoria durante la sesión. |
| `deleteProfile(id)` | Elimina un perfil |
| `setActive(id)` | Marca el perfil activo |

### 5.3 `themeStore.ts` — Tema visual

Gestiona el tema de la interfaz: `system`, `light` o `dark`. Se persiste en `localStorage` con la clave `mqtt-explorer-theme`.

La función `applyTheme(mode)` establece el atributo `data-theme` en `<html>` a `light` o `dark`. En modo `system`, consulta `window.matchMedia('(prefers-color-scheme: dark)')`.

Un listener en `matchMedia` detecta cambios del sistema y reaplica el tema si está en modo `system`.

---

## 6. Componentes

### 6.1 `App.tsx` — Componente raíz

Es el punto de entrada de la UI. Define el layout principal:

```
┌──────────────────────────────────────────────┐
│                  Toolbar                      │
├───────────┬──┬───────────────────────────────┤
│           │  │                               │
│  Sidebar  │  │       Main Panel              │
│  (Topic   │  │  (MessageDetail + History     │
│   Tree)   │  │   + PublishPanel)             │
│           │  │                               │
├───────────┴──┴───────────────────────────────┤
│                  StatusBar                     │
└──────────────────────────────────────────────┘
```

#### Responsabilidades

1. **Registro de listeners MQTT**: En un `useEffect`, se suscribe a `mqttBrowserClient.onMessage` y `mqttBrowserClient.onStatus`. Los callbacks actualizan el store y controlan la visibilidad del `ConnectionDialog`.
   - `connected` → `setStatus({status: 'connected'})`, oculta el diálogo.
   - `reconnecting` → `setStatus({status: 'reconnecting'})`.
   - `error` → `setStatus({status: 'error'})`, llama a `clearAll()` para borrar todo el estado (topics, mensajes, stats), muestra el diálogo.
   - `disconnected` → `setStatus({status: 'disconnected'})`, llama a `clearAll()` para borrar todo el estado, muestra el diálogo.

2. **Resize del sidebar**: Implementa drag del handle para ajustar el ancho del sidebar entre 180px y 600px.

3. **Renderizado condicional**: Si hay un topic seleccionado, muestra el panel de detalle; si no, muestra un placeholder.

### 6.2 `ConnectionDialog.tsx` — Modal de conexión

Es el componente más complejo. Presenta un modal con dos secciones:

#### Panel izquierdo: Perfiles guardados

Lista los perfiles del `profileStore`. Permite seleccionar, crear nuevo (`+ New Profile`) y eliminar.

#### Panel derecho: Formulario de conexión

Campos:
- **Profile Name**: nombre descriptivo.
- **Host / Protocol / Port**: datos del broker. Al cambiar el protocolo (`ws`/`wss`), se ajusta automáticamente el puerto por defecto (8080 para ws, 8443 para wss).
- **Username / Password**: credenciales opcionales.
- **Client ID**: si se deja vacío, se auto-genera.
- **MQTT Version**: v3.1.1 o v5.0.
- **Keep Alive**: segundos.
- **TLS: Reject Unauthorized**: toggle (solo habilitado con wss).
- **TLS / Client Certificates**: sección que aparece solo cuando `useTls` está activo (wss). Permite cargar tres ficheros:
  - **CA Certificate** (`.pem`, `.crt`, `.cer`): certificado de la CA.
  - **Client Certificate** (`.pem`, `.crt`, `.cer`): certificado de cliente para mTLS.
  - **Client Key** (`.key`, `.pem`): clave privada del cliente.
- **Subscriptions**: lista editable de topics a suscribirse al conectar.

#### Carga de certificados TLS

El componente implementa la lectura de certificados en el navegador mediante la API `FileReader`:

- **`handleSelectCertFile(field, nameField, title)`**: crea un `<input type="file">` dinámico con `accept=".pem,.crt,.cer,.key"`. Al seleccionar un fichero, lo lee y lo valida.
- **`readFileAsText(file)`**: lee el fichero como texto (PEM). Si el resultado no es texto, lo relee como `ArrayBuffer` (DER binario) y lo convierte.
- **`derToPem(bytes)`**: convierte un buffer DER a formato PEM codificando a Base64 y envolviendo con `-----BEGIN CERTIFICATE-----`.
- **`validatePemContent(content, expectedType)`**: valida que el contenido PEM tenga el tipo correcto de bloque:
  - `certificate` (CA y CRT): debe contener `-----BEGIN CERTIFICATE-----`.
  - `key` (KEY): debe contener `-----BEGIN ... PRIVATE KEY-----`.
- **`certFormatBadge(filePath)`**: devuelve el badge de formato según la extensión (`PEM`, `CRT`, `KEY`).
- **`basename(filePath)`**: extrae el nombre del fichero sin la ruta.

Los certificados se almacenan en el `ConnectionProfile` como contenido PEM (string) en los campos `tlsCa`, `tlsCert`, `tlsKey`. Los nombres de fichero se guardan en `tlsCaName`, `tlsCertName`, `tlsKeyName` para mostrarlos en la UI.

#### Banner informativo

Muestra un aviso recordando que el navegador solo soporta WebSocket, que el broker debe tener un endpoint WebSocket habilitado, y que los certificados de cliente se cargan en memoria y no se persistan.

#### Flujo de conexión (`handleConnect`)

1. Guarda el perfil (`saveProfile`).
2. Limpia el estado MQTT (`clearAll`).
3. Establece estado `connecting`.
4. Construye `connOpts` incluyendo `tlsCa`, `tlsCert`, `tlsKey` si están presentes.
5. Llama a `mqttBrowserClient.connect(connOpts)`.
6. Si success → cierra el modal. Si error → lo muestra.

### 6.3 `Toolbar.tsx` — Barra superior

Contiene:
- **Logo y título** "MQTT Explorer".
- **Selector de tema**: dropdown con `system`, `light`, `dark`.
- **Botón Connect/Disconnect**: según el estado de conexión, muestra un botón u otro. Disconnect llama a `mqttBrowserClient.disconnect()`.

### 6.4 `TopicTree.tsx` — Árbol de topics

Renderiza el árbol jerárquico de topics de forma recursiva.

#### `TreeNodeComponent`

Componente recursivo que renderiza cada nodo:
- **Toggle**: flecha para expandir/colapsar (solo si tiene hijos).
- **Icono**: carpeta si tiene hijos, archivo si es hoja.
- **Nombre**: segmento del topic.
- **Valor corto**: preview del último payload (truncado a 30 chars).
- **Badges**:
  - Nodos con hijos: dos badges — conteo de subtopics descendientes y total de mensajes del subárbol.
  - Hojas: un badge con el conteo de mensajes.

#### Filtrado

La función `matchesFilter(node, filter)` busca recursivamente si el `fullPath` del nodo o cualquiera de sus descendientes contiene el texto de filtro. Si hay filtro activo, todos los nodos se expanden automáticamente.

#### `countDescendantTopics(node)`

Función recursiva que cuenta el total de topics hijos directos e indirectos para el badge.

#### Botón "Reset counters"

En la cabecera del árbol, un botón llama a `resetCounts()` del store para poner a cero todos los contadores.

### 6.5 `TopicFilter.tsx` — Filtro de búsqueda

Input de texto que filtra el árbol en tiempo real mediante `setFilter`. Soporta el atajo `⌘K` / `Ctrl+K` para enfocar el input.

### 6.6 `MessageDetail.tsx` — Detalle del mensaje

Muestra información del último mensaje recibido en el topic seleccionado.

#### Detección automática de formato

La función `detectFormat(payload)` analiza el payload:
- Si empieza con `{` o `[` y es JSON válido → `json`.
- Si empieza con `<` y tiene tags de apertura/cierre → `xml`.
- En caso contrario → `raw`.

El formato se re-detecta solo cuando el payload cambia (no en cada render).

#### Resaltado de sintaxis

- **JSON**: `syntaxHighlightJson()` escapa HTML y envuelve keys, strings, numbers, booleans y null en spans con clases CSS.
- **XML**: `syntaxHighlightXml()` resalta tags, atributos, nombres y valores.
- **Raw**: escapa HTML y muestra el texto plano.

#### Pretty-print

- JSON: `JSON.parse` + `JSON.stringify(obj, null, 2)`.
- XML: `formatXml()` indenta tags recursivamente.

#### Selector de formato

Tres botones (`JSON`, `XML`, `RAW`) permiten cambiar manualmente el formato de visualización.

#### Acciones

- **Copy**: copia el payload formateado al clipboard.
- **Clear Retained**: publica un mensaje vacío con `retain: true` para limpiar el mensaje retenido del topic.

### 6.7 `MessageHistory.tsx` — Historial de mensajes

Lista scrollable de todos los payloads recibidos para el topic seleccionado (máximo 200, los más recientes primero).

#### Diff visual

Cuando un mensaje difiere del anterior, se renderiza un diff inline usando `diffStrings(oldStr, newStr)`:
- Tokeniza por palabras, símbolos y espacios.
- Calcula la LCS (Longest Common Subsequence) con programación dinámica.
- Marca tokens como `added` (verde), `removed` (rojo) o `unchanged`.
- Fusiona tokens consecutivos del mismo tipo.

Cada item muestra la hora, un indicador de retained (punto) y el payload con diff.

#### Botón Clear

Vacía el historial del topic seleccionado llamando a `clearTopic(path)`.

### 6.8 `PublishPanel.tsx` — Panel de publicación

Formulario para publicar mensajes:
- **Topic**: input de texto (se auto-rellena con el topic seleccionado).
- **Payload**: textarea.
- **QoS**: select (0, 1, 2).
- **Retain**: toggle.
- **Publish**: botón que llama a `mqttBrowserClient.publish()`.

Muestra banners de éxito o error tras la publicación.

### 6.9 `StatusBar.tsx` — Barra de estado

Barra inferior con:
- **Indicador de estado**: punto de color + texto (`Connected`, `Connecting...`, `Reconnecting...`, `Error`, `Disconnected`).
- **URL del broker**: visible cuando está conectado.
- **Stats**: total de topics, total de mensajes, tasa de mensajes/segundo.

---

## 7. Flujo de datos completo

### Ciclo de vida de la aplicación

```
1. main.tsx
   ├── applyTheme()          → establece data-theme en <html>
   └── ReactDOM.createRoot() → monta <App />

2. App.tsx (useEffect)
   ├── mqttBrowserClient.onMessage(cb)  → cb llama a addMessage(msg)
   └── mqttBrowserClient.onStatus(cb)   → cb llama a setStatus(info)

3. Usuario abre ConnectionDialog
   ├── Selecciona/edita perfil
   └── Click "Connect"
       ├── profileStore.saveProfile()
       ├── mqttStore.clearAll()
       ├── mqttStore.setStatus({status: 'connecting'})
       └── mqttBrowserClient.connect(opts)
            ├── mqtt.js conecta por WebSocket
            ├── Event 'connect' → suscribe a topics, emite {connected: true}
            └── App recibe status → setStatus({connected}), cierra diálogo

4. Broker envía mensajes
   ├── mqtt.js evento 'message'
   ├── mqttBrowserClient notifica callbacks
   ├── App.onMessage → mqttStore.addMessage(msg)
   │   ├── ensureNode() actualiza/crea nodos en topicTree
   │   ├── messageHistory se actualiza (prepend, max 200)
   │   └── Stats recalculadas (totalTopics, totalMessages, mps)
   └── React re-renderiza: TopicTree, MessageDetail, MessageHistory, StatusBar

5. Usuario selecciona un topic en el árbol
   ├── mqttStore.selectTopic(path)
   └── Main panel muestra MessageDetail + MessageHistory + PublishPanel

6. Usuario publica un mensaje
   ├── PublishPanel.handlePublish()
   └── mqttBrowserClient.publish({topic, payload, qos, retain})

7. Usuario desconecta
   ├── Toolbar.disconnect()
   └── mqttBrowserClient.disconnect()
       └── mqtt.js cierra → evento 'close' → status {connected: false}
           └── App llama a clearAll() (borra topics, mensajes, stats)
               y muestra ConnectionDialog de nuevo
```

### Reactividad

Zustand usa el patrón de inmutabilidad: cada acción crea nuevos Maps y objetos en lugar de mutar los existentes. Esto asegura que React detecte los cambios y re-renderice los componentes suscritos.

En `addMessage`, se clonan `topicTree` y `messageHistory` con `new Map(state.topicTree)` antes de modificarlos.

---

## 8. Build y despliegue

### Build de desarrollo

```bash
npm run dev    # Vite dev server en http://localhost:5173 con HMR
```

### Build de producción

```bash
npm run build  # Genera dist/ con assets hasheados
```

Vite compila y empaqueta:
- `dist/index.html` — HTML con referencias a assets hasheados.
- `dist/assets/index-[hash].js` — Bundle JavaScript (React + mqtt.js + app).
- `dist/assets/index-[hash].css` — CSS compilado.

### Despliegue con Docker

El `Dockerfile` usa multi-stage:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t mqtt-explorer-web .
docker run -p 8080:80 mqtt-explorer-web
# → http://localhost:8080
```

### Configuración NGINX (`nginx.conf`)

- **SPA fallback**: `try_files $uri $uri/ /index.html` para que cualquier ruta sirva `index.html`.
- **Gzip**: comprime JS, CSS, JSON, XML, SVG, fuentes.
- **Cache de assets**: `expires 1y` con `Cache-Control: public, immutable` para archivos con hash.
- **No cache de index.html**: `Cache-Control: no-cache` para que siempre se sirva la versión más reciente.

### Despliegue manual con NGINX

```bash
npm run build
sudo cp -r dist/* /usr/share/nginx/html/
sudo cp nginx.conf /etc/nginx/conf.d/default.conf
sudo nginx -s reload
```

### Cualquier servidor estático

El directorio `dist/` contiene únicamente archivos estáticos. Se puede servir con cualquier servidor: Apache, Caddy, `python -m http.server`, un bucket S3, GitHub Pages, etc.

---

## 9. Brokers MQTT con WebSocket

El navegador no puede abrir conexiones TCP directas, por lo que el broker debe exponer un endpoint WebSocket.

### Brokers públicos de prueba

| Broker | Host | Puerto | Protocolo |
|---|---|---|---|
| Mosquitto Test | `test.mosquitto.org` | 8081 | wss |
| HiveMQ Public | `broker.hivemq.com` | 8884 | wss |
| EMQX Public | `broker.emqx.io` | 8084 | wss |

### Configurar Mosquitto local

En `mosquitto.conf`:

```
listener 1883
protocol mqtt

listener 9001
protocol websockets
```

Con TLS:

```
listener 8883
protocol mqtt
certfile /path/to/cert.pem
keyfile /path/to/key.pem

listener 9443
protocol websockets
certfile /path/to/cert.pem
keyfile /path/to/key.pem
```

---

## 10. Consideraciones de seguridad

### TLS y certificados de cliente (mTLS)

- Las conexiones `wss://` usan el trust store del navegador. El certificado del broker debe estar firmado por una CA reconocida.
- Al seleccionar `wss://`, el diálogo de conexión permite cargar certificados de cliente (CA, CRT, KEY) para autenticación mutua (mTLS).
- Los ficheros se leen con `FileReader` y se validan:
  - CA y CRT: deben contener un bloque `-----BEGIN CERTIFICATE-----`.
  - KEY: debe contener un bloque `-----BEGIN ... PRIVATE KEY-----`.
- Los ficheros en formato DER (binario) se convierten automáticamente a PEM (Base64).
- El contenido PEM de los certificados se mantiene **en memoria** durante la sesión y **no se persiste** en `localStorage`. Solo se guardan los nombres de fichero para referencia visual.
- Al recargar la página, los certificados deben volver a seleccionarse.
- La API WebSocket del navegador no permite pasar certificados de cliente directamente desde JavaScript de forma universal. El soporte depende del navegador y de mqtt.js. Para mTLS estricto en producción, se recomienda un proxy inverso (ej. NGINX) que termine la conexión TLS con los certificados de cliente.

### CORS y Mixed Content

- Si la app se sirve por `https://`, el navegador bloqueará conexiones `ws://` (Mixed Content). Se debe usar `wss://`.
- Si la app se sirve por `http://`, se pueden usar tanto `ws://` como `wss://`.

### Limpieza al desconectar

- Al desconectarse del broker (tanto voluntariamente como por error), se llama a `clearAll()` que vacía el árbol de topics, el historial de mensajes, los contadores y el topic seleccionado, dejando la interfaz limpia antes de mostrar el diálogo de conexión.

### Persistencia

- Los perfiles de conexión (incluyendo contraseñas) se guardan en `localStorage` del navegador en texto plano. No es recomendable guardar credenciales sensibles en perfiles compartidos.
- Los certificados TLS **no** se persisten en `localStorage` por seguridad.