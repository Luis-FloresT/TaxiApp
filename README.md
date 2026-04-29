# TaxiWhatsApp

Panel local para operar conversaciones de WhatsApp de una cooperativa/taxi, con chatbot configurable, respuestas rápidas, simulador de mensajes, despacho a taxista por WhatsApp y actualizaciones en tiempo real.

## Estructura

- `backend/`: API Express, webhook de WhatsApp, cola Bull/Redis, PostgreSQL y Socket.IO.
- `frontend/`: panel Vite + React + Tailwind.

## Requisitos locales

- Node.js
- PostgreSQL
- Redis

## Base de datos

El esquema y los datos iniciales están en:

```bash
backend/src/models/db.sql
```

Ejemplo de carga local:

```bash
createdb taxi_whatsapp
psql -d taxi_whatsapp -f backend/src/models/db.sql
```

Los usuarios semilla son:

- `operador1` / `password`
- `operador2` / `password`
- `operador3` / `password`

## Variables de entorno

Copia los ejemplos y ajusta los valores locales:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Mientras estés simulando, deja:

```bash
WA_ACCESS_TOKEN=pending
WA_PHONE_ID=pending
```

En producción usa valores reales y desactiva el simulador:

```bash
NODE_ENV=production
ENABLE_SIMULATOR=false
CORS_ORIGIN=https://tu-panel.com
FRONTEND_URL=https://tu-panel.com
WA_ACCESS_TOKEN=token_real_de_meta
WA_PHONE_ID=id_real_del_numero
WA_VERIFY_TOKEN=un_token_largo_para_el_webhook
JWT_SECRET=un_secreto_largo_y_unico
```

Si tu proveedor entrega una sola URL de conexión, puedes usar:

```bash
DATABASE_URL=postgresql://usuario:password@host:5432/base
REDIS_URL=redis://default:password@host:6379
```

## Ejecutar en desarrollo

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

El simulador está disponible en:

```text
http://localhost:5173/simulator
```

## Flujo de despacho a taxista

1. El cliente escribe por WhatsApp y aparece en el panel.
2. Desde el chat del cliente, usa `Despachar taxista`.
3. Selecciona un taxista de la lista interna de contactos o escribe manualmente su número de WhatsApp.
4. Si escribes un número nuevo, puedes guardarlo para futuros despachos.
5. El sistema envía el resumen de carrera al taxista por WhatsApp (o modo simulado si `WA_ACCESS_TOKEN=pending`).

## Despliegue a producción beta

1. Crea una base PostgreSQL y ejecuta `backend/src/models/db.sql`.
2. Crea una instancia Redis para la cola de mensajes.
3. Sube el backend como servicio Node:

```bash
cd backend
npm install
npm start
```

4. Sube el frontend como sitio estático:

```bash
cd frontend
npm install
npm run build
```

Publica la carpeta `frontend/dist`.

5. En el frontend configura:

```bash
VITE_API_URL=https://tu-backend.com
VITE_ENABLE_SIMULATOR=false
```

6. En Meta WhatsApp configura el webhook público:

```text
https://tu-backend.com/webhook
```

Usa el mismo valor de `WA_VERIFY_TOKEN`.

7. Verifica que el backend responda:

```bash
curl https://tu-backend.com/health
```

Debe devolver `{ "ok": true }`.

## Checklist antes de usar con clientes reales

- Cambiar o eliminar usuarios semilla con contraseña `password`.
- Usar HTTPS en frontend y backend.
- Confirmar que `ENABLE_SIMULATOR=false`.
- Confirmar que `WA_ACCESS_TOKEN` y `WA_PHONE_ID` ya no están en `pending`.
- Probar un mensaje entrante desde WhatsApp real.
- Probar una respuesta del operador hacia el cliente.
- Probar despacho a un taxista real de confianza.

## Verificaciones

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
cd backend
find src -name '*.js' -exec node --check {} \;
node --check index.js
```
# TaxiApp
