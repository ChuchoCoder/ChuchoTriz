# Copia de la fecha de operación — 2026-11-24

Base: `bbccd84` (main). Código funcional revisado: `39d18b4`.
Datos ficticios; sin operaciones ni reportes reales.

La grilla mostraba `format.date(row.timestamp)`, pero la primera columna del
TSV usaba `format.expiration(row.expiration)`. La prueba de los botones reprodujo
16/11/2026 en pantalla y 18/12/2026 en el portapapeles, tanto agrupando como sin
agrupar. El ejemplo del selector de región no alimenta el TSV.

La copia ahora contiene Fecha de la operación, Cantidad, Strike y Precio.
Usa el mismo timestamp y formato que la fila visible; el encabezado sigue
mostrando el vencimiento. Al agrupar se conserva la fecha representativa que
ya muestra la grilla, sin modificar la agrupación ni sus promedios.

Validación:

- Prueba de regresión previa: 2 FAIL, con y sin agrupación.
- Pruebas focalizadas de operaciones: 26 PASS tras la corrección.
- `npm test`: 573 pruebas Vitest, 70 de lectores/paquete y 2 de herramientas PASS.
- `npm run security:check`: política, 14 pruebas de seguridad y lint PASS.
- `npm run package:free`: compilación y paquete local PASS; sin publicar ni instalar.
- Playwright MCP de usuario, perfil compartido ChuchoTriz: suite `operations`
  3 PASS (`SM-09`, `SM-09-formats`, `SM-09-format-storage`). Fixture local con
  solicitudes externas bloqueadas y `writeText` interceptado. Cuatro combinaciones
  de formatos, Calls/Puts/ambos y persistencia tras recargar; sin errores de página
  ni solicitudes externas. Solo se abrió y cerró la pestaña propia del fixture.
- Revisión independiente de código: sin hallazgos accionables.

La suite de navegador se ejecutó desde un envoltorio temporal mediante el MCP
existente porque el launcher/README de la ruta documentada no estaba disponible
en este entorno. La conexión al perfil compartido sí funcionó. No se usó otro perfil.
No se abrió Excel: la comprobación cubre el TSV entregado al portapapeles.

## Revisión posterior del PR #86

La primera ejecución remota de CI falló porque este informe se agregó después
de las comprobaciones locales y no estaba en `free-files.json`. Se revisó su
contenido y se autorizó únicamente esta ruta, sin ampliar las guardas.
Las comprobaciones de paquete se repiten con el informe ya incluido.
