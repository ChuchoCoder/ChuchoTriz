# Simulador de opciones de Free

El simulador se abre desde el icono de ChuchoTriz en Matriz, pestaña **Simulador de
opciones**. La cadena conserva el diseño de Premium: calls a la izquierda, strike
central y puts a la derecha, con BID/ASK, cantidades, VI, delta, Theta teórico,
Extrínseco Mid, variación, volumen nominal y último precio operado. El armado no envía, modifica ni cancela órdenes.
Al abrir el simulador se consulta automáticamente la posición de opciones de la
cuenta activa para el subyacente y vencimiento iniciales. Si hay tenencia, aparece
en la grilla. Si la cadena está vacía o falla la consulta, quedan disponibles las
cotizaciones y el botón **Cargar posición**.

**⚙ Config.** reúne el filtro de VI y las casillas para mostrar, ocultar y
ordenar las columnas laterales. El orden se guarda por sitio y se refleja en
calls y puts. También podés cambiar una métrica desde su encabezado. BID, ASK,
VI y Strike quedan fijos. Entre las métricas opcionales están Mid, Spread %,
fecha y hora de última operación, precio de referencia, valor intrínseco y
Gamma y Vega teóricas.

Al abrir o cerrar el panel derecho de Matriz, la cadena se ajusta al espacio
disponible. En modo compacto, BID y ASK muestran precio y cantidad en dos
líneas. Si la selección de columnas supera el ancho disponible, la cadena
mantiene el desplazamiento horizontal.

Para acciones y CEDEARs, la barra de **Posición actual** también muestra los
nominales del subyacente informados por Matriz. La cantidad corresponde al
subyacente y se obtiene aunque el vencimiento seleccionado no tenga opciones
en cartera. Completá el **Costo promedio por nominal** en la moneda de la
simulación. Se guarda por cuenta, subyacente y moneda, y se pide de nuevo si
cambia la cantidad informada por Matriz. También podés editar los nominales del
borrador. Si cambiás el signo, ingresá el costo del nuevo sentido. Los nominales
editados y su costo quedan en ese borrador. **Recargar tenencia** restaura la
cantidad informada por Matriz y su costo guardado.

La misma cadena cambia a **Posición actual**, con cantidades firmadas y primas
históricas por unidad a ambos lados del strike. Conserva las marcas de desvíos
cuando hay precio y VI para estimarlas. Ingresá primero la cantidad.
Enter o salir del campo confirma el cambio. Dejarlo vacío o ingresar cero quita la pata.
La primera vez, la prima empieza vacía y debe completarse para calcular resultados
desde el costo. Cero es una prima válida cuando se ingresa explícitamente.
**Gastos de la posición** y **Resultado realizado neto** se editan en la barra
superior de la grilla. **Gastos de la posición** corresponde a cargos que todavía no están
incluidos en las primas. **Resultado realizado neto** permite sumar ganancias o
pérdidas de cierres anteriores, ya netas de sus propios gastos.

**Cotizaciones** recupera BID y ASK en la misma grilla. Las patas agregadas
desde ahí forman **Ajustes simulados**. Cantidades,
strikes, plantillas y Natural/Mid/Opuesto modifican esas patas adicionales.
Las primas históricas, gastos y realizado permanecen en la posición original.
**Limpiar ajustes** vuelve a la posición sin esas operaciones hipotéticas.
**Limpiar posición** vacía del borrador las patas, los gastos y el realizado de la
posición. **Recargar tenencia** consulta nuevamente Matriz y recupera las primas
históricas guardadas. Los ajustes de la misma cadena y cuenta se conservan.
Si una serie quitada del borrador vuelve a aparecer, revisá su prima recuperada.
**Nueva simulación** elimina el borrador y habilita otro contexto, conservando
los datos históricos guardados localmente para futuras importaciones.

Las primas, VI por pata, gastos y realizado se guardan automáticamente en este
perfil de Chrome, separados por cuenta, sitio y cadena (incluido el factor).
La carga de posición recupera esos datos aun después de cerrar el simulador o
reiniciar Chrome. En Armado, **Info** reúne el reporte y el estado de guardado.
Si falla el guardado, el aviso aparece en la barra de la grilla.

El check **Incluir posición actual en Análisis** está en la barra común de
**Armado** y **Análisis** y empieza desmarcado en cada simulación. El cálculo
usa solo los ajustes y sus propios gastos hasta que lo marques. Al marcarlo,
también incluye las patas y los nominales de la posición, resta sus gastos y suma
el realizado informado. Si un dato de la posición impide el cálculo, el aviso
ofrece acceso a la grilla de posición o al editor de VI, según el dato a corregir.
En ambas curvas, los nominales aportan la cantidad neta multiplicada por la
diferencia entre el precio del escenario y el costo promedio por unidad. La
fecha del reporte de Matriz aparece en **Info** y en **Análisis**. Si está
adelantada respecto del reloj local, también
se muestra la hora de consulta. Cada importación actualiza el reporte nativo. Si cambia la cantidad de
una serie, se conserva su prima y se muestra un aviso con la cantidad anterior y
actual. El aviso persiste hasta editar la prima o pulsar **Prima revisada**.
Si cambia de compra a venta o viceversa, la prima se vacía para evitar aplicar
el costo de una posición anterior al sentido opuesto. Las series nuevas empiezan
sin prima. Revisá también gastos y realizado luego de operaciones reales: no se
reconstruyen automáticamente y un cierre y reapertura con igual cantidad no puede
detectarse comparando únicamente los saldos.
Los saldos ambiguos o en garantía que no puedan reconciliarse se informan para
revisión, sin truncar la posición ni asignarles un costo supuesto.

La cabecera **ChuchoTriz** reúne las dos herramientas y abre primero el simulador.
Subyacente, vencimiento, estrategia, conteos y **Armado / Análisis** comparten
la barra de mercado. El filtro **⚙ VI** se abre desde el centro del encabezado.
Se retiraron **Mis estrategias** y **Entrada**;
el simulador no lee ni sobrescribe las estrategias guardadas anteriormente. Los
supuestos opcionales quedan en **Análisis → Supuestos de valuación**. La cadena
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
entrada/mitad del plazo/vencimiento. Los deslizadores recorren el eje de precios
visible, el cambio de VI hasta ±50 puntos porcentuales según la VI de las patas,
y los días desde la entrada hasta el vencimiento. Los campos junto a ellos permiten
ingresar valores exactos. La fecha de entrada se toma del día del armado.
La cadena aporta el subyacente, el precio de referencia, el vencimiento y el factor.
El vencimiento y el factor son editables cuando todas las patas son manuales. El
precio de referencia también se puede ingresar si la cadena no aporta uno.
Los botones **−** y **+** amplían o acercan el eje de precios en ambos gráficos.
**Ajustar** vuelve al rango automático que abarca strikes y puntos de equilibrio.
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

En Análisis los niveles numéricos se muestran aunque queden fuera del rango visible; las líneas
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

El encabezado Calls/VI/Puts incorpora los rangos de VI y desvíos. La marca
central del subyacente combina precio y variación diaria
cuando está disponible. Los desvíos llevan etiquetas centrales en negrita.
La cobertura y antigüedad de la escala quedan
en los tooltips. Solo aparece la advertencia de contratos incompletos si hay alguno;
se quitaron BID/ASK duplicados, hora local de lectura y escalas de volumen repetidas.

## Uso

1. Elegir subyacente y vencimiento. Siempre se muestran calls y puts. El mercado se
   elige automáticamente en la moneda del subyacente, con preferencia por 24 h y
   un único plazo común; no se mezclan mercados ni se convierten monedas.
2. Seleccionar un BID para simular venta o un ASK para simular compra. Seleccionar
   otra vez el mismo lado quita la pata. Seleccionar el contrario cambia el lado
   y toma el precio correspondiente. **Estrategia** abre el selector visual con
   Option, Vertical, Butterfly, Ratio Spread, Strangle, Straddle, Iron Condor y Jade Lizard.
   Cada fila permite alternar Long/Short y Call/Put cuando corresponde, o
   Normal/Reversed. El dibujo y las patas se previsualizan sin modificar el armado.
   **Armar** reemplaza las patas con contratos de la cadena y las cantidades de la plantilla.
   Tanto en la grilla como en las plantillas, si falta la punta se usa el último
   operado. Si tampoco hay último, completá el precio en **Armado**. El selector
   deshabilita **Armar** y explica el motivo si la estructura no se puede formar,
   por ejemplo por strikes insuficientes, factores incompatibles o un libro cruzado.
3. Las patas se muestran en este orden: chip **C / P**, cantidad con signo,
   fecha de vencimiento (**Diciembre 13**), días (**17d**) y strike. Una cantidad positiva
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
   **Cantidad −/+** conserva la proporción entera: 1:2:1 pasa a 2:4:2, luego a
   3:6:3; bajar vuelve una unidad de esa proporción. Doble clic ajusta diez
   unidades de proporción en total (1:2:1 → 11:22:11). No baja cantidades a cero.
   Cada pata tiene además botones **− / +** junto a su cantidad: quitan o agregan
   un contrato (diez con doble clic) solo en esa pata, conservando su sentido (una venta −1 pasa a −2
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
   Los precios individuales/manuales siguen en **Análisis → Supuestos de valuación →
   Precios de entrada por pata**. Crédito/débito, ganancia y pérdida máximas
   globales al vencimiento se muestran en una sola fila, con **∞** cuando son
   ilimitadas. La moneda se toma del mercado; no hay selector de moneda o plazo.
4. Entrar en **Análisis** para consultar el gráfico al vencimiento y el teórico;
   usar los toggles o modificar manualmente precio del escenario, fecha objetivo,
   cambio de VI en puntos porcentuales, tasa y dividendos. Clic o toque en el gráfico
   fija el precio; mover el cursor no cambia la selección. **Precio del escenario**
   permite ingresarlo con teclado. Debajo del gráfico se muestran el precio fijado
   y ambos resultados, sin slider de precio.

El subyacente y vencimiento elegidos se recuerdan por sitio de Matriz dentro del
perfil de Chrome. Si el catálogo ya no incluye esa selección, se usa una disponible.
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
El selector toma ASK para compras y BID para ventas. Si falta una punta, usa el
último precio operado y lo identifica en la vista previa. **Armar** carga la
estructura aunque falten precios. Las patas sin punta ni último operado quedan
con el precio vacío para completar en **Armado**.

Cuando están todas las primas, la vista previa usa las proporciones de cada pata,
el factor y los gastos para mostrar el resultado al vencimiento y los máximos de
ganancia y pérdida. Comparte el motor del gráfico principal. El eje horizontal
marca el resultado cero. Verde indica ganancia y rojo indica pérdida. Si falta
una prima, el resultado queda pendiente y se conserva el icono esquemático.

`resultado = Σ sentido × contratosDeLaPata × factor × (valor − prima) − gastos`

No hay multiplicador global de combos. La cantidad de cada pata es su total de
contratos; su signo en la interfaz indica compra o venta.

Compra tiene sentido +1 y venta −1. Al vencimiento, valor es el intrínseco.
Máximos y equilibrios se calculan sobre todos los tramos lineales desde 0 hasta
infinito, sin limitarse al rango del gráfico. Incluye colas ilimitadas, equilibrios
puntuales y tramos enteros de equilibrio.
Con nominales del subyacente, el rango inicial del gráfico prioriza el precio
de referencia, los strikes y los equilibrios cercanos. Los equilibrios lejanos
siguen en el resumen y se pueden ver en el gráfico ampliando el rango con **−**.

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

### Resultados con primas en el selector y armado compacto

Se reprodujo el IC de crédito 360 ARS con una regresión que fallaba: la vista
previa usaba el pago intrínseco normalizado al spot y dejaba la meseta central
en cero. Una prueba separada confirmó que el gráfico principal ya calculaba
ganancia 360 ARS y pérdida máxima 640 ARS. El selector ahora comparte
`resultAt`/`expirySummary`, incluye primas ASK/BID, factor, proporciones y gastos,
y dibuja los strikes y equilibrios exactos alrededor del eje cero. El gradiente
en coordenadas del gráfico separa ganancia verde y pérdida roja; no se fuerza
una zona rentable cuando las primas hacen que toda la estructura pierda.

Las regresiones cubren las ocho familias, variantes, riesgos ilimitados,
equilibrios, gastos, datos faltantes y precisión bruta. El panel de patas reúne
título, strike, cantidades y limpiar en una sola fila. Reduce filas a 28 px,
integra pérdida máxima junto al crédito/débito y compacta las referencias de
entrada. La fixture confirmó por geometría DOM las cuatro filas de 28 px y los
controles alineados, cantidades globales 1→2→1 y ajustes individuales.

357 tests Vitest y 13 tests Node aprobados, junto a seguridad (10 tests), lint,
TypeScript y empaquetado. Verificación del navegador compartido por DOM y
colores computados; estaba oculto, sin inspección visual por píxeles.

### Barra de precio de entrada

Natural, Mid y Opuesto se integran en una sola barra fina con importes `cr`/`db`
debajo, marcas en extremos/centro e indicador arrastrable. Las referencias
siguen siendo botones accesibles por teclado; el slider conserva su valor
descriptivo completo en moneda. En estructuras de crédito se rotulan BID (NAT)
y ASK (OPP), y en débito se invierten; si las puntas cruzan cero se usan los
nombres Natural/Opuesto. La clasificación BID/ASK toma las primas antes de
gastos, mientras los importes y el crédito/débito mostrado incluyen gastos.

31 pruebas de interfaz, TypeScript, lint y empaquetado aprobados. Se verificaron
en la fixture crédito (360/400/440 cr), débito (810/800/790 db), selección Mid,
interpolación al 75 % y alineación. Se inspeccionó una captura del panel con
el navegador compartido visible.

### Cantidades con doble clic

Los botones por pata y los globales de cantidad usan `−`/`+`: un clic ajusta una
unidad y un doble clic diez en total. El segundo evento `click` del doble clic
completa nueve unidades adicionales, sin demorar el clic simple. El ajuste
global mueve unidades de la proporción actual (1:2:1 → 11:22:11); por pata mueve
contratos, conservando compra/venta. Los extremos se limitan a una unidad de la
proporción y al máximo permitido, sin pasar por cero ni alterar relaciones.

360 tests Vitest, 13 Node, lint, TypeScript y empaquetado aprobados. Las pruebas
cubren los eventos click/click/dblclick completos, límites y ambos controles.
La fixture confirmó las secuencias por eventos DOM y las etiquetas `−`/`+`.
El navegador compartido estaba oculto; los intentos con mouse no entregaron
eventos y no se consideran validación de interacción física.

### Máximos del armado y resultado rápido reducido

La cabecera del precio de entrada reúne crédito/débito, ganancia máxima y pérdida
máxima en una sola fila. Usa los extremos globales de `expirySummary` (incluye
primas y gastos), con `∞` en resultados ilimitados. Los importes extensos se
pueden recorrer horizontalmente sin partir la fila ni ocultar valores.

El gráfico rápido mide 190 px de alto. Conserva eje cero, colores por signo,
curvas, referencias σ y fijación de precio; quita el texto repetido de supuestos,
el desglose σ y la instrucción inferior. Precio y resultados quedan en una fila.
Las fechas y supuestos siguen disponibles en títulos y en Análisis, que conserva
el gráfico completo de 340 px y sus explicaciones.

33 pruebas de interfaz, lint, TypeScript y empaquetado aprobados. La fixture
confirmó por geometría y captura visible IC 360/360/640 ARS en una sola fila sin
desborde, panel rápido de 304 px y resultados alineados. Las regresiones verifican
ganancia ilimitada de la call comprada y pérdida ilimitada de la call vendida.

### Validación del PR

La revisión de estándares y requisitos corrigió los extremos con factor decimal,
los equilibrios de importes pequeños, la validación de libros cerrados o cruzados
y el selector de moneda restante. Playwright detectó que el aviso del primer clic
desplazaba el botón global de cantidades antes del segundo clic. El aviso sigue
disponible para lectores de pantalla y ya no altera la posición del botón.

Para repetir el recorrido, ejecutar `npm run package:free`, iniciar
`tools/preview-free.mjs` con `CHUCHOTRIZ_PREVIEW_PORT=60472` y seleccionar
`http://127.0.0.1:60472/fixture` en el perfil compartido de ChuchoTriz. Pasar la
función de `tools/validate-options-simulator.playwright.js` al argumento `code`
de `browser_run_code_unsafe`. Si el navegador está oculto, se puede activar
temporalmente `Emulation.setFocusEmulationEnabled` en el tab de la fixture y
restaurarlo al terminar. El reporte distingue clics de Playwright y eventos DOM.

Pasaron las 34 comprobaciones en la fixture, con 136 interacciones de puntero.
El recorrido cubre las 24 variantes de las ocho familias, cantidades, strikes,
referencias de entrada, gráficos y escenarios, además de cotizaciones cruzadas,
VI ausente y recuperación ante desconexión. Usa el paquete de producción con
datos sintéticos locales.
