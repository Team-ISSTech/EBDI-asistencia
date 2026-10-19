# Revisión de seguridad (RNF-06)

Revisión hecha por el equipo de desarrollo sobre el código de la API y la web. **No sustituye una
prueba de penetración externa**, que debe contratarse antes de operar con datos reales de menores.

## Qué se revisó y qué se encontró

| Área | Resultado | Evidencia |
| --- | --- | --- |
| **Autorización por ruta.** Ninguna ruta queda sin declarar `@Public`, `@Authenticated`, `@RequirePermission` o `@RequireScope`. | Cumple. Las 63 rutas declaran exactamente una; las únicas públicas son el login, el canje de token de un sistema y `/health`. | `route-authorization.test.ts` (falla si se añade un controlador sin registrarlo o una ruta sin marca) |
| **Acceso entre estancias (IDOR).** Con la estancia A activa, conocer un identificador de la B no da acceso. | Cumple. Se probaron 19 rutas con identificadores de la estancia B (infante, tutor, teléfono, consentimiento, jornada, seguimiento, expediente, sala), más la sincronización sin conexión y el pase de lista con una inscripción ajena: todas responden 403/404, no filtran datos y no modifican nada. La directora de prueba tiene rol en ambas estancias a propósito. | `cross-estancia.int.test.ts` |
| **Separación persona / sistema.** Un token de sistema no sirve donde sirve una sesión, ni al revés. | Cumple. | `guards.test.ts`, `integration.int.test.ts` |
| **Inyección SQL.** | Cumple. Todo acceso usa Drizzle con parámetros; los `sql` sueltos solo comparan columnas o fechas, sin texto del usuario. | revisión del código (`grep` de `sql\`` y `execute`) |
| **Validación de entradas.** | Cumple. Todo cuerpo pasa por un esquema zod compartido con la web. | revisión del código |
| **Sesión y credenciales.** | Cumple. Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción; token aleatorio guardado solo como hash SHA-256; contraseñas con argon2id; bloqueo por intentos; respuesta y tiempo iguales con un correo inexistente; límite de intentos por IP en el login. | `identity.int.test.ts`, `password.int.test.ts` |
| **CSRF.** | Cumple por diseño: la cookie es `SameSite=Strict`, CORS solo admite el origen de la web y las rutas con efectos no aceptan formularios. | `app.setup.ts` |
| **Errores y registros.** | Cumple. Las respuestas 5xx no revelan detalle y el registro del servidor omite la consulta y sus parámetros. | `errors-and-validation.test.ts` |
| **Datos sensibles.** | Cumple. Teléfonos, notas y observaciones médicas cifrados con AES-256-GCM; la bitácora cifra sus diferencias y no guarda valores; el texto de los avisos de emergencia no nombra al menor. | `encryption.test.ts`, `audit.int.test.ts` |
| **Cabeceras de la API.** | **Corregido.** Faltaban. Ahora cada respuesta lleva `Cache-Control: no-store`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, una CSP que no permite nada y, con HTTPS, HSTS. No se anuncia Express. | `security-headers.test.ts` |
| **Cabeceras y CSP de la web.** | **Corregido.** nginx solo tenía tres cabeceras. Se añadió una CSP que admite únicamente recursos propios (sin scripts ni estilos en línea, sin terceros) y una política de permisos que deja la cámara solo a la propia aplicación (lector de matrículas). Verificado en un navegador real contra nginx: sin violaciones en las pantallas principales y la captura sin conexión (Service Worker incluido) sigue funcionando. | `nginx-headers.test.ts`, prueba e2e manual |
| **Interbloqueo al iniciar sesión.** | **Corregido.** Dos inicios de sesión simultáneos de la misma cuenta producían un 500 (interbloqueo de MySQL). Se serializan por cuenta y la transacción se repite si MySQL la elige como víctima. Sin esto, una tablet compartida o una carga alta fallaban al azar. | `identity.int.test.ts`, `retry-on-deadlock.test.ts` |
| **Dependencias.** | **Corregido.** `pnpm audit` reportaba 3 avisos (1 alto en una herramienta de pruebas, 1 moderado en producción por `uuid` dentro de `exceljs`, 1 bajo). Se fijaron versiones corregidas y quedó en cero. Desde ahora CI falla si aparece uno alto o crítico. | `.github/workflows/ci.yml`, `pnpm-workspace.yaml` |

## Lo que no se cubrió o queda a cargo de quien despliega

- **Prueba de penetración externa** y revisión de la infraestructura: pendiente de contratar.
- **TLS y HSTS en producción:** los termina el balanceador. La API envía HSTS cuando `COOKIE_SECURE=true`; en nginx
  debe añadirse donde se termine el HTTPS.
- **Límite de peticiones:** hoy solo el login (por IP) y los sistemas externos (por sistema) tienen límite. El resto de
  rutas depende del balanceador o de un WAF. Se evaluará con la prueba de carga (RNF-08).
- **Secretos:** `DATA_ENCRYPTION_KEY`, `API_TOKEN_SECRET` y el token de WhatsApp deben ir en un gestor de secretos; no hay
  rotación automática de llaves. Cambiar `DATA_ENCRYPTION_KEY` exige recifrar los datos.
- **Segundo factor** para el administrador central: no está en el alcance del documento del cliente; se recomienda.
- **Copias de seguridad cifradas** y su restauración: son responsabilidad de la operación.
- **Cuenta perdida:** restablecer la contraseña cierra las sesiones, pero lo que haya quedado en la tablet sin conexión
  (cifrado, ver S-25) no se borra de forma remota.

## Cómo repetir la verificación de la CSP en un navegador real

1. Compilar la web con `VITE_API_URL=/api pnpm --filter @sirai/web exec vite build` y levantar la API en el puerto 3000.
2. Servir `apps/web/dist` con la imagen `nginxinc/nginx-unprivileged` y `apps/web/nginx.conf` (la pila `docker compose up`
   ya lo hace).
3. Abrir la aplicación con las herramientas del navegador: la consola no debe mostrar «Refused to …» ni
   «Content Security Policy». Ejecutar también `apps/web/e2e/offline-capture.spec.ts` apuntando a esa URL
   (`E2E_WEB_URL`, `E2E_API_URL=<url>/api`); el procedimiento y la base de pruebas están en `pruebas-sin-conexion.md`.
