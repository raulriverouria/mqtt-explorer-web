# MQTT Explorer Web

Un cliente MQTT estructurado que funciona **íntegramente en el navegador**. Sin Electron, sin backend: solo HTML, CSS y JavaScript servido por NGINX (o cualquier servidor estático).

Conecta directamente al broker MQTT mediante **WebSocket** (ws:// o wss://) usando mqtt.js, que funciona nativamente en el navegador.

---

## Características principales

| Característica | Descripción |
|---|---|
| **Gestor de conexiones** | Guarda y carga múltiples perfiles de broker (host, puerto, TLS, autenticación, MQTT v3/v5) |
| **Conexión por WebSocket** | Conexión directa desde el navegador al broker mediante ws:// o wss:// |
| **TLS con certificados de cliente (mTLS)** | Al seleccionar `wss://`, permite cargar certificados CA, CRT y KEY en formato PEM, CRT o DER. Los ficheros se leen en el navegador, se valida su contenido y se convierten a PEM si es necesario |
| **Árbol de topics** | Vista jerárquica, colapsable y con scroll bidireccional de todos los topics |
| **Métricas en árbol** | Doble badge para nodos con hijos (conteo de subtopics + total de mensajes) y badge único para hojas |
| **Botón de Reinicio** | Opción "Reset counters" para restablecer las métricas de mensajes |
| **Panel de detalle** | Muestra el último valor, ruta del topic, QoS, flag retained y timestamp |
| **Historial de mensajes** | Lista scrollable de todos los payloads recibidos para el topic seleccionado |
| **Panel de publicación** | Publica en cualquier topic con QoS, retain flag y payload raw/JSON |
| **Filtro de topics** | Búsqueda y filtrado en tiempo real sobre el árbol |
| **Resaltado JSON/XML** | Pretty-print y coloreado de payloads JSON y XML |
| **Barra de estado** | Total de topics y contador de mensajes/segundo |
| **Limpieza al desconectar** | Al desconectar del broker se borra todo el estado (topics, mensajes, stats) y se reabre el diálogo de conexión |
| **Persistencia local** | Los perfiles se guardan en localStorage del navegador (los certificados no se persisten por seguridad) |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Lenguaje | TypeScript |
| Estilos | Vanilla CSS (variables CSS) |
| MQTT | mqtt.js (WebSocket) |
| Estado global | Zustand |
| Persistencia | localStorage |
| Servidor | NGINX (producción) |

---

## Estructura del proyecto

```
mqtt-explorer-web/
├── index.html                 # Entry point HTML (Vite)
├── vite.config.ts             # Configuración de Vite
├── nginx.conf                 # Configuración de NGINX para producción
├── Dockerfile                # Imagen Docker (build + NGINX)
├── package.json
├── tsconfig.json
└── src/
    ├── main.tsx               # Bootstrap de React
    ├── App.tsx                # Componente raíz
    ├── index.css              # Estilos globales
    ├── lib/
    │   └── mqttClient.ts      # Cliente MQTT para navegador (WebSocket)
    ├── store/
    │   ├── mqttStore.ts        # Estado global MQTT (Zustand)
    │   ├── profileStore.ts     # Perfiles de conexión (localStorage)
    │   └── themeStore.ts       # Tema light/dark
    ├── components/
    │   ├── ConnectionDialog.tsx
    │   ├── Toolbar.tsx
    │   ├── TopicTree.tsx
    │   ├── TopicFilter.tsx
    │   ├── MessageDetail.tsx
    │   ├── MessageHistory.tsx
    │   ├── PublishPanel.tsx
    │   └── StatusBar.tsx
    └── types/
        └── index.ts            # Tipos compartidos
```

---

## Requisitos del broker

El navegador **no puede** abrir conexiones TCP directas (mqtt://), solo WebSocket. El broker debe tener un endpoint WebSocket habilitado:

- **Mosquitto**: añadir `listener 9001` y `protocol websockets`
- **HiveMQ**: el broker público `broker.hivemq.com:8884` (wss) está disponible
- **EMQX**: el broker público `broker.emqx.io:8084` (wss) está disponible
- **Mosquitto test**: `test.mosquitto.org:8081` (wss) está disponible

---

## Desarrollo

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo (http://localhost:5173)
npm run dev

# Build de producción (genera dist/)
npm run build

# Preview del build
npm run preview
```

---

## Despliegue con NGINX

La aplicación se sirve bajo la ruta base `/mqtt-explorer/`. Tanto Vite (`base: '/mqtt-explorer/'`) como la configuración de NGINX están preparadas para ello: la raíz `/` redirige a `/mqtt-explorer/`.

### Opción 1: Docker (recomendado)

```bash
# Construir la imagen
docker build -t mqtt-explorer-web .

# Ejecutar el contenedor en el puerto 8080
docker run -p 8080:80 mqtt-explorer-web
```

Abrir `http://localhost:8080/mqtt-explorer/` en el navegador (la raíz `/` redirige automáticamente).

### Opción 2: NGINX manual

```bash
# Build
npm run build

# Copiar dist/ al directorio de NGINX bajo /mqtt-explorer/
sudo mkdir -p /usr/share/nginx/html/mqtt-explorer
sudo cp -r dist/* /usr/share/nginx/html/mqtt-explorer/

# Copiar configuración
sudo cp nginx.conf /etc/nginx/conf.d/default.conf

# Recargar NGINX
sudo nginx -s reload
```

### Opción 3: Cualquier servidor estático

El directorio `dist/` después de `npm run build` contiene archivos estáticos con rutas prefijadas con `/mqtt-explorer/`. Se puede servir con cualquier servidor web (NGINX, Apache, Caddy, `python -m http.server`, etc.) montando `dist/` en la ruta `/mqtt-explorer/`.

---

## TLS y certificados de cliente (mTLS)

Al seleccionar el protocolo `wss://` (conexión cifrada), el diálogo de conexión muestra una sección **TLS / Client Certificates** donde se pueden cargar tres ficheros:

| Fichero | Extensiones aceptadas | Propósito |
|---|---|---|
| **CA Certificate** | `.pem`, `.crt`, `.cer` | Certificado de la CA que firma el certificado del broker |
| **Client Certificate** | `.pem`, `.crt`, `.cer` | Certificado de cliente para autenticación mTLS |
| **Client Key** | `.key`, `.pem` | Clave privada del cliente |

### Formatos soportados

- **PEM** (texto): se lee directamente con `FileReader.readAsText()`.
- **DER** (binario): se detecta automáticamente y se convierte a Base64/PEM.

### Validación de contenido

- Los ficheros **CA** y **CRT** deben contener un bloque `-----BEGIN CERTIFICATE-----`.
- El fichero **KEY** debe contener un bloque `-----BEGIN ... PRIVATE KEY-----`.

Si el contenido no coincide con el tipo esperado, se muestra un error y no se carga el fichero.

### Seguridad

- El contenido PEM de los certificados se mantiene **en memoria** durante la sesión.
- **No se persisten** en `localStorage`. Solo se guarda el nombre del fichero para referencia visual.
- Al recargar la página, los certificados deben volver a seleccionarse.

### Limitación del navegador

La API WebSocket del navegador no permite pasar certificados de cliente (mTLS) directamente desde JavaScript. Esta funcionalidad depende de que el navegador soporte la API `crypto.subtle` o que mqtt.js pueda negociar los certificados a través del WebSocket. Para entornos de producción con mTLS estricto, se recomienda usar un proxy inverso (ej. NGINX) que termine la conexión TLS con los certificados de cliente.