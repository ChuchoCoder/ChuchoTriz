# Apertura de gráficos nativos de ratios — 23/11/2026

Base: `4040034b84601719c4d87fa0f77f68c24bc2043c` (main, PR #84).
Rama de implementación: `codex/ratios-native-history`.

## Comportamiento entregado

- Icono por fila en widget Ratios, Monitor y Operaciones abiertas.
- Pestaña nueva del mismo sitio, sin acceso a la pestaña de origen.
- IDs exactos de A/B, conservando sentido y liquidación. Rechazo de símbolos
  que el resolvedor nativo no puede distinguir de otro mercado/liquidación.
- A en velas de 5 minutos con eje derecho numérico; indicador nativo Ratio
  sobre cierres de A/B en escala numérica.
- B como Overlay en un nuevo eje izquierdo numérico. Si hay C, Overlay de C
  en lugar de B, y aviso explícito: el indicador sigue siendo A/B sin dividir por C.
- Reutilización de estudios coincidentes y visibilidad de los solicitados;
  conservación de estudios ajenos. Retiro de creaciones nuevas ante error o
  cancelación. Aviso retirado al navegar dentro de Matriz.
- Sin guardado de layouts ni envío/cancelación de órdenes.

## Prueba previa a implementar, solicitada por el usuario

Se verificó conexión del perfil compartido ChuchoTriz mediante el launcher
`-CheckOnly` y se reutilizó el MCP Playwright existente.

En reMarkets 4.23.16, se abrió otra pestaña con AL30D principal y se ejecutó
la creación nativa de Ratio con `source: close`, `symbol2: AL29`.
El estudio quedó con `loading: false`, `dataLength: 72`, estado tipo 2.
Esto confirmó el caso inverso al ejemplo original antes de implementar.

## Comprobaciones con Matriz real

Página nativa de AL29 con `interval=5`:

1. Creación manual por API de Overlay AL30D con `priceScale: new-left`;
   escala `getMode() === 0`, principal `chartType() === 1`, resolución `5`.
2. Misma configuración con DLR/SPOT como Overlay y Ratio con AL30D.
3. Se ejercitó el archivo **de producción** `ratio-chart-reader.js` servido
   desde el build local y cargado como script en una pestaña nativa de prueba.
   La respuesta confirmó `{a: AL29, b: AL30D, comparison: DLR/SPOT}`;
   el Overlay quedó visible en pane 0/eje izquierdo/modo 0 y Ratio visible
   en pane 1 con `source: close`, `symbol2: AL30D`, modo 0.
4. Otra petición sin C confirmó `comparison: AL30D`, Overlay izquierdo
   numérico, velas y resolución de 5 minutos, conservando los demás estudios.

Las primeras pruebas intradiarias recibieron HTTP 429 de las series de reMarkets.
En la última prueba del archivo de producción se bloquearon **sólo en esa pestaña**
las lecturas de series, para evitar más consultas mientras se verificaba el API
del gráfico real. Por lo tanto esa prueba acredita configuración, no disponibilidad
ni corrección de precios intradiarios. No se sustituyeron las series por precios
ficticios en el broker. Las pestañas temporales se cerraron normalmente y las
pestañas originales quedaron abiertas. No se cambió la extensión instalada.

## Pruebas con datos sintéticos y paquete completo

Servidor: `node tools/ratios-fixture.mjs`, en loopback, perfil compartido.

- `tools/validate-ratios-widget.playwright.js`: **73 comprobaciones PASS**.
  Incluye cálculos, referencias, persistencia, inversión, editor, distintos
  dashboards, columnas, teclado y ancho mínimo.
- `tools/validate-ratio-chart.playwright.js`: **26 comprobaciones PASS**.
  Usa el bundle compilado, el arranque real de RatioChart y el lector de
  producción con un gráfico nativo simulado. Comprueba iconos por fila,
  clic/pestaña nueva, noopener, identidad, cinco minutos, velas, modo numérico,
  Overlay B/C, aviso de C, conservación de configuración, navegación SPA y
  acceso desde Monitor y Operaciones.
- Inspección visual del Monitor: iconos legibles de 24×24 px en cada fila,
  sin errores de la grilla.

## Pruebas automatizadas y revisión

- `npm test`: 571 tests Vitest, 78 tests Node de lectores/paquete y 2 de transporte.
- `npm run security:check`: política, 14 tests y lint de seguridad.
- `npm run package:free`: TypeScript, build y verificaciones de fuentes/dist.
- Revisión independiente: aprobada tras corregir seguimiento de navegación SPA
  y visibilidad de estudios guardados. Revisor reejecutó 9 tests del lector y
  5 del componente sin fallos.

## Límites

La fórmula con C no se grafica como `(A/B)/C`: se mantiene A/B y se compara C,
según la elección explícita del usuario. Las escalas se inicializan en números;
el usuario conserva los controles nativos para modificarlas después.
La cobertura y límites del histórico pertenecen al broker. El lector depende
de la instancia React de TradingChart y comprueba su contrato por versión;
la prueba nativa se realizó en reMarkets 4.23.16, sin presumir cobertura de datos
en otro broker. La entrega es un paquete candidato sin publicación ni instalación.
