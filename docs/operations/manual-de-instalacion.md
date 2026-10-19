# Manual de instalación y operación (RNF-16)

Para quien despliega SIRAI en un servidor. Describe la instalación con Docker, la primera puesta en marcha,
el primer administrador, la actualización y los respaldos. Lo que depende de la infraestructura del cliente
(dominio, certificado, balanceador, respaldos del servidor) está marcado como **a definir con el cliente**.

## 1. Qué se instala

| Pieza | Qué es | Puerto |
| --- | --- | --- |
| `mysql` | MySQL 8.4 con la base `sirai` | 3306 (solo local) |
| `migrate` | Trabajo de un disparo: aplica las migraciones SQL y termina | — |
| `api` | API NestJS (Node 22) | 3000 (solo dentro de la red de Docker) |
| `web` | nginx con la aplicación web; reenvía `/api` a la API en el mismo origen | 8080 |

La única entrada es nginx. Delante debe ir un **balanceador o proxy con HTTPS** (a definir con el cliente). La web es una PWA:
guarda en la tablet lo capturado sin conexión (`docs/operations/protocolo-caida-de-enlace.md`).

## 2. Requisitos

- Servidor Linux con Docker 24+ y Docker Compose v2.
- 2 CPU, 4 GB de RAM y 20 GB de disco como mínimo para la pila completa (la prueba de carga con 212 estancias,
  `docs/operations/prueba-de-carga.md`, se midió con más holgura; ajusta con tu infraestructura).
- Un dominio y un certificado HTTPS. Las cookies de sesión exigen HTTPS en producción.
- Acceso a las imágenes en GHCR (`ghcr.io/team-isstech/ebdi-asistencia-api` y `-web`), o el código para construirlas.

## 3. Primera instalación

```bash
git clone https://github.com/Team-ISSTech/EBDI-asistencia.git sirai && cd sirai
cp .env.example .env
```

Edita `.env`. Para producción **todas** estas variables son obligatorias o cambian de valor:

| Variable | Valor en producción |
| --- | --- |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` (la API se niega a arrancar sin esto) |
| `DATA_ENCRYPTION_KEY` | Llave propia: `openssl rand -hex 32`. **Respáldala por separado**: sin ella los datos cifrados no se recuperan. No puede ser la de ejemplo. |
| `API_TOKEN_SECRET` | Otra llave: `openssl rand -hex 32`, distinta de la anterior |
| `PRIVACY_NOTICE_VERSION` | La versión vigente del aviso de privacidad, que confirma el área jurídica |
| `SEED_DEV_DATA` | `false`. La semilla crea cuentas `@sirai.test` con una contraseña conocida y nunca debe correr aquí |
| `WEB_PORT` | Puerto publicado en el servidor (8080 por defecto) |

Valores opcionales que conviene revisar: `SESSION_TTL_HOURS` (12), `SESSION_MAX_HOURS` (72), `LOGIN_MAX_ATTEMPTS` (5),
`LOGIN_LOCK_MINUTES` (15), `TEMP_PASSWORD_DAYS` (7), `DB_POOL_SIZE` (25) y, si el cliente la proporciona, la cuenta de
WhatsApp Business (`docs/operations/avisos-whatsapp.md`). Los secretos van en un gestor de secretos o en un `.env` con
permisos `600`, nunca en Git.

En un servidor, cambia además las credenciales de MySQL de `docker-compose.yml` (`root`/`sirai`) por unas propias.

Levanta la pila:

```bash
docker compose pull
docker compose up -d
docker compose ps          # mysql, api y web deben quedar «healthy»; migrate, «exited (0)»
curl -fs http://localhost:8080/api/health     # {"status":"ok","db":"up",...}
```

`migrate` aplica `packages/db/sql/*.sql` en orden y es **repetible**: volver a correrlo no cambia nada ya aplicado.

## 4. Crear el primer administrador

En producción la base queda sin usuarios. El primer Administrador Central se crea con un comando de un solo uso:

```bash
docker compose run --rm \
  -e ADMIN_EMAIL=nombre@institucion.gob.mx -e ADMIN_NAME="Nombre Apellido" \
  migrate node node_modules/@sirai/db/dist/cli/create-admin.js
```

Imprime una **contraseña temporal una sola vez** (cópiala en ese momento; no se guarda en claro). Esa contraseña caduca en
`TEMP_PASSWORD_DAYS` días y se cambia al primer inicio de sesión. Si ya existe un administrador, el comando se niega: no sirve
como puerta trasera. Si se perdió la contraseña antes de entrar y el despliegue es nuevo, recrea la base (`docker compose down -v`, que borra
todo) y repite el comando; con datos ya cargados, pide ayuda a desarrollo en lugar de tocar la base a mano.
(Opcionalmente puedes fijar la contraseña con `-e ADMIN_PASSWORD=...`; también será temporal.)

> Comprobado con el CLI compilado y el inicio de sesión de la API. La imagen de GHCR lo incluye a partir de la
> publicación que contiene este cambio.

## 5. Dar de alta la operación

Con el administrador dentro de la aplicación (`https://<dominio>`; guía en `manual-de-usuario.md`):

1. **Ciclos escolares**: abrir el ciclo vigente.
2. **Estancias**: crear las 212 con su clave EBDI, nombre, región y zona horaria. Una alta masiva por archivo no existe todavía;
   si se requiere, es una tarea aparte (a definir con el cliente).
3. **Usuarios**: crear a la directora de cada estancia (contraseña temporal; la persona la cambia al entrar). Las directoras
   dan de alta salas, infantes y tutores, y el administrador crea al resto del personal.
4. **Sistemas** (opcional): registrar los tableros externos que consumirán la API con token (RF-37).

Nunca se cargan datos reales de menores en entornos de prueba.

## 6. Actualizar

```bash
git pull
docker compose pull          # o: docker compose up --build -d para construir en el servidor
docker compose up -d         # migrate corre solo y aplica las migraciones nuevas
docker compose ps
```

Las migraciones son aditivas y se aplican antes de que arranque la API nueva. **Respalda la base antes de cada
actualización.** Una versión nueva de la web no recarga las tablets a media captura: se aplica cuando se cierran las pestañas.

## 7. Respaldos y restauración

Responsabilidad de la operación (a definir con el cliente: frecuencia, retención, dónde se guardan).

```bash
# Respaldo (volcado consistente de la base)
docker exec sirai-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers sirai' | gzip > sirai-$(date +%F).sql.gz

# Restauración en una base vacía
gunzip -c sirai-AAAA-MM-DD.sql.gz | docker exec -i sirai-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" sirai'
```

- El respaldo contiene datos de menores: **cífralo** y guárdalo fuera del servidor.
- Respalda **`DATA_ENCRYPTION_KEY`** aparte. Un respaldo sin su llave tiene teléfonos, notas y la bitácora ilegibles.
- Prueba la restauración en un entorno aparte antes de necesitarla.

## 8. Operación diaria

| Qué | Cómo |
| --- | --- |
| Estado | `docker compose ps` y `GET /api/health` |
| Registros | `docker compose logs -f api` (no contienen consultas ni datos de menores) |
| Bitácora de auditoría | Pantalla «Auditoría» del administrador central |
| Tickets de ausencia | El proceso de la API los abre cada `FOLLOW_UP_JOB_SECONDS` (60 s); no hay nada que programar |
| Avisos de emergencia | Tabla `avisos_emergencia`; pendientes hasta que se configure WhatsApp |
| Cierre de ciclo | Pantalla «Ciclos escolares»; depurar un ciclo (a los 5 años) es irreversible |
| Tablet perdida | Restablecer la contraseña de la cuenta (cierra sus sesiones); ver el protocolo de caída de enlace |

## 9. Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `api` no arranca y dice «COOKIE_SECURE» o «DATA_ENCRYPTION_KEY» | Con `NODE_ENV=production` esas variables son obligatorias y no pueden ser las de ejemplo |
| `migrate` falla con «SUPER privilege» | MySQL necesita `--log-bin-trust-function-creators=1` (ya viene en el compose) |
| Puerto 3306 ocupado | Cambia `MYSQL_PORT` en `.env` |
| Todos los intentos de login muestran la misma IP o se bloquean juntos | Detrás de un balanceador, ajusta `set_real_ip_from` en `apps/web/nginx.conf` para que la API vea la IP real |
| La web carga pero no inicia sesión | Falta HTTPS con `COOKIE_SECURE=true`: el navegador descarta la cookie |
| Una tablet no envía sus capturas | Revisa «Capturas por revisar» en la propia tablet; ver `protocolo-caida-de-enlace.md` |

## 10. Lista de verificación antes de operar con datos reales

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, `SEED_DEV_DATA=false`.
- [ ] Llaves propias (`DATA_ENCRYPTION_KEY`, `API_TOKEN_SECRET`) respaldadas en un gestor de secretos.
- [ ] `PRIVACY_NOTICE_VERSION` confirmada por jurídico.
- [ ] HTTPS y HSTS en el balanceador; credenciales de MySQL cambiadas.
- [ ] Respaldos cifrados programados y restauración probada.
- [ ] Prueba de penetración externa (`docs/operations/revision-de-seguridad.md`).
- [ ] Prueba de carga repetida en esta infraestructura (`docs/operations/prueba-de-carga.md`).
- [ ] Protocolo de caída de enlace validado con el cliente y las estancias.
