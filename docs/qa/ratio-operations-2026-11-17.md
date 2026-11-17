# Operaciones de ratios — 17/11/2026

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
