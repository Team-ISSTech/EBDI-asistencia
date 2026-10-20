# Revisión de accesibilidad (A03, RNF-14)

Las pantallas de SIRAI son los prototipos de interfaz que pide RNF-14: se revisan en un
navegador real, por rol, con la prueba `apps/web/e2e/accessibility.spec.ts`. Sigue las acciones
de mejora del reporte de accesibilidad del equipo (2026-09-30): etiquetas en todos los campos,
contraste de al menos 4.5:1, estructura con encabezados y regiones, y uso con teclado.

## Qué comprueba

| Revisión | Cómo | Resultado |
| --- | --- | --- |
| **Reglas WCAG 2.1 A y AA** (etiquetas, contraste, nombres accesibles, idioma, encabezados, regiones). | axe-core sobre el inicio de sesión, el selector de estancia y cada pantalla del menú de los 7 roles de la semilla, con datos en la lista del día. | **Corregido.** Dos colores no llegaban a 4.5:1: el texto secundario (`--color-ink-muted`, 4.27:1 sobre papel), que aparece arriba del título en todas las pantallas, y el texto de error (`--color-danger`, 4.3:1 sobre su fondo rosado), en el semáforo de Reportes. Se oscurecieron sin cambiar el tono; ahora pasan de 4.6:1. |
| **Teclado.** | Inicio de sesión y pase de lista completos solo con Tab y Enter. | Cumple. |
| **Foco visible.** | Se compara la imagen del botón con y sin foco; si son iguales, la prueba falla. | Cumple (regla global `:focus-visible` y anillo de los botones). |

Cada revisión se vio fallar antes de aceptarla: con los colores anteriores fallan las de
contraste, y sin la regla `:focus-visible` ni el anillo de los botones falla la de foco.

## Cómo correrla

Igual que las demás pruebas e2e (`docs/operations/pruebas-sin-conexion.md`): base vacía y
sembrada, API en el puerto 3100 y la web compilada.

```bash
E2E_WEB_URL=http://localhost:4173 pnpm --filter @sirai/web exec playwright test e2e/accessibility.spec.ts
```

## Lo que no cubre

- Formularios y paneles que se abren con un botón (alta de infante, nuevo usuario, registrar
  llamada): axe revisa la pantalla tal como carga. Revisarlos a mano con un lector de pantalla
  antes del UAT.
- Lectores de pantalla reales (NVDA, VoiceOver) y zoom al 200 %: quedan para la revisión manual.
- Pantallas que solo aparecen en situaciones especiales: cambio de contraseña obligatorio,
  capturas rechazadas sin conexión y sin permiso.
