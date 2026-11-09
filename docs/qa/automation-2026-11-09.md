# Automatización de smoke y regresión — 2026-11-09

Base: `59ff653` (Free 0.0.21). Implementación y revisión en el PR que contiene
este archivo. No hay cambios al código de ejecución de la extensión ni a sus
dependencias; se incorporan ejecutor, recorridos y documentación de QA.

## Validación

- `npm run test:pr`: 471 tests Vitest, 42 tests Node de paquete/lectores y 2
  tests del transporte/parseo MCP; 10 controles de seguridad más política/lint;
  build y empaquetado; auditoría sin vulnerabilidades; 53 comprobaciones de
  navegador aprobadas.
- Revisión adicional del caso de operaciones: comprobó los cuatro campos del
  texto copiado, incluido el vencimiento con formato Argentina seleccionado.
- Control negativo: se cambió temporalmente un resultado esperado del caso de
  apertura. El comando devolvió 1, JSON indicó `complete: false`, registró un FAIL
  y creó una captura de la fixture. Se restauró el test antes del commit.
- Ejecuciones por grupo aparecen como PARTIAL en JSON/Markdown y no se presentan
  como una regresión completa. El reporte enumera suites esperadas y completadas.
- El launcher compartido verificó el perfil ChuchoTriz y conectó su servidor MCP.
  Los recorridos usaron una pestaña local propia, datos ficticios y el bundle
  de producción. Cerraron esa pestaña y su servidor local; dejaron el navegador
  compartido abierto. Sin lectura ni modificación de cuentas reales.

Los logs/reportes detallados se generan en `test-results/qa-*/`, ignorados en
Git. Cada reporte incluye el commit, indicador de árbol modificado, versión y
hash del ZIP probado. La evidencia generada durante desarrollo identifica el
árbol como modificado; no atribuye los cambios todavía sin commit al SHA base.

## Cobertura y límites

La [guía actualizada](../manual-regression.md) mapea los 20 casos originales a
los grupos automáticos. Incluye los antes pendientes: remount/foco, RAW,
configuración de columnas, tooltips, zoom, contabilidad y nominales, cuentas y
vencimientos, rolado, límites, errores/recuperación y geometría/teclado.

La ejecución anterior del 8 de noviembre sigue siendo un registro histórico;
sus NOT RUN no describen la cobertura automática actual. No se reescribió ese
reporte ni se reclasificaron sus observaciones de Matriz.

Siguen siendo necesarias la comprobación de la extensión instalada contra
Matriz real, el contraste de datos durante rueda y la inspección visual humana.
Las fixtures no prueban frescura del mercado, aceptación de órdenes ni
compatibilidad con cambios futuros del sitio. No se enviaron, modificaron ni
cancelaron órdenes reales.
