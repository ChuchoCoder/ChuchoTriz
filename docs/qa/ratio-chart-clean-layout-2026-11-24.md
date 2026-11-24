# Gráfico de ratios: diseño limpio y línea blanca

Fecha: 24/11/2026. Base: `ed4628e` (candidato con futuros como C).

## Diagnóstico

Cocos inicializa TradingView con `load_last_chart: true`. Una pestaña nueva
de AL30 heredó nueve estudios, incluidas comparaciones y Ratio ajenos. El lector
conservaba esos estudios por el contrato anterior; no era una duplicación de
filas de la grilla. Además dejaba el color predeterminado del indicador.

Reproducción antes del cambio:
`node --test --test-name-pattern 'inherited default|explicitly white' scripts/ratio-chart-reader.test.mjs`.
Dos FAIL: cinco estudios en lugar de dos y color no configurado en blanco.

La observación de una carga nueva de Cocos confirmó la secuencia: widget no listo
sin estudios, widget no listo con los nueve estudios restaurados, widget listo
con esos nueve estudios. La limpieza espera el estado listo y ocurre después de
establecer el intervalo, de modo que no precede a esa restauración inicial.

## Cambio

Al abrir desde la grilla se limpian estudios y dibujos de esa instancia del
gráfico con los métodos nativos. Se agregan sólo Ratio(close, B) y la comparación
B o C. El Ratio se configura explícitamente como línea blanca #FFFFFF, sin
transparencia. Se conservan velas de cinco minutos y ejes numéricos.
Un reintento reconstruye el par sin acumular estudios. La identidad exacta,
cancelación por navegación y limpieza de creaciones incompletas se mantienen.

No se modifican opciones globales de TradingView, almacenamiento ni diseños
guardados. No se invocan métodos de guardado ni borrado de diseños. Si falta la
capacidad de limpiar, se informa el error sin agregar estudios a un diseño sucio.

APIs de referencia: [removeAllStudies y removeAllShapes](https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.IChartWidgetApi/),
[estilo nativo de Ratio](https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.RatioIndicatorOverrides/).

## Validación

- `npm test`: 583 Vitest, 95 lectores/paquete Node y 2 transporte PASS.
- `npm run security:check`: política, lint y 14 pruebas PASS.
- `npm run package:free`: fuentes, TypeScript, build, dist y ZIP PASS.
- Lector del gráfico: 19 tests PASS; incluyen el diseño heredado, estilos,
  reintentos, capacidades ausentes, restauración al fijar intervalo y otra
  instancia de gráfico que conserva sus estudios y dibujos.
- Playwright gráfico: 34 comprobaciones PASS con bundle y lector de producción,
  sobre datos sintéticos. Verifica limpieza y blanco en las tres grillas.
- Playwright futuros: 8 comprobaciones PASS, conservando C, recargas y gráfico.

Conexión al perfil compartido comprobada mediante launcher -CheckOnly. En una
pestaña nativa propia de Cocos se ejecutó el lector compilado, sin instalar el
candidato: de nueve estudios heredados quedaron exactamente Overlay y Ratio,
sin dibujos visibles. Ratio confirmado con source close, symbol2 AL30D,
estilo lineal, #FFFFFF y transparencia 0. Se comprobaron B=AL30D y C=DLR/DIC26,
ambos en escala numérica; resolución 5 y chartType 1.

En esa pestaña de prueba se interceptaron las capacidades de persistencia para
impedir escrituras: cero intentos. La lista de diseños y el contenido del último
guardado permanecieron iguales. La comprobación posterior mantuvo sólo dos
estudios; al cerrar la pestaña y abrir otra normal reaparecieron los nueve del
diseño original. No se guardó un gráfico de prueba ni se enviaron órdenes.

Estos resultados acreditan la configuración nativa, no la cobertura ni calidad
del histórico del broker. Sólo se cerraron las pestañas y el servidor propios.
El navegador compartido se conservó. Build local sobre versión 0.0.29; el release
publicado 0.0.29 no incluye este cambio.
