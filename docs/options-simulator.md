# Simulador de opciones de Free

El simulador se abre desde el icono de ChuchoTriz en Matriz, pestaña **Simulador de
opciones**. La cadena conserva el diseño de Premium: calls a la izquierda, strike
central y puts a la derecha, con BID/ASK, cantidades, VI, delta, variación y volumen
nominal. El armado no envía, modifica ni cancela órdenes y no lee tenencias, saldos
ni órdenes propias.

La barra de mercado usa etiquetas y selectores en una sola fila. El engranaje **⚙ VI**
abre el filtro de antigüedad sin desplazar la tabla. **Mis estrategias** reúne ejemplos,
guardado y carga; **Entrada** reúne los datos de entrada y gastos. La cadena
usa la altura disponible de la ventana y permite recorrer sus filas internamente.

**Armado** contiene cadena y patas; **Análisis** contiene gráfico y escenarios.
Las patas, primas y escenarios se conservan al alternar. En Análisis se pausa la
observación de mercado y se muestra un resumen de las patas. Los toggles permiten
probar precio −10%/sin cambio/+10%, VI −5/0/+5 puntos porcentuales y fecha de
entrada/mitad del plazo/vencimiento. Los campos manuales siguen disponibles.
El precio del escenario se evalúa independientemente del precio de entrada.

La leyenda de la cadena ocupa una fila: subyacente y precio, rangos de VI de
Calls/Puts y cantidad de ejercicios. La cobertura y antigüedad de la escala quedan
en los tooltips. Solo aparece la advertencia de contratos incompletos si hay alguno;
se quitaron BID/ASK duplicados, hora local de lectura y escalas de volumen repetidas.

## Uso

1. Elegir subyacente y vencimiento. Siempre se muestran calls y puts. El mercado se
   elige automáticamente en la moneda del subyacente, con preferencia por 24 h y
   un único plazo común; no se mezclan mercados ni se convierten monedas.
2. Seleccionar un BID para simular venta o un ASK para simular compra. Seleccionar
   otra vez el mismo lado quita la pata; seleccionar el contrario cambia el lado y
   copia esa punta. **Estrategia** abre el selector visual: Option, Vertical,
   Butterfly, Ratio Spread, Strangle, Straddle, Iron Condor y Jade Lizard.
   Cada fila permite alternar Long/Short y Call/Put cuando corresponde, o
   Normal/Reversed. El dibujo y las patas se previsualizan sin modificar el armado.
   La flecha reemplaza las patas con contratos de la cadena y conserva los combos.
   Si faltan strikes, factores o puntas válidas, la flecha queda deshabilitada y
   se explica el motivo. No incluye Calendar, Covered ni Futures.
3. Las patas se muestran en filas compactas. Hacer clic en lado, cantidad, prima
   o VI para editar; Enter o salir del campo acepta, y Escape restaura el valor
   anterior. Las patas manuales permiten editar también tipo y strike.
   Ajustar proporciones por combo, combos, primas de entrada y VI de las patas.
   Las primas y VI copiadas quedan fijas. Al editar una prima aparecen
   Natural/MID/Opuesto para copiar esa referencia solamente a esa pata;
   una actualización de mercado no altera la posición
   simulada. Las estrategias se pueden guardar con nombre en el perfil de Chrome.
4. Entrar en **Análisis** para consultar el gráfico al vencimiento y el teórico;
   usar los toggles o modificar manualmente precio del escenario, fecha objetivo,
   cambio de VI en puntos porcentuales, tasa y dividendos. Hover explora precios,
   clic los fija y el slider permite consultar ambos resultados con teclado/touch.

Las simulaciones guardadas incluyen primas, contratos, VI, fechas, moneda, factor,
gastos y parámetros del modelo. No son órdenes ni se guardan en Matriz. No hay
sincronización entre dispositivos. La configuración de cantidades sigue en su
pestaña y conserva su borrador al alternar con el simulador.

## Datos nativos y aislamiento

`public/options-market-reader.js` expone únicamente `catalog` y `snapshot` mediante
un canal de mensajes. No importa los puentes, coordinadores ni motores de Premium.
Solo consulta `securityStore.options`, `underlyingsForMatrix`, `getSecurity` y
suscripciones `md`/`book`. La cuenta activa participa únicamente en la detección
interna de cambios de contexto y nunca se devuelve. No lee credenciales.

Versiones admitidas: Matriz 4.24.1 y 4.24.4, como el lector de referencia. Máximo de
160 instrumentos por lectura y 256 suscripciones acumuladas por contexto. No se
publica una cadena incompleta: el cliente divide la selección en grupos
secuenciales de 23 opciones más el subyacente. No se
desuscribe, porque Matriz comparte suscripciones con otras vistas. Las llamadas
nativas son secuenciales, con una reserva que se mantiene hasta resolver la llamada
real, incluso si el cliente dejó de esperar. El cierre del panel o cambio de pestaña
retira el interés. No se promete cancelar HTTP interno de Matriz.

Una lectura que cambia de catálogo, cuenta/contexto o conexión se descarta. La
regresión de secuencias oculta las referencias. Las métricas son las de Matriz;
no se infiere VI desde precios. La escala de VI conserva el filtro de operación
reciente y sus ventanas de 15/30/60 minutos. La hora de lectura local no es un
timestamp de bolsa, y una cotización observada no acredita vigencia ni ejecución.

Los factores monetarios se toman de los metadatos nativos:
`totalAmountFactor × contractMultiplier × roundLot`. Se exige factor positivo,
coincidencia de monedas de prima/ejercicio/subyacente, vencimiento y mercado común.
La única resolución implícita de moneda de ejercicio es el caso BYMA de opciones
físicas sobre acciones en ARS verificado en Premium. Los contratos ambiguos para
un mismo strike y tipo no se eligen arbitrariamente.

## Modelo de resultados

Las plantillas usan strikes únicos del mismo vencimiento. Butterfly exige alas
simétricas 1:2:1. Ratio Spread Long es un backspread: vende una opción cercana y
compra dos más alejadas; Short invierte esos lados
([referencia OIC](https://prd-web.optionseducation.org/strategies/all-strategies/long-ratio-call-spread)).
Jade Lizard Normal combina put vendida y call spread vendido; Reversed combina
put spread vendido y call vendida (Twisted Sister), según la
[guía de tastylive](https://assets.contentstack.io/v3/assets/blt40263f25ec36953f/blt094f33167a64ab9a/648c7f8b83c7fb90a25f4c77/tastylive-options-strategy-guide-2023.pdf).
Los iconos muestran la forma del pago intrínseco, sin primas; el resultado monetario
se calcula con las primas copiadas y editables, multiplicadores, combos y gastos.

`resultado = Σ sentido × contratosPorCombo × combos × factor × (valor − prima) − gastos`

Compra tiene sentido +1 y venta −1. Al vencimiento, valor es el intrínseco.
Máximos y equilibrios se calculan sobre todos los tramos lineales desde 0 hasta
infinito, sin limitarse al rango del gráfico. Incluye colas ilimitadas, equilibrios
puntuales y tramos enteros de equilibrio.

El teórico es Black–Scholes–Merton europeo con días calendario / 365, tasa y
dividendos continuos y VI constante por pata, más el cambio de escenario. Falta de
VI oculta solo la curva teórica; al vencimiento no hace falta VI. A fecha de
vencimiento ambas curvas coinciden. Casos de volatilidad cero y subyacente cero
tienen soluciones límite explícitas. Como referencia del tipo de modelo y sus
entradas, ver [la calculadora de Cboe](https://www.cboe.com/oi/tools/options_calculator/).

No incluye ejercicio anticipado, dividendos en efectivo, garantías, financiación
de primas, impuestos ni gastos de salida/ejercicio. Tasa y dividendos parten de 0%
y son supuestos editables, no condiciones actuales. Los ejemplos de aprendizaje
usan subyacente 100 y primas ficticias; cargar uno reemplaza explícitamente los
datos de la simulación.

## Referencia y validación

Referencia de UI y métricas: ChuchoTriz Premium `7c2419d`, archivos
`src/multileg/options/{OptionsView,OptionsMetrics,OptionQuoteValue,optionsMarketMetrics}`.
Se adaptaron los componentes puros de métricas y cotizaciones y el estilo de la
cadena; la lectura de Free tiene una API independiente de solo dos métodos.

`npm test` verifica resultados de spreads, straddle, mariposa, condor, cantidades,
costos, colas, equilibrios, Black–Scholes y paridad, validación, cadena y guardado.
El lector real se ejecuta también en VM con stores controlados para verificar su
protocolo, exclusión, cambios de contexto y rechazo de métodos ajenos al mercado.
`npm run security:check` y `npm run package:free` verifican lint, políticas,
distribución y el ZIP. El permiso de Chrome sigue siendo únicamente `storage`;
el manifiesto expone solo el lector empaquetado a los dominios de Matriz existentes.

Para revisar el bundle sin broker: `node tools/preview-free.mjs`, abrir `/fixture`
en la URL loopback impresa y entrar al simulador desde Configuración. El servidor
sirve el bundle de producción con catálogo/cotizaciones ficticias y almacenamiento
local de demostración. Esta fixture no acredita integración nativa ni precios vivos.

### Verificación del 3 de noviembre de 2026

- 266 tests Vitest, 13 tests Node del lector/guardas y 10 tests de seguridad aprobados;
  TypeScript, lint, política y `package:free` aprobados. Paquete candidato 0.0.17.
- Revisión independiente del cálculo, lector, selección, privacidad y guardas sin
  hallazgos importantes; revisión posterior del batching también aprobada.
- Playwright sobre el bundle real con fixture loopback: cadena reflejada, selección
  BID/ASK, mariposa 1:2:1, guardado local, borrador entre pestañas, curvas iguales al
  vencimiento, entrada inválida sin gráfico anterior, desconexión/recuperación y
  rechazo/recuperación de secuencia. Se inspeccionaron temas claro/oscuro y anchos
  1920/1440/1024/390; sin desborde horizontal del simulador y con gráfico adaptable.
- Lectura nativa independiente en la sesión compartida autenticada de Matriz
  4.24.4: 44 subyacentes, 1160 contratos completos y factor monetario 100 en seis
  opciones GGAL del 20/11/2026. Esas seis opciones no devolvieron BID/ASK ni VI en
  esa lectura, realizada después del cierre. La presentación de puntas/VI pobladas
  queda validada con fixture, pendiente de observar datos nativos disponibles.
- No se reemplazó ni recargó la extensión instalada. El lector de prueba se retiró
  del canal al terminar. No se enviaron, modificaron ni cancelaron órdenes.

### Ajuste de densidad y edición por clic

Se compactaron patas a filas de 34 px, controles de mercado a una barra horizontal
y filas de cadena a 32 px. El filtro de VI se abre en un panel superpuesto desde el
engranaje; Natural/MID/Opuesto aparece únicamente al editar la prima de una pata.
La biblioteca y los supuestos quedan plegados, y la cadena limita su altura al
espacio disponible, sin agrandar una cadena corta innecesariamente.

269 tests Vitest, 13 tests Node, política/lint/seguridad y el paquete 0.0.17
aprobados. La revisión independiente detectó y permitió corregir Enter en los
botones de referencias; una regresión verifica su activación nativa. El popover se
reposiciona al desplazar o redimensionar y desaparece al terminar la edición.

QA del bundle con una cadena sintética de 41 ejercicios: 19 filas completas
visibles a 1920×1080, altura de cadena 680 px, sin desborde horizontal del simulador.
Se verificaron también anchos 1440/1024/390, Escape sin cerrar el panel, copia MID
individual y apertura del filtro sin desplazar la cadena. En esa sesión el navegador
compartido estaba oculto: las acciones se ejercitaron mediante DOM y las capturas
del propio navegador, además de las pruebas de componentes; no se atribuyen a una
campaña de interacción nativa con datos de mercado.

### Pestañas y escenarios rápidos

275 tests Vitest y 13 tests Node aprobados, además de TypeScript, políticas de
seguridad, lint y empaquetado. Regresiones nuevas verifican conservación entre
pestañas, presets de precio/VI/fecha, precio externo al rango sin falsear el P&L,
presets que volverían negativa la VI y precios pequeños sin notación exponencial.
La revisión independiente identificó este último caso y confirmó su corrección.

En el navegador compartido con fixture se comprobó por DOM la conservación de
tres patas, precio 110 y cambio de VI +5 al alternar; el escenario al vencimiento
dio resultados idénticos en ambas curvas. La leyenda consolidada midió 24 px en
una fila. El navegador permanecía oculto y las capturas de este último ajuste no
estuvieron disponibles, por lo que no se acredita inspección visual por píxeles.

### Selector visual de estructuras

300 tests Vitest, 13 tests Node y 10 tests de seguridad aprobados; TypeScript,
lint, políticas, guardas de distribución y paquete 0.0.17 aprobados. La revisión
independiente del selector y sus recetas terminó sin hallazgos accionables.

La fixture del bundle verificó por DOM las ocho familias, Vertical Short Put,
Jade Lizard Reversed, previsualización sin alterar las patas y conservación de
tres combos al aplicar. El foco volvió al botón de estrategia; Análisis mostró
el crédito escalado y la cola ilimitada de la call vendida. El navegador compartido
continuaba oculto; esta comprobación no acredita inspección visual por píxeles.
