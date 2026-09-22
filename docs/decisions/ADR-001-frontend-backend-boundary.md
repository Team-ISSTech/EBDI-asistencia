# ADR-001: Separar frontend y backend dentro del monorepo

- Estado: aceptada
- Fecha: 2026-09-21

## Contexto

SIRAI requiere una interfaz tolerante a conectividad intermitente y una API que proteja datos sensibles, aplique permisos y conserve auditoría. Compartir repositorio simplifica el desarrollo, pero mezclar ambos entornos produciría dependencias inseguras y despliegues acoplados.

## Decisión

Se mantendrán dos aplicaciones independientes: `apps/web`, construida con React y Vite, y `apps/api`, construida con NestJS. Se comunicarán solamente mediante HTTP REST. Los contratos públicos se compartirán desde `packages/contracts`.

## Consecuencias

- Frontend y backend pueden probarse, construirse y desplegarse por separado.
- La web no accede al paquete de base de datos ni a módulos internos de la API.
- Será necesario validar automáticamente la dirección de dependencias durante la siguiente fase.
