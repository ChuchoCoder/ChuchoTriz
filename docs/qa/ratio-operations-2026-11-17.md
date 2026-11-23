# Operaciones de ratios — 17/11/2026

## Cierre de validación y revisión del PR #76

Se integró main `0044abf` (predeterminados del widget y corrección auditada de
picomatch), conservando el lector y los tests del tab Ratios. Se resolvieron
los conflictos de `free-files.json` y `package.json` por unión de ambos cambios.

La revisión encontró y corrigió un defecto: `min=1` con `step=10` invalidaba
cantidades como 100 y 110 en HTML aunque fueran múltiplos correctos del lote.
Desde `7612486`, mínimo y paso de Cantidad A usan el lote positivo configurado.
Se agregó un recorrido que acepta 100/110, rechaza 105 y guarda una apertura
con lote 10, comprobando su persistencia y eliminación en el fixture.

| Verificación final | Resultado |
| --- | --- |
| Vitest / lectores y contratos / QA infra | 547 + 64 + 2 = **613 PASS** |
| Widget: `validate-ratios-widget.playwright.js` | **37 PASS** |
| Tab: `validate-ratio-operations.playwright.js` | **18 PASS**, incluido lote 10 |
| Regresión general: `tools/qa/run.mjs` | **20 suites / 70 PASS**, reporte completo |
| Seguridad, lint, escaneos, build y paquete | PASS |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades**, incluidas herramientas |
| CI sobre la candidata funcional | Cuatro checks PASS |

Los tres recorridos de Playwright suman **125 comprobaciones**. Usaron el MCP
del perfil compartido Free, con el bundle de producción y datos sintéticos en
loopback. El reporte de regresión completo está en
`test-results/qa-2026-11-17T21-31-59-580Z/report.json` (`complete=true`, 0 FAIL).
Ese reporte identifica `fc9d880` con cambios locales: incluía la corrección de
lotes que luego se confirmó en `7612486`. La corrida unitaria local precedió
esa modificación del atributo HTML; CI también aprobó el commit corregido.
Los apartados inferiores conservan evidencia histórica; los antiguos avisos
de auditoría quedaron resueltos al integrar main.

### Standards

Revisión independiente contra `0044abf...fc9d880` de seguridad, privacidad,
allowlist, RPC, guardado y controles de contexto: **0 incumplimientos documentados
y 0 observaciones bloqueantes**. No se hallaron smells que justifiquen bloquear.

### Spec

Revisión independiente de conversación y `docs/ratios.md`: monitor, defaults,
dimensionamiento, objetivo, P&L, gastos, cierres, edición, cuentas y selección
de puntas cumplen el alcance. **0 hallazgos pendientes**. Una tercera revisión
contrastó 200 escenarios de cierres y gastos con flujos de caja independientes:
sin diferencias. Su hallazgo del input por lote quedó corregido y revalidado
para lotes nativos/manuales 1, 2, 3, 10 y 100; aprobación posterior para merge.

### Instalación y persistencia real en Cocos

- Free 0.0.25 de desarrollo, 24 archivos comparados por hash con dist. Respaldo:
  `Free/backups/extension-before-ratios-final-20261117-183417`.
- Se creó un widget temporal con siete pares predeterminados, se arrastró
  x=192→206, y se redimensionó 560×300→620×325. Al **cerrar la pestaña y volver
  a abrir la misma URL**, conservó identidad, siete pares, x=206/y=42 y 620×325.
- Se retiró por su identidad exacta y se cerró/reabrió otra vez para comprobar
  su eliminación persistida. Las 18 geometrías originales quedaron iguales.
  La configuración canónica de los otros widgets (instrumentos, filtros,
  settings y geometría, ordenada y sin identificadores volátiles de la página)
  conservó el hash `4bf34cc857845a04cedc55bd33387582fec441676ac931721d7af82e1d364464`
  entre la limpieza y la reapertura. Un hash del objeto bruto no es comparable:
  Matriz reordena el array y recrea metadatos al recargar.
- El tab conservó sus ocho pares. En BMA/GGAL se comprobaron las dos direcciones:
  Bid BMA 9.250 / Ask GGAL 4.850 y Ask BMA 9.330 / Bid GGAL 4.830; ambos precios
  de entrada coincidieron con las puntas resaltadas y los ratios 90,72%/93,17%.
- Las siete claves locales de la extensión conservaron exactamente el hash
  `b9ceb7a00a7b64b848d55d0ae72d2019d4202925ce0286d85c8158a371f4a72d`.
  No se tocaron operaciones existentes ni se registraron aperturas en el broker.
- Captura recortada de la candidata instalada: `test-results/ratios-final-cocos.png`.
  La sesión y las otras pestañas del navegador compartido permanecen abiertas.

Implementación en `codex/ratio-operations`, desde main `2351007`.
Compilación de desarrollo instalada sobre Free 0.0.25; no es una release publicada.

## Alcance

Tab Ratios: monitor → apertura manual → operaciones abiertas. Precios nativos,
dimensionamiento B por monto/lote/factor, comisión común inicialmente 0%, DDMM
por pata, objetivo de ratio, P&L neto por moneda, cierres parciales, edición,
eliminación/deshacer y almacenamiento local por cuenta/sitio. No transmite órdenes.

Los DDMM portan defaults de Premium `b12dbdaa`: ESXXXX/EMXXXX 0,0847%
(0,07% + IVA 21%), DBXXXX/DBXXFR 0,01%, DYXTXR 0,001%. Los tipos/mercados
sin regla exigen tasa manual. Ver procedencia y límites en `docs/ratios.md`.

## Pruebas automatizadas

- `npm test`: PASS, 533 Vitest + 59 contratos/lectores Node + 2 QA infra = 594.
  Incluye 19 tests nuevos de contabilidad, tasas, objetivos, unidades,
  almacenamiento concurrente y lectura/cambio de contexto.
- `npm run security:check`: PASS; 10 tests de política, política y lint.
- `npm run security:tools`: PASS, sin hallazgos en el escaneo ejecutado.
- `npm run package:free`: PASS, source/dist verificados, ZIP generado localmente.
- `git diff --check` y `git diff --cached --check`: PASS.
- `npm audit --omit=dev --audit-level=moderate`: PASS, 0 vulnerabilidades.
- `npm audit --audit-level=moderate`: FAIL heredado: 9 avisos high del árbol de
  desarrollo por picomatch (GHSA-fc5q-39xc-vjpf). El lock y las versiones de
  dependencias no cambiaron respecto de main. No se aplicó el downgrade mayor
  que propone `audit fix --force`. Por esto no se declara `test:pr` completo verde.

## Navegador compartido

Conexión MCP `playwright` verificada. La ruta AgentBrowsers indicada no existe;
`C:/Users/feder/ChuchoTrizProfiles/Free/Start-Browser.ps1 -CheckOnly` confirmó
ChuchoTriz Free, puerto 9335 y su directorio de datos. Se reutilizó esa sesión;
no se abrió un perfil aislado ni se cerró el navegador.

Bundle de producción servido en loopback con datos sintéticos, sin broker:

- Las 20 suites existentes (baseline + 19 grupos), 70 comprobaciones, PASS.
  Ejecutadas desde el MCP mediante wrappers de los validadores originales.
- `tools/validate-ratio-operations.playwright.js`: 7 recorridos PASS, con varias
  aserciones por recorrido: ticker exacto, precios/ratio, DDMM/size/puntas,
  entrada fija, apertura/cierre parcial/edición, borrar/deshacer/recarga,
  aislamiento de cuentas, bonos/FX/monedas y limpieza de registros cerrados.
- Persistencia de entradas, objetivos, cierres y revisiones probada al recargar.
  El P&L y las actualizaciones controladas se prueban en este fixture; no son
  confirmación de ejecuciones reales ni de aranceles actuales del broker.

Revisión independiente: tres P2 resueltos (lookup sin límite, borrado del draft
ante error transitorio, límite sin limpieza de historia). Segunda revisión sin
P1/P2 pendientes; los tests incorporados cubren recuperación y conservación.

## Instalación y observación en Cocos

- ID `gkbenbfcfpamhfppeepbbfcifnbglfhp`, ENABLED, carpeta
  `C:/Users/feder/ChuchoTrizProfiles/Free/extension`.
- Respaldo previo en `Free/backups/extension-before-ratio-operations-20261117-152110`.
  Se verificaron hashes de todos los archivos actuales del dist en destino.
  La limpieza de assets anteriores fue rechazada por política automática;
  se conservaron y se copiaron los actuales. El manifiesto referencia el bundle nuevo.
- Matriz Cocos 4.24.4, catálogo de 10.095 instrumentos. Sin errores nuevos de página.
- Selección por ticker al perder foco: BMA/GGAL, DDMM 0,0847% en ambas patas,
  comisión 0%, cantidad A=100 → B=192. Precios y puntas/cantidades nativos
  visibles, ratio porcentual de apertura correcto.
- Defaults comprobados en UI: AAL/CEDEAR 0,0847%, AE38/bono 0,01%,
  A11LD/ON 0,01%, B2D6C/letra 0,001%.
- Cinco muestras compararon últimos publicados contra la UI (BMA 9.070,
  GGAL 4.725); coincidieron. Durante esas muestras no cambió el último,
  por lo que no prueban reacción a una nueva operación de mercado.
- No se crearon registros de operaciones ni se alteraron cotizaciones en Cocos.
- Preferencias antes/después: mismas seis claves, SHA256 agregado
  `554de88b44cea158954131bc756670eaa340a2e0e60edfb26f38ab121fdc23e8`.
- Dashboard: geometría/configuración antes/después iguales, SHA256
  `5cad8f44019bd105612733163baad78f44a9106757abb6523bde0228a88ab544`.
  No se modificaron otros widgets.
- Se corrigió contraste de títulos sobre el tema oscuro nativo; color calculado
  de h2 y cuerpo `rgb(237,244,250)` en la instalación final.

Evidencia local ignorada: `test-results/ratio-operations-evidence.json` y
capturas recortadas al tab (sin balances, posiciones ni datos personales).
La captura de Cocos anterior al ajuste de contraste se conserva como diagnóstico.

## Actualización: ocho pares predeterminados

Se agrega inicialización persistida por cuenta con los ocho pares solicitados:
AL30/AL30D, AL30/AL30C, AL30D/AL30C, GD30/AL30, BMA/GGAL,
ALUA/TXAR, TGSU2/TGNO4, PESOS - 7D/PESOS - 1D. La migración agrega sólo
faltantes y conserva IDs/orden de filas existentes y registros de operaciones.
Un par quitado no vuelve al recargar; la restauración explícita agrega faltantes.
Las cauciones RPXXXX BYMA/ARS se muestran como TNA, con apertura deshabilitada
y rechazo adicional en el dominio: las tasas no se tratan como precios para P&L.

- `npm test`: PASS, **537 Vitest + 60 Node + 2 QA infra = 599**.
- `npm run security:check` y `npm run package:free`: PASS.
- Validador del bundle actualizado: **9 recorridos PASS**, incluyendo orden de
  los ocho pares, TNA, eliminación/recarga/restauración y cuentas separadas con
  defaults independientes. También conserva los recorridos de contabilidad.
- Revisión independiente de esta actualización: sin P1/P2; reejecutó 17 tests
  de modelo/storage/hook y 7 del lector.
- Cocos 4.24.4: ocho filas en el orden solicitado, persistidas tras recargar.
  Sin datos previos de operaciones; la inicialización guardó ocho pares y cero
  operaciones, con `watchDefaults: 1`.
- Lecturas nativas PESOS - 7D/PESOS - 1D confirmadas. En la verificación de
  consistencia, UI y referencia nativa coincidieron en 18,60 para PESOS - 1D;
  `getSecurity` y el catálogo devuelven la misma referencia. En las muestras
  anteriores el documento estaba `hidden` y los timers de polling se demoraron
  respecto de los mensajes nativos; se observó convergencia posterior. Cada
  ratio mostrado coincidió con las dos TNA mostradas, a dos decimales.
- Las seis preferencias previas mantienen el hash agregado
  `554de88b44cea158954131bc756670eaa340a2e0e60edfb26f38ab121fdc23e8`.
- Los 18 widgets del dashboard CEDEARs mantienen geometría/configuración:
  SHA256 `9d645070798d4a3d12a87134daa975c75516359243f0f759f044f704cf2a6d09`.
- Respaldo: `Free/backups/extension-before-default-ratios-20261117-154730`.
  Archivos instalados comparados por hash con el dist. Captura recortada local:
  `test-results/default-ratios-cocos.png`.

La advertencia de auditoría de desarrollo del apartado inicial sigue pendiente;
no cambian dependencias ni permisos en esta actualización.

## Actualización: monitor compacto, variación, inversión y resaltado

- Columna Var. diaria del ratio desde referencias nativas `refp`/`refdStr`/`refd`,
  compartiendo `calculateRatio` con el widget. Sin referencia o con fechas
  distintas se muestra — sin inventar datos ni ocultar el ratio actual.
- Columnas con ancho intrínseco y filas de unos 42 px; controles A/B, Agregar par
  y Agregar pares predeterminados alineados. Tabla de unos 610 px en las muestras
  del fixture y Cocos, sin distribuir celdas por todo el panel.
- Inversión por fila: conserva ID/posición y operaciones; evita el inverso duplicado.
- Reutilización de `OptionQuoteValue` con formato optativo para precios y ratio;
  sin cambios en el formato por defecto de opciones. Pulsos direccionales de
  500 ms, modo de movimiento reducido y claves por identidad para no marcar una
  inversión como una actualización de mercado.
- `npm test`: PASS, **539 Vitest + 61 Node + 2 QA infra = 602**.
- Seguridad/política/lint y empaquetado: PASS. Revisión independiente sin P1/P2.
- Validador del bundle: **13 recorridos PASS**; incluye variación diaria contra
  oráculo, datos faltantes/fechas distintas, inversión, flashes y limpieza,
  movimiento reducido, toolbar y anchos 1440/1024/420, más los flujos previos.
- Regresión focalizada de opciones: suite quotes PASS (SM-04 y SM-04-drag).
  La regresión completa de 20 suites sigue siendo la corrida base documentada;
  no se la presenta como una nueva ejecución completa para este cambio.
- Instalación Free verificada por hashes; respaldo previo:
  `Free/backups/extension-before-compact-ratio-monitor-20261117-165421`.
- Cocos: ocho botones de inversión y seis columnas visibles. AL30/AL30D mostró
  82.250 / 51,50 = 1.597,09 y variación +0,76%, desde referencias 81.500 / 51,42.
- Las siete claves de almacenamiento mantienen el hash agregado
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.
- Los 18 widgets mantienen geometría/configuración antes/después de actualizar:
  SHA256 `7f49705d9b4b5edd77a6b8021baa25f3c73c17f776cfd1d94162c2dc799cb8e2`.
- Evidencia local recortada al tab: `test-results/compact-ratios-fixture.png`,
  `test-results/compact-ratios-cocos.png` y `compact-ratios-evidence.json`.
  Los pulsos y el modo de movimiento reducido se prueban con datos controlados;
  las cotizaciones del broker no se alteran.

## Actualización: nominales iguales en monedas distintas

La regla vigente de cantidades reemplaza el dimensionamiento con FX para pares
de distinta moneda: **B copia exactamente A**, independientemente de precios,
factores o tipos de cambio. No se muestra ni exige conversión monetaria. Las
cantidades deben respetar los lotes de ambas patas; no se redondea B silenciosamente.
Con la misma moneda se conserva el cálculo por monto y lote más cercano.

Los registros guardados permanecen intactos. Al editar un registro antiguo con
B diferente de A se conserva B hasta cambiar A o seleccionar instrumentos.
Corregir comisión, precios u objetivo no cambia esa cantidad histórica. El campo
FX anterior se retiene como metadato de compatibilidad, sin usarlo para dimensionar.
El P&L continúa separado por moneda.

- `npm test`: PASS, **540 Vitest + 61 Node + 2 QA infra = 603**.
- Seguridad/política/lint y empaquetado: PASS; revisión independiente sin P1/P2.
- Validador del bundle: **14 recorridos PASS**. Comprueba 137→137 y 250→250,
  independencia de precios y ausencia de FX, más preservación de un registro
  histórico 100/80 al corregir comisión, y sincronización 120/120 al cambiar A.
- En Cocos, AL30/AL30D copió A=137 a B=137 sin conversión. Se dejó el formulario
  en 100/100 sin registrar la apertura ni enviar órdenes.
- Las siete claves locales conservaron exactamente el hash agregado
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.
- Instalación comparada con dist y respaldada en
  `Free/backups/extension-before-nominal-copy-20261117-170529`.

Los apartados anteriores documentan las pruebas históricas; esta sección y
`docs/ratios.md` describen la regla actual. No cambian dependencias ni permisos.

## Actualización: precio antes de cantidad y book de cinco niveles

- Orden de cada pata: instrumento, precio de entrada a la izquierda, cantidad a
  la derecha y book debajo. Se retiran las cajas grandes Bid/Ask.
- Vista tipo MiniBook, con Vol. C / Compra / Venta / Vol. V. La inspección nativa
  de Cocos confirmó que la mejor punta está en `md.bid/bsz/ask/asz`, seguida de
  `book.bidBook1..4`, `bszBook1..4`, `askBook1..4` y `aszBook1..4`. No se usa
  Book1 como mejor punta ni se mezcla una cantidad de otro nivel.
- `RatioOrderBook` sólo muestra mercado y fija el precio del borrador. No monta
  los controles de órdenes, posiciones o ejecuciones del widget nativo. Los
  niveles ausentes/incompletos quedan deshabilitados; se conserva la entrada
  elegida ante actualizaciones. Compra verde, venta roja, también con tema claro.
- `npm test`: PASS, **543 Vitest + 62 Node + 2 QA infra = 607**.
- Seguridad/política/lint y empaquetado: PASS. Revisión independiente sin P1/P2.
- Validador: **16 recorridos PASS**, con book de cinco filas, volúmenes reales,
  selección de mejor y segundo nivel, entrada fija ante cambios de profundidad,
  orden precio/cantidad y ajuste a 1440/1024/420. El click no altera el ticket ni
  envía el formulario de registro; los recorridos anteriores siguen incluidos.
- Cocos 4.24.4: AL30/AL30D, cinco filas por pata. Se eligió Venta nivel 2 de A:
  precio de entrada 82.400, coincidente con `askBook1`, mientras la mejor venta
  nativa era 82.360. Volúmenes de venta: 8.000 / 3.301 / 12.200 / 95.250 / 200.000.
  Las cantidades permanecieron 100/100 y el precio/cantidad del Mini Order Form
  no cambió. Se volvió al último precio y no se registró apertura ni envío.
- Las siete claves locales mantuvieron el hash agregado
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.
- Respaldo: `Free/backups/extension-before-ratio-entry-book-20261117-171937`;
  archivos instalados comparados por hash con dist. Evidencia local recortada:
  `test-results/ratio-entry-book-fixture.png`, `ratio-entry-book-cocos.png` y
  `ratio-entry-book-evidence.json`.

Esta actualización no cambia el lector de opciones, dependencias ni permisos.

## Actualización visual: encabezados del book

Título principal y título de cada pata con barra azul, bordes definidos y texto
blanco en negrita, siguiendo el estilo del widget. El ticker pasa a ser el título
de la pata; Pata A/B y Compra/Long o Venta/Short siguen visibles. La franja de
último/precio elegido se integra al book. Sus cuatro encabezados están centrados,
en negrita y blanco, agrupados con verde compra y rojo venta, y separadores.

- Sólo presentación y etiquetas de encabezado; no cambian datos ni cálculos.
- Pruebas focalizadas existentes `RatioOrderBook.test.tsx`: 3 PASS; empaquetado
  y seguridad/política/lint: PASS. No se repite el total de 607 como una nueva corrida.
- Inspección del bundle en temas oscuro y claro, ancho 1440 y ajuste a 420:
  textos de títulos/columnas blancos, peso 700, fondos compra `rgb(41,76,50)`
  y venta `rgb(113,30,40)`, sin desbordar los contenedores.
- Verificación en Cocos: título AL30 blanco y negrita sobre barra azul
  `rgb(23,78,114)`; encabezados de compra/venta coinciden con el fixture.
- Las siete claves locales conservaron el hash
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.
- Respaldo: `Free/backups/extension-before-book-headers-20261117-172956`.
- Capturas locales recortadas: `test-results/book-headers-dark.png`,
  `book-headers-light.png` y `book-headers-cocos.png`.

## Actualización: cotización centrada en el encabezado de cada pata

El último precio y la variación diaria del instrumento pasan al centro del
encabezado azul. Ambos usan Arial 11 px y peso 700, igual que Compra/Venta.
Se retira la etiqueta visible «Último»; el número conserva el click para fijar
la entrada. La fuente elegida se indica debajo del input de precio. La variación
es la del instrumento, independiente del ratio, y muestra — sin referencia válida.

- `npm test`: **544 Vitest + 62 Node + 2 QA infra = 608 PASS**.
- Seguridad/política/lint y empaquetado: PASS; los 16 recorridos del validador
  de operaciones también pasan con el bundle actualizado.
- Fixture en temas oscuro/claro y ancho reducido a 420: centrado geométrico
  verificado, misma familia/tamaño/peso que los encabezados de columnas. BMA
  muestra 104,00 y +4,00% mientras la entrada elegida es 106; tocar el número
  vuelve a 104. Capturas: `book-headers-dark.png` y `book-headers-light.png`.
- Cocos: AL30 82.330,00 / +1,02%; AL30D 51,44 / +0,04%. Ambos grupos centrados,
  Arial 11 px, peso 700. Elegir Venta nivel 2 fija 82.400; tocar la cotización
  restaura 82.330. Cantidades 100/100, sin registrar operaciones ni enviar órdenes.
- Los 24 archivos de dist coinciden por hash con la instalación compartida;
  respaldo `Free/backups/extension-before-centered-book-quote-20261117-175506`.
- Las siete claves locales conservan el hash agregado
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.

## Actualización: apertura sin título repetido, dirección y gastos compactos

Se elimina el título/subtítulo del formulario y se coloca el ratio de apertura
entre las direcciones. Las etiquetas usan tickers reales y presentan primero
la pata long: Long BMA / Short GGAL y Long GGAL / Short BMA. La segunda opción
mantiene la semántica Short A / Long B. Los DDMM pasan del pie de cada book
a la izquierda de su Monto A/B en el resumen; conservan defaults, validación,
edición y guardado por pata.

- Empaquetado y seguridad/política/lint: PASS. **16 recorridos PASS** con
  comprobaciones adicionales: ausencia de título, ticker y sentido correcto,
  ratio entre botones y DDMM antes del monto a 1440/1024/420 px. Continúan
  pasando las aperturas, correcciones, cierres y persistencia del fixture.
- Inspección del bundle en oscuro/claro y ancho 420. Capturas locales:
  `test-results/compact-opening-dark.png`, `compact-opening-light.png`,
  `compact-opening-narrow.png`.
- Cocos: BMA/GGAL, ratio de apertura 91,13%, ambas direcciones y DDMM 0,0847%
  antes de sus montos. Al elegir Long GGAL / Short BMA, A indica Venta · Short
  y B Compra · Long; se restaura Long BMA al finalizar, sin registrar apertura.
- Perfil compartido actualizado con respaldo
  `Free/backups/extension-before-compact-opening-20261117-181300`, 24 archivos
  comparados por hash con dist. Captura recortada: `compact-opening-cocos.png`.
- Las siete claves locales conservan el hash medido antes y después de esta
  instalación: `b9ceb7a00a7b64b848d55d0ae72d2019d4202925ce0286d85c8158a371f4a72d`.
  No se repite la suite unitaria completa para esta actualización de presentación.
- Evidencia recortada: `test-results/centered-book-quote-cocos.png`. Verificación
  manual reproducible: abrir AL30/AL30D, comparar estilos con Compra/Venta,
  elegir otro nivel y tocar el precio del encabezado para restaurar la entrada.

## Actualización: instrumento, precio y cantidad en una fila

Cada pata muestra los tres inputs en orden instrumento → precio → cantidad,
alineados y con altura de 36 px; el book permanece debajo. Los títulos largos
se acortan visualmente con puntos suspensivos y conservan el texto en tooltip.

- Empaquetado y seguridad/política/lint: PASS. Se actualiza el validador existente
  para comprobar posiciones y alturas de los tres inputs a 1440/1024/420 px;
  sus **16 recorridos PASS**, incluyendo precios, cantidades automáticas y edición.
- Cocos: ambas patas alineadas en y=399,6, inputs de 36 px. Altura de cada pata
  de 450,4 a 375,4 px en el mismo viewport: **75 px menos**. AL30/AL30D conserva
  cantidades 100/100. Evidencia recortada: `test-results/inline-entry-cocos.png`.
- No se repite la suite unitaria completa para este cambio de presentación.
- Instalación comparada por hash (24 archivos), respaldo
  `Free/backups/extension-before-inline-entry-20261117-180023`.
- Las siete claves locales conservan el hash agregado
  `1762ccfedd08ae330d4e1ef33775de3da35499c2de5a8c86f9bf2fcf5cd43c41`.

## Actualización: dirección selecciona las mejores puntas de entrada

Long A / Short B carga Ask A y Bid B; Long B / Short A carga Bid A y Ask B.
La elección resalta las dos puntas del book y actualiza ratio y cantidades
derivadas sin copiar volúmenes ni enviar/registrar órdenes. Pulsar otra vez
la dirección activa vuelve a cargar las puntas actuales. Los precios quedan
fijos ante actualizaciones del mercado. Si falta la mejor punta, ese precio
queda vacío con aviso; no se toma último ni se salta a un nivel más profundo.

- `npm test`: **545 Vitest + 62 Node + 2 QA infra = 609 PASS**.
- Seguridad/política/lint y empaquetado: PASS.
- **17 recorridos PASS** del bundle, incluyendo ambos sentidos, resaltado,
  click repetido, redimensionamiento B, mejor Ask ausente con niveles profundos
  presentes, recuperación con reintento y ausencia de registro automático.
- Cocos BMA/GGAL: Long GGAL / Short BMA toma Bid BMA 9.250 y Ask GGAL 4.850;
  Long BMA / Short GGAL toma Ask BMA 9.330 y Bid GGAL 4.830. Ratio de apertura
  90,72% y 93,17%, respectivamente. Cantidad A=100 conservada; click repetido
  repone la punta tras modificar manualmente el precio. Mini Order Form intacto.
- Instalado en el perfil compartido con 24 archivos comparados por hash;
  respaldo `Free/backups/extension-before-direction-quotes-20261117-181941`.
- Las siete claves locales conservan el hash medido antes/después:
  `b9ceb7a00a7b64b848d55d0ae72d2019d4202925ce0286d85c8158a371f4a72d`.
- Captura recortada: `test-results/direction-book-cocos.png`. Sin apertura
  registrada ni envío de órdenes en la verificación del broker.

## Cierres por nominales — 23/11/2026

Implementado en rama `codex/ratio-close-nominals`, base main `4040034`.
El detalle permite ingresar la cantidad de A o B y calcula la otra según los
remanentes guardados, al lote más cercano. La cantidad ingresada no se redondea.
Se muestran Abiertos/Luego; completar una pata toma exactamente el remanente
de la otra. Se mantienen los accesos de 25%, 50% y total y el mismo esquema de
historial. El cambio de precios no redimensiona cantidades. El registro conserva
los cierres previos, gastos, P&L por moneda y guardas de cuenta/revisión/WebLocks.

Validación:
- 643 tests PASS: 571 Vitest, 70 Node y 2 QA infra; cinco casos nuevos del modelo
  y uno del contrato de lectura de 4.24.5. Seguridad/lint, build/paquete y auditoría
  PASS, sin vulnerabilidades.
- 39 recorridos del tab PASS, incluidos fuente A/B, remanentes tras varios cierres,
  lotes, entradas inválidas, recarga, cambio de cuenta y borradores obsoletos.
- Regresión general: 70 PASS / 0 FAIL, 20/20 suites, complete=true, sobre el código
  de cierre `e914a9b80c51e7a083e87b4502a78de6f53d77e0`, antes de agregar únicamente
  4.24.5 a la allowlist del lector del tab. Reporte local:
  `test-results/qa-2026-11-23T12-32-43-431Z/report.md`.
- Revisión independiente sin hallazgos pendientes. Se corrigió una aserción del
  test de versión para esperar una respuesta nueva del lector real.
- Capturas sintéticas `test-results/nominal-close-dark.png` y
  `nominal-close-light.png`; detalle sin desborde en 420 px.

Cocos se actualizó a Matriz 4.24.5. Se verificaron de sólo lectura el catálogo,
contexto de cuenta, getSecurity, suscripción pública y los factores/lotes de
BMA/GGAL (1/1) y AL30/AL30D (0,01/1). La muestra no tenía últimos ni puntas
publicados; no se sustituye ese faltante ni se afirma frescura de precios reales.
Se agregó esa versión específica sólo al lector del tab Ratios. El test nuevo
mantiene el rechazo de contexto de cuenta anterior y la falta de precios como
faltante. No se amplió la lista de otros lectores ni las capacidades de ejecución.

Instalado en el perfil Free compartido, mismo ID/ruta, compilación de desarrollo
0.0.28. Los 24 archivos coinciden por hash con dist. Respaldos:
`Free/backups/extension-before-ratio-nominal-close-20261123-093434` y
`Free/backups/extension-before-ratio-reader245-20261123-094553`.
En Cocos 4.24.5 se comprobó la presencia de los dos campos y el cálculo automático
de B al ingresar en A; se limpió el borrador sin registrar cierres. Las siete
claves locales conservan el hash agregado
`b9ceb7a00a7b64b848d55d0ae72d2019d4202925ce0286d85c8158a371f4a72d`.

## Code review y Playwright ampliado del PR #85 — 23/11/2026

Revisión contra main `4040034b84601719c4d87fa0f77f68c24bc2043c`.
Código productivo probado: `465597845c1715c5925fe6bd89974755eaafb492`.
Dos revisiones independientes (estándares y requisitos): sin hallazgos accionables.
No se requirieron cambios de producción. Se amplió el validador del tab con:
- P&L de cierres nominales en ARS/USD, factores nativos y DDMM; realizado congelado
  mientras cambian las cotizaciones y el pendiente.
- Remanentes históricos 60/40 en monedas distintas y una pata ya cerrada, sin
  duplicar su salida ni sus gastos.
- Conflicto de revisión durante la espera del lock de guardado, reintento y doble
  click que registra exactamente una salida por pata.
- Cambio de cuenta con un cierre esperando el lock: no escribe en la operación
  original y no recupera el borrador al volver.

La prueba de compatibilidad 4.24.5 queda al final: su cambio de identidad de
contexto ya no interfiere con las aperturas de los casos posteriores. La guarda
rechazó correctamente la apertura del primer ensayo con contexto anterior.

Validación nueva:
- `npm run test:pr` completo PASS: 643 tests (571 Vitest + 70 Node + 2 QA infra),
  seguridad/política/lint, build/paquete, auditoría con 0 vulnerabilidades y
  regresión general 70 PASS / 0 FAIL, 20/20 suites, complete=true.
- Reporte local general: `test-results/qa-2026-11-23T18-48-49-810Z/report.md`,
  commit `4655978`, árbol limpio al iniciar.
- Tab de ratios: 43 recorridos Playwright PASS sobre el bundle de producción.
- Widget de ratios: 73 comprobaciones Playwright PASS, incluidas columnas,
  edición, formatos, referencias C, recarga, dashboards y tamaño.
- Las pruebas ampliadas fueron revisadas independientemente sin hallazgos.

Todos los recorridos usaron datos sintéticos en páginas loopback propias del
perfil compartido. Se cerraron sólo esas páginas y sus servidores, conservando
el navegador y la pestaña real del usuario. No se registraron cierres reales ni
se afirma validación de cotizaciones frescas o aceptación de órdenes del broker.
