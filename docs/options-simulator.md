# Simulador de opciones de Free

El simulador se abre desde el icono de ChuchoTriz en Matriz, pestaña **Simulador de
opciones**. La cadena conserva el diseño de Premium: calls a la izquierda, strike
central y puts a la derecha, con BID/ASK, cantidades, VI, delta, Theta teórico,
Extrínseco Mid, variación y volumen nominal. El armado no envía, modifica ni cancela órdenes y no lee tenencias, saldos
ni órdenes propias.

La barra de mercado usa etiquetas y selectores en una sola fila. El engranaje **⚙ VI**
abre el filtro de antigüedad sin desplazar la tabla. La barra superior contiene
únicamente **Armado / Análisis**. Se retiraron **Mis estrategias** y **Entrada**;
el simulador no lee ni sobrescribe las estrategias guardadas anteriormente. Los
parámetros editables quedan en **Análisis → Más supuestos y rango**. La cadena
usa la altura disponible de la ventana y permite recorrer sus filas internamente.
Después del selector de vencimiento se muestran los días calendario desde hoy,
por ejemplo **23d**. Las patas usan el mismo criterio, independientemente de la
fecha teórica del escenario; para fechas anteriores se muestra **Vencido**.

**Armado** contiene cadena, patas y un gráfico compacto debajo de las patas;
**Análisis** conserva el gráfico completo y los escenarios. Ambos gráficos usan
las mismas patas, precio evaluado y supuestos, y se actualizan al editar el armado.
Las curvas y el área al vencimiento se colorean en verde por encima del eje cero
y rojo por debajo. Vencimiento conserva trazo continuo y teórico punteado; las
referencias σ usan colores distintos para no confundirlas con ganancia/pérdida.
Las patas, primas y escenarios se conservan al alternar. En Análisis se pausa la
observación de mercado y se muestra un resumen de las patas. Los toggles permiten
probar precio −10%/sin cambio/+10%, VI −5/0/+5 puntos porcentuales y fecha de
entrada/mitad del plazo/vencimiento. Los campos manuales siguen disponibles.
El precio del escenario se evalúa independientemente del precio de entrada.

La VI se presenta con dos decimales en cadena, editor de Análisis y leyendas; el cálculo y la
edición conservan la precisión original. Ambos gráficos incluyen líneas verticales
−2σ, −1σ, +1σ y +2σ con la aproximación de movimiento esperado
`precio de referencia ± n × precio de referencia × VI de referencia × √(días/365)`.
El escalado de volatilidad con la raíz del tiempo sigue la
[explicación de CME](https://www.cmegroup.com/education/courses/introduction-to-options/discover-options-volatility).
Se usan los días restantes desde la fecha teórica hasta el vencimiento y la VI
efectiva (incluido el cambio del escenario) de las patas con strike más cercano al
precio de referencia. En empates se promedian por tipo/strike sin ponderar compra,
venta o cantidad. No se presenta como VI ATM del mercado ni como probabilidad de
ganancia. El tooltip describe la referencia utilizada.

Los niveles numéricos se muestran aunque queden fuera del rango visible; las líneas
solo se dibujan dentro del gráfico, sin recortar niveles negativos a cero. Con VI
cero o al vencimiento coinciden con el precio de referencia y se evitan líneas
superpuestas. Si falta VI en las patas de referencia no se infiere un dato para los
desvíos; la curva al vencimiento sigue disponible.

La grilla de calls y puts comparte esas referencias con los gráficos: líneas
horizontales atraviesan ambos lados por la separación entre las filas de strikes
que contienen cada nivel, con etiqueta y precio calculado. Son capas superpuestas sin filas adicionales;
no alteran las puntas ni sus clics. Se muestran cuando el subyacente, vencimiento
y moneda del armado coinciden con la cadena. Los niveles fuera de los strikes
disponibles no se fijan artificialmente al borde.

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
   La flecha reemplaza las patas con contratos de la cadena y las cantidades de la plantilla.
   Si faltan strikes, factores o puntas válidas, la flecha queda deshabilitada y
   se explica el motivo. No incluye Calendar, Covered ni Futures.
3. Las patas se muestran en este orden: chip **C / P**, cantidad con signo,
   fecha de vencimiento (**Dic 13**), días (**17d**) y strike. Una cantidad positiva
   representa compra; una negativa representa venta. No hay columna de lado,
   instrumento, prima ni VI.
   Hacer clic en cantidad para editar número y sentido juntos; Enter o salir del campo acepta, y Escape restaura el valor
   anterior. Las patas manuales permiten editar también tipo y strike.
   La VI de cada pata se conserva y se edita desde **Análisis → VI por pata**,
   con dos decimales al mostrarla y precisión original al editarla.
   Los botones **Strike ↓/↑** desplazan todas las patas a la base contigua del
   mismo tipo y vencimiento, copiando BID para ventas, ASK para compras y VI del
   destino. El ajuste es completo o no se aplica: no salta bases con contratos
   ambiguos, factores incompatibles o sin la punta requerida. En estrategias
   totalmente manuales el paso de strike es un punto, conservando prima y VI;
   no se mezcla este ajuste con patas de la cadena.
   **Cantidad ↓/↑** conserva la proporción entera: 1:2:1 pasa a 2:4:2, luego a
   3:6:3; bajar vuelve una unidad de esa proporción. No baja cantidades a cero.
   Cada pata tiene además botones **− / +** junto a su cantidad: quitan o agregan
   un contrato solo en esa pata, conservando su sentido (una venta −1 pasa a −2
   al agregar). Reducir queda deshabilitado en un contrato y aumentar al alcanzar
   el máximo; para cambiar compra/venta se edita el signo directamente.
   Debajo de las patas, el slider de **precio total de entrada** permite elegir
   **Natural / Mid / Opuesto** y puntos intermedios. Natural toma ASK de compras
   y BID de ventas; Opuesto toma las puntas contrarias; Mid interpola a mitad.
   El importe incluye cantidades, factor y gastos totales e indica crédito,
   débito o entrada neutra. La selección cambia todas las primas juntas y
   conserva cantidades, sentido y VI. Cotizaciones nuevas actualizan las
   referencias sin modificar la entrada fijada; si esta queda fuera, se informa.
   Si falta una punta válida o no coincide el contexto, el control se deshabilita.
   Los precios individuales/manuales siguen en **Análisis → Más supuestos y rango →
   Precios de entrada por pata**. Debajo de las patas también se muestra la pérdida
   máxima global al vencimiento, con **∞** cuando es ilimitada.
4. Entrar en **Análisis** para consultar el gráfico al vencimiento y el teórico;
   usar los toggles o modificar manualmente precio del escenario, fecha objetivo,
   cambio de VI en puntos porcentuales, tasa y dividendos. Clic o toque en el gráfico
   fija el precio; mover el cursor no cambia la selección. **Precio del escenario**
   permite ingresarlo con teclado. Debajo del gráfico se muestran el precio fijado
   y ambos resultados, sin slider de precio.

El armado y los supuestos se conservan mientras el componente permanece abierto;
el guardado de estrategias está retirado de esta versión de la interfaz.
La configuración de cantidades sigue en su
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

La cadena muestra **Theta teórico** BSM europeo por unidad de prima y día
calendario, usando spot actual, VI nativa, días desde hoy al vencimiento y
tasa/dividendos configurados en Análisis. No usa el precio ni la fecha del
escenario y no se presenta como una métrica nativa del broker. No se calcula con
VI ausente/cero, al vencimiento ni con datos incompatibles. La antigüedad de la VI
se informa en su columna. Como referencia de interpretación diaria, ver
[Theta de OIC](https://prd-web.optionseducation.org/advancedconcepts/theta).

**Extrínseco Mid** es el promedio BID/ASK menos el valor intrínseco, por unidad,
con spot y monedas compatibles. Exige ambas puntas válidas, tamaños positivos y
libro sin cruce; no reemplaza información faltante con cero ni recorta valores
negativos. La descomposición prima/intrínseco/valor temporal se explica en
[Options Pricing de OIC](https://prd-web.optionseducation.org/optionsoverview/options-pricing).

Las plantillas usan strikes únicos del mismo vencimiento. Butterfly exige alas
simétricas 1:2:1. Ratio Spread Long es un backspread: vende una opción cercana y
compra dos más alejadas; Short invierte esos lados
([referencia OIC](https://prd-web.optionseducation.org/strategies/all-strategies/long-ratio-call-spread)).
Jade Lizard Normal combina put vendida y call spread vendido; Reversed combina
put spread vendido y call vendida (Twisted Sister), según la
[guía de tastylive](https://assets.contentstack.io/v3/assets/blt40263f25ec36953f/blt094f33167a64ab9a/648c7f8b83c7fb90a25f4c77/tastylive-options-strategy-guide-2023.pdf).
Los iconos muestran la forma del pago intrínseco, sin primas; el resultado monetario
se calcula con las primas copiadas y editables, contratos de cada pata, factor y gastos.

`resultado = Σ sentido × contratosDeLaPata × factor × (valor − prima) − gastos`

No hay multiplicador global de combos. La cantidad de cada pata es su total de
contratos; su signo en la interfaz indica compra o venta.

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
costos, colas, equilibrios, Black–Scholes y paridad, Theta, Extrínseco, validación y
cadena. También verifica la retirada de menús sin acceder al guardado anterior.
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

### Cantidades directas por pata

Se retiraron el control y el multiplicador global de combos. 309 tests Vitest,
13 tests Node, 10 tests de seguridad, TypeScript, lint y empaquetado aprobados.
Las regresiones verifican cantidades directas, migración de guardados sin alterar
el P&L y sin multiplicarlos nuevamente al guardar. Revisión independiente sin
hallazgos. La fixture confirmó por DOM tres contratos de una call, su débito total
y el gráfico disponible, sin referencias a combos en Armado ni Análisis.

### Gráfico rápido en el armado

El gráfico compacto queda debajo de las patas, conservando el espacio de la cadena;
usa las curvas, validaciones y supuestos del gráfico completo de Análisis. Se monta
únicamente el gráfico de la pestaña activa, con precio evaluado compartido.

310 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y empaquetado aprobados.
La regresión verifica edición inmediata, escenarios compartidos y datos inválidos.
Revisión independiente sin hallazgos. La fixture confirmó por DOM resultados
idénticos entre vistas, conservación del cambio de VI y alturas de 240/340 px para
los gráficos compacto/completo. El navegador seguía oculto; sin QA por píxeles.

### VI con dos decimales y referencias de desvíos

316 tests Vitest, 13 tests Node, 10 tests de seguridad, TypeScript, lint y paquete
0.0.17 aprobados. Revisión independiente sin hallazgos. Pruebas específicas
verifican preservación de precisión, fórmula, empates, datos faltantes, plazo cero,
VI cero y niveles fuera de rango.

En la fixture se confirmó por DOM VI 35,00 %, ±1σ en 89,97/110,03 y ±2σ en
79,93/120,07 para precio 100 y 30 días; ambos gráficos coincidieron. Subir la VI
5 pp actualizó las referencias a 40,00 %. Sin inspección visual por píxeles.

### Desvíos en la cadena

317 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y paquete aprobados.
La regresión verifica interpolación entre filas, coincidencia con el gráfico,
actualización por VI, cero días y ocultación al cambiar el contexto; no suma filas.
La revisión detectó y permitió corregir el ancho del overlay en tablas con scroll.
Sin hallazgos pendientes.

QA por DOM con fixture: cuatro niveles iguales a los del gráfico, mismo número
de filas y capas sin capturar clics. A 1024 px de ventana, tabla y líneas midieron
1110 px y conservaron alineación al desplazar hacia puts; a 1920 px volvieron a
coincidir en todo el ancho. No se acredita inspección visual por píxeles.

### Precio fijado por clic sin slider

318 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y paquete aprobados;
revisión independiente sin hallazgos. Se verifican selección por clic, segundo clic,
persistencia al mover el puntero y alternar vistas, y precios pequeños sin exponentes.
La fixture confirmó por DOM que precio, cursor y ambos resultados permanecen
idénticos tras `pointermove`, que otro clic cambia el precio y que no hay slider
inferior. Sin inspección visual por píxeles.

### Líneas de desvío entre bases

Las referencias de la grilla se ajustan a la separación entre filas y conservan
el precio calculado en la etiqueta, incluso si varios niveles comparten intervalo.
318 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y empaquetado aprobados;
revisión independiente sin hallazgos. La fixture confirmó por DOM las cuatro
líneas en límites de filas (70/80, 80/90, 110/120 y 120/130), sin cruzar sus centros.

### Ajustes rápidos de toda la estrategia

333 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y paquete aprobados.
Las regresiones cubren proporciones, clics rápidos, límites, contratos contiguos,
recopia de puntas/VI, cambios atómicos y desconexión. Revisión independiente sin
hallazgos accionables.

La fixture confirmó por DOM una Butterfly 1:2:1 que pasó a 2:4:2, movió sus strikes
90/100/110 a 100/110/120 con primas/VI del destino y volvió a 1:2:1. Los controles
ocupan una barra de 42,5 px sobre las patas y el gráfico se mantiene actualizado.
Sin inspección visual por píxeles.

### Patas compactas y días al vencimiento

335 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y paquete aprobados.
Las regresiones verifican días calendario, año bisiesto, fechas inválidas, signos,
chips, edición manual y conservación de la VI en Análisis.

La fixture confirmó por DOM **30d** después del selector y filas con **+ C 100**
y **− P 90**, sin instrumento ni VI. Las filas conservan 34 px de alto y la tabla
entra en el panel de 390 px. Al llevar el escenario al vencimiento, las patas
siguen mostrando los días desde hoy. El editor de VI permanece en Análisis.

### Cantidad con signo y precio total de entrada

Las filas quedan en orden C/P, cantidad firmada, fecha mes/día, días y strike.
La prima individual sale del panel; el precio se ajusta debajo con slider y
botones Natural/Mid/Opuesto, mostrando crédito o débito total.

342 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y paquete aprobados.
Las regresiones cubren cambio de sentido por signo, borradores incompletos, Escape,
guardado compatible, fecha Dic 13, interpolación, proporciones, factor, gastos y
conservación de precios con cotizaciones nuevas. La revisión detectó y permitió
corregir la validación de exposición bruta antes de compensar compras/ventas;
sin hallazgos pendientes.

La fixture confirmó por DOM patas sin columna de prima, filas de 34 px y un Iron
Condor con créditos Natural 360, Mid 400 y Opuesto 440 ARS. Los controles cambiaron
las primas de entrada y editar −1 cambió el sentido. Sin QA por píxeles.

### Interfaz simplificada, métricas de cadena y pérdida máxima

338 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y empaquetado aprobados;
revisión independiente sin hallazgos de código. Se retiraron pruebas de la
biblioteca y referencias individuales que ya no forman parte de la interfaz;
se agregaron casos de Theta analítico contra diferencias temporales, Extrínseco,
datos faltantes, retiro de storage y máximo de pérdida acotado/ilimitado.

La fixture confirmó por DOM cero menús en la barra superior, 17 columnas de
cadena con Theta y Extrínseco en calls y puts, y el panel de patas sin esas
columnas. Para una call ATM, Extrínseco fue 8 ARS por unidad; la pérdida máxima
pasó de 810 ARS en compra a ∞ en venta. Tabla y overlay midieron 1378 px de ancho.
Sin inspección visual por píxeles ni afirmación de datos bursátiles vivos.

### Cantidades por pata y colores de resultados

340 tests Vitest, 13 tests Node, seguridad, TypeScript, lint y empaquetado aprobados.
La revisión independiente no dejó hallazgos bloqueantes. Cada pata dispone de
botones para ajustar magnitud sin cambiar sentido; se verifican mínimos, máximos,
borradores inválidos, foco y clics rápidos.

Ambos gráficos separan rojo/verde exactamente en el eje cero con gradientes SVG
en coordenadas del gráfico. Los marcadores usan el signo de su propio resultado;
las referencias σ son grises/púrpuras también en la cadena. La fixture confirmó
por DOM venta −1 → −2 → −1, filas de 34 px, curva teórica punteada y colores
computados rojo/verde. Sin inspección visual por píxeles.
