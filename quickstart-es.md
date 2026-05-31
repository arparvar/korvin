# Inicio rápido de Korvin

Esta guía empieza con un VPS nuevo de Ubuntu 24.04 y deja Korvin funcionando como bot de Telegram, dashboard FastAPI y proxy LiteLLM. El instalador crea un usuario Linux `korvin`, clona el repo en `/home/korvin/korvin`, instala dependencias, escribe `/etc/korvin.env`, crea servicios systemd y arranca todo.

No pegues API keys reales en tickets, logs de chat, capturas de pantalla ni terminales públicas.

## Prerrequisitos

- VPS nuevo con Ubuntu 24.04 (1 vCPU, 2GB RAM mínimo, 10GB de disco)
- Un dominio apuntando a la IP de tu VPS (para el dashboard)
- Un token de bot de Telegram (desde @BotFather)
- Una API key de OpenAI (o una key de proveedor LLM compatible)
- Acceso SSH al VPS como root

El instalador actual pide keys de DeepSeek y Gemini porque LiteLLM está configurado con `deepseek-v4-pro`, `deepseek-v4-flash` y `gemini-flash`.

## Paso 1 — Descarga y ejecuta el instalador

Después de entrar al VPS como root, descarga y ejecuta el instalador:

```bash
cd /root
curl -fsSL https://raw.githubusercontent.com/nosistech/korvin/main/install.sh -o install.sh
bash install.sh
```

Salida esperada mientras corre:

- El instalador pide cinco valores secretos.
- `apt-get update` y `apt-get install` muestran progreso de descarga e instalación de paquetes.
- Si Node.js 18 no está instalado, el instalador agrega el repositorio NodeSource Node 18 e instala `nodejs`.
- El instalador crea el usuario `korvin` si no existe.
- El instalador clona o actualiza `https://github.com/nosistech/korvin.git` en `/home/korvin/korvin`.
- Se instalan dependencias de Python y Node.
- Se escriben y arrancan los servicios systemd.

Salida esperada al finalizar:

```text
Korvin install complete.
Services: korvin.service, korvin-dashboard.service, litellm.service
Dashboard: http://127.0.0.1:3002
LiteLLM: http://127.0.0.1:4000
```

## Paso 2 — Configura tus secretos

El instalador pide estos valores en este orden exacto. La entrada queda oculta mientras escribes o pegas cada secreto.

```text
Telegram bot token:
DeepSeek API key:
Gemini API key:
LiteLLM master key:
Korvin dashboard API key:
```

Qué pegar:

- `Telegram bot token`: pega el token de @BotFather para tu bot de Telegram.
- `DeepSeek API key`: pega tu API key de DeepSeek. Esto alimenta los modelos por defecto `deepseek-v4-pro` y `deepseek-v4-flash`.
- `Gemini API key`: pega tu API key de Gemini. Esto alimenta el modelo `gemini-flash`.
- `LiteLLM master key`: pega una key privada aleatoria desde tu gestor de contraseñas. Korvin la usa como bearer token de LiteLLM y la escribe como `OPENAI_API_KEY` en `/etc/korvin.env`.
- `Korvin dashboard API key`: pega una segunda key privada aleatoria desde tu gestor de contraseñas. El dashboard la usa como `X-Korvin-Key`.

Si presionas Enter sin escribir un valor, la salida esperada es:

```text
This value is required.
```

El instalador guarda los secretos en:

```text
/etc/korvin.env
/home/korvin/korvin/config.json
/home/korvin/litellm_config.yaml
```

Esos archivos se crean con permisos restringidos. No los imprimas en logs compartidos.

## Paso 3 — Verifica que los servicios estén corriendo

Carga las variables de entorno para la shell root actual:

```bash
set -a
. /etc/korvin.env
set +a
```

Salida esperada: ninguna salida.

Revisa LiteLLM:

```bash
systemctl is-active litellm.service
```

Salida esperada:

```text
active
```

Revisa el dashboard:

```bash
systemctl is-active korvin-dashboard.service
```

Salida esperada:

```text
active
```

Revisa el bot de Telegram:

```bash
systemctl is-active korvin.service
```

Salida esperada:

```text
active
```

Revisa la API del dashboard:

```bash
curl -s http://127.0.0.1:3002/api/status
```

Salida esperada:

```json
{"korvin":"online","version":"0.1.1","memory":"sqlite"}
```

Revisa el proxy LiteLLM:

```bash
curl -s http://127.0.0.1:4000/v1/models -H "Authorization: Bearer ${LITELLM_MASTER_KEY}"
```

Salida esperada: JSON con los modelos configurados, incluyendo nombres como `deepseek-v4-pro`, `deepseek-v4-flash` y `gemini-flash`.

## Paso 4 — Envía tu primer mensaje

Abre Telegram y busca el username del bot que creaste en @BotFather. Abre el chat y envía:

```text
/start
```

Salida esperada:

```text
Korvin - AI Security Agent

Commands:
/status - VPS health report
/scan [target] - Security scan (HIGH risk)
/patch <target> - Apply patch (HIGH risk)
/grill <topic> - Clarifying questions before research
/brief - Toggle concise mode (one-sentence answers)
/log - Recent activity
/pending - Pending confirmations
/help - this menu

Skills:
Type or say Research <topic> - web research + voice summary
Send any voice message - Korvin responds in voice
Send any text - Korvin replies
```

Luego envía:

```text
/help
```

Salida esperada: el mismo menu de ayuda.

El bot también activa tareas programadas guardadas y el monitor de seguridad de los lunes a las 8AM cuando arranca.

## Paso 5 — Prueba las 5 habilidades

Envía cada mensaje en Telegram. El chat del dashboard usa el mismo dispatcher para estas habilidades.

1. Investigacion

```text
Research the latest AI news
```

Salida esperada: Korvin devuelve un reporte estructurado de investigación. En la validación en vivo, esta habilidad devolvió:

```text
Here's a structured report on Artificial Intelligence trends for 2025 based on the provided search results:

## AI Trends 2025 Report

Summary:
Artificial Intelligence in 2025 is characterized by its deep and pervasive integration into nearly every aspect of life...
```

2. Programacion

```text
Every Monday do review my goals
```

Salida esperada:

```text
Scheduled: review my goals at 0 9 * * 1. ID: job-<generated-id>. Cancel with: /cancel job-<generated-id>
```

La salida de validación usó otra tarea y otro ID generado:

```text
Scheduled: check invoices at 0 9 * * 1. ID: job-mpttvoyu-8piieh. Cancel with: /cancel job-mpttvoyu-8piieh
```

3. Borrador de documento

```text
Write a report about productivity
```

Salida esperada: Korvin devuelve un reporte Markdown completo para el tema solicitado. En la validación en vivo, esta habilidad devolvió:

```text
## Climate Change: An Urgent Global Assessment and Call to Action

Prepared for: [Recipient Name/Organization]
Prepared by: [Your Name/Department]
Date: [Current Date]

---

### Table of Contents

1. Executive Summary
2. Introduction
3. The Scientific Consensus and Evidence
```

Para el prompt de productividad, espera la misma estructura de reporte con productividad como tema.

4. Reporte de seguridad

```text
security report
```

Salida esperada:

```text
VPS Report 2026-05-31T13:41:15.240Z / Disk: 60% / RAM: 2227m/7940m / Services: all active / No external threat feed in v1.0.
```

Tu timestamp, uso de disco y números de RAM van a coincidir con tu VPS.

5. Inbox stub

```text
check my inbox
```

Salida esperada:

```text
Email integration is not configured yet. This feature requires OAuth setup with Gmail or Outlook. It will be available in v1.1.
```

## Paso 6 — Accede al dashboard

El instalador arranca el dashboard en:

```text
http://127.0.0.1:3002
```

Como escucha en `127.0.0.1`, no queda público por defecto. Apunta tu aplicación de Cloudflare Access, tunnel o reverse proxy al servicio local del dashboard en el VPS:

```text
http://127.0.0.1:3002
```

Usa este formato de URL pública:

```text
https://dashboard.your-domain.com
```

Cuando abras la URL, Cloudflare Access muestra primero su pantalla de login. Inicia sesión con el email o proveedor de identidad permitido por tu política de Cloudflare Access. Después de que Access te apruebe, carga el Korvin Dashboard.

Vista esperada del dashboard:

- Navegación izquierda con Home, Chat, Memory, Security, Settings e Integrations.
- Filas de estado en Home para el agente, modelo activo, Telegram, voz y memoria SQLite.
- Una pagina Chat con lista de mensajes, un input que dice `Type a message...` y un boton `Send`.
- Controles de memoria, seguridad, cambio de modelo, uso de tokens y timeout.

Para verificar el chat del dashboard, abre la pagina Chat y envia:

```text
security report
```

Salida esperada: el mismo formato de reporte VPS mostrado en el Paso 5.

## Solución de problemas

### Servicio no arranca

Revisa el estado del servicio:

```bash
systemctl status korvin.service --no-pager
systemctl status korvin-dashboard.service --no-pager
systemctl status litellm.service --no-pager
```

La salida esperada para un servicio sano incluye:

```text
Active: active (running)
```

Revisa logs recientes:

```bash
journalctl -u korvin.service -n 80 --no-pager
journalctl -u korvin-dashboard.service -n 80 --no-pager
journalctl -u litellm.service -n 80 --no-pager
```

Después de corregir el problema, reinicia todos los servicios:

```bash
systemctl restart litellm.service korvin-dashboard.service korvin.service
systemctl is-active litellm.service korvin-dashboard.service korvin.service
```

Salida esperada:

```text
active
active
active
```

### El bot no responde

Verifica el token de Telegram sin imprimir el token:

```bash
set -a
. /etc/korvin.env
set +a
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

Salida esperada:

```json
{"ok":true,"result":{"id":123456789,"is_bot":true,"first_name":"Your Bot","username":"your_bot"}}
```

Si `ok` es `false`, crea un token nuevo en @BotFather, edita `/etc/korvin.env` y `/home/korvin/korvin/config.json`, luego reinicia:

```bash
systemctl restart korvin.service
systemctl is-active korvin.service
```

Salida esperada:

```text
active
```

### Errores de LiteLLM

Revisa LiteLLM a través del proxy local:

```bash
set -a
. /etc/korvin.env
set +a
curl -s http://127.0.0.1:4000/v1/models -H "Authorization: Bearer ${LITELLM_MASTER_KEY}"
```

Salida esperada: JSON con una lista `data` de modelos.

Revisa logs:

```bash
journalctl -u litellm.service -n 120 --no-pager
```

Arreglo común después de actualizar keys de proveedor en `/etc/korvin.env`:

```bash
systemctl restart litellm.service korvin-dashboard.service korvin.service
systemctl is-active litellm.service korvin-dashboard.service korvin.service
```

Salida esperada:

```text
active
active
active
```

### El dashboard devuelve 403

La API del dashboard requiere el `KORVIN_API_KEY` de `/etc/korvin.env`. La página incluida del dashboard inyecta esta key automáticamente cuando FastAPI la sirve. Si las llamadas API devuelven 403, recarga la página desde la URL del dashboard y reinicia el servicio del dashboard:

```bash
systemctl restart korvin-dashboard.service
systemctl is-active korvin-dashboard.service
```

Salida esperada:

```text
active
```

### El dominio del dashboard no carga

Primero verifica el dashboard local en el VPS:

```bash
curl -s http://127.0.0.1:3002/api/status
```

Salida esperada:

```json
{"korvin":"online","version":"0.1.1","memory":"sqlite"}
```

Si local funciona pero el dominio falla, corrige el target de Cloudflare Access, tunnel o reverse proxy para que apunte a:

```text
http://127.0.0.1:3002
```
