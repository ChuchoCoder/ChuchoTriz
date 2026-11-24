# Futuros como referencia C — 24/11/2026

Base: main `18e6fa599532b606215d9ccd0c73c13e3cb2caf5` (Free 0.0.29).
El cambio admite futuros A3 de CFI FXXXSX/FXXXXX en los lectores del Monitor
y del widget. Su plazo nativo puede ser null; se describe como Futuro,
sólo monitor. Conserva ID, símbolo y moneda. Lee último y referencia diaria
sin aplicar el multiplicador del contrato y sin sustituir otro vencimiento.

## Evidencia nativa de catálogo

Conexión ChuchoTriz comprobada con launcher -CheckOnly, servidor Playwright
compartido. Observación de sólo lectura en sesiones autenticadas de reMarkets
y Cocos: los contratos DLR/NOV26 y DLR/DIC26 tienen identidad A3 nativa,
CFI FXXXSX y settlementType null; el catálogo también contiene futuros FXXXXX.
El tamaño de contrato publicado es 1000 para los DLR observados.
En Cocos, DIC26 tenía último y referencia; NOV26 no tenía último en la muestra.
No se modificaron los catálogos ni registros reales para la observación.

## Pruebas del candidato

- `npm test`: 583 Vitest, 91 lectores/paquete Node y 2 transporte PASS.
- `npm run security:check`: política, lint y 14 pruebas PASS.
- `npm run package:free`: fuentes, TypeScript, build, dist y ZIP PASS.
- `tools/validate-ratio-futures.playwright.js`: 8 comprobaciones PASS sobre el
  bundle de producción y sus lectores, en loopback con datos sintéticos.
- Se eligió NOV26 en el widget, se guardó, se recargó la página y se comprobó
  el cambio de precio. La ausencia de último retiró el ratio calculado.
- Se eligió DIC26 en Monitor, se guardó y se recargó. La fila quedó sólo monitor.
  El gráfico abrió C como Overlay izquierdo numérico, con velas de cinco minutos.
- Los tests de lectores también excluyen productos/portfolios, rechazan futuros
  con metadatos incompletos y verifican que se suscriba sólo a md para referencias.

La prueba del gráfico usa la API nativa simulada del fixture; no acredita series
históricas reales de futuros ni una instalación de este candidato en Chrome.
La compilación local conserva el número 0.0.29; el release publicado 0.0.29 no
incluye este cambio. No se enviaron ni cancelaron órdenes. Sólo se cerraron la
pestaña y el servidor del fixture, conservando el navegador compartido.
