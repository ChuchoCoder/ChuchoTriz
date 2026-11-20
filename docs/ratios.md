# Ratios de instrumentos

## Monitor y registro de operaciones

En **Configuración → Ratios** hay tres pasos: Monitor, Abrir operación de ratio
y Operaciones abiertas. Este tab usa cotizaciones nativas de Matriz y un registro
manual local. Abrir o cerrar un registro no manda órdenes al broker.

## Dólar oficial y brecha contra MEP

El selector encuentra **DLR/SPOT** al buscar **Dólar oficial**, **Dólar USA** o
**DLR/SPOT**. Se toma el spot nativo que alimenta el último de la cabecera
**Dólar USA** de A3, sin usar un contrato de futuro ni el producto agrupador.
Es una referencia de sólo monitor y no admite registrar una operación long/short.
Si ese spot no está en el catálogo, no se ofrece una cotización alternativa.

Los widgets y registros nuevos incluyen por defecto las brechas **MEP/oficial**
y **CCL/oficial** con AL30, ambas en porcentaje. Los widgets guardados conservan
sus filas; en registros existentes del tab, **Agregar pares predeterminados**
agrega los faltantes sin duplicar ni reordenar. Si falta el spot oficial, se
omiten las dos brechas y se informa cuáles no pudieron cargarse.

Para agregar manualmente la brecha MEP/oficial, tanto en el Monitor como en el widget:

1. Elegí **AL30** como A y **AL30D** como B, con el plazo que quieras comparar.
2. En el tab, marcá **Agregar referencia C**; en el widget, **Comparar A/B con una referencia**.
3. En **Referencia C**, buscá **Dólar oficial** y seleccioná **DLR/SPOT**.
4. Agregá el par. El widget propone **Porcentaje (%)**; el Monitor muestra la
   brecha porcentual. También podés conservar el AL30/AL30D simple en otra fila.

La fila se identifica como **(AL30/AL30D) / DLR/SPOT** y muestra por separado los
últimos A, B y C. La brecha es `((A / B) / C − 1) × 100`. Por ejemplo, con datos
ficticios, MEP de 1.600 y oficial de 1.572,50 da **1,75%**; si ambos son 1.600,
da **0,00%**. En el widget, **Número** muestra `(A / B) / C`.

La referencia es opcional y también puede ser otro instrumento del catálogo.
Sin último válido de C o con C menor o igual a cero se muestra **—**, sin volver
al ratio simple. La variación diaria compara la fórmula completa con las tres
referencias diarias nativas; una referencia ausente o fechas distintas oculta
sólo esa variación. Los datos se actualizan con las cotizaciones de Matriz y la
selección queda guardada al recargar.

Las comparaciones con C son de sólo monitor. **Invertir A/B** queda desactivado
en esas filas para no cambiar inadvertidamente la fórmula completa: editá el
widget o quitá/agregá la fila del Monitor para elegir otra comparación.

Los guardados con C usan schema 2, que las versiones anteriores no interpretan.
Al quitar la última referencia C vuelven a schema 1. Después de actualizar la
extensión, recargá las pestañas de Matriz antes de usar estas comparaciones.

## Pares del monitor

El monitor inicial incluye, en este orden: AL30/AL30D, AL30/AL30C,
AL30D/AL30C, GD30/AL30, BMA/GGAL, ALUA/TXAR, TGSU2/TGNO4 y
PESOS - 7D/PESOS - 1D, (AL30/AL30D) / DLR/SPOT y (AL30/AL30C) / DLR/SPOT. En registros existentes se agregan sólo los faltantes,
sin reordenar ni duplicar los pares personalizados ni modificar operaciones.
La inicialización se guarda una sola vez: si quitás un par, no reaparece al
recargar. **Agregar pares predeterminados** permite recuperar los faltantes.
Se resuelven coincidencias exactas y únicas de BYMA del catálogo de cada sitio;
los pares no disponibles o ambiguos se informan para reintentar explícitamente.

Las cauciones PESOS muestran sus últimos valores como **% TNA**. Su ratio
compara tasas `(TNA A / TNA B − 1) × 100`. Estos pares tienen **Sólo monitor**:
una TNA no es un precio de compra/venta y no se usa para registrar un long/short
ni para calcular P&L de instrumentos con precio. El resto del monitor mantiene
los formatos y el flujo de apertura habituales.

La tabla adapta sus columnas al contenido y agrupa los controles de alta y
restauración en una fila (se reacomodan en pantallas angostas). **Var. diaria**
es `(ratio actual / ratio de referencia diaria − 1) × 100`, calculada desde
`md.refp` y las fechas de referencia de Matriz. No es la diferencia entre los
porcentajes mostrados del ratio. Sin referencia válida, o con fechas distintas,
muestra **—** con el motivo al pasar el cursor y conserva el ratio actual.

**⇄ Invertir A/B** conserva la fila y recalcula el ratio y su variación diaria;
no cambia las operaciones registradas. Si el par inverso ya está en la tabla,
se informa para evitar duplicados. Precios y ratio usan el mismo resaltado de
opciones: verde al subir, rojo al bajar, con limpieza a los 500 ms. No se resalta
la carga inicial, un dato faltante ni el cambio de identidad al invertir. Con
movimiento reducido se usa una marca estática breve.

- Agregá los pares al monitor; un ticker exacto y único se resuelve al salir del
  campo. El par sigue en el monitor después de registrar una apertura.
- Elegí los instrumentos y precios de entrada desde el book, último o
  escribiéndolos, y luego ingresá la cantidad A. Con la misma moneda, B se dimensiona al lote más cercano para
  igualar montos brutos, usando factores nativos (bonos por 100 nominales: 0,01).
  Con monedas distintas, B copia exactamente los nominales de A, sin conversión
  ni dependencia de los precios; la cantidad debe respetar los lotes de ambas
  patas. Los precios elegidos no se mueven con el mercado.
- Cada pata presenta instrumento → precio → cantidad en una sola fila, con los
  tres inputs alineados y de la misma altura, seguido del book compacto
  de cinco niveles: Vol. C, Compra, Venta y Vol. V. Los datos son los mismos del
  book nativo: mejor punta desde `md.bid/bsz/ask/asz` y cuatro niveles siguientes
  desde `book.*Book1..4`. Un click en cualquier precio publicado lo fija como
  entrada; no copia volumen a la cantidad, no precarga el Mini Order Form ni
  registra una operación. Los niveles incompletos muestran — y no se pueden
  seleccionar. La compra seleccionada se marca en verde y la venta en rojo;
  El último precio y la variación diaria de cada instrumento se muestran
  centrados en el encabezado azul, con la misma tipografía de Compra/Venta y
  sin etiqueta «Último». Tocar el número fija ese precio como entrada; el
  encabezado sigue mostrando el mercado aunque se elija otro precio. La
  variación usa `(último / referencia diaria − 1) × 100`; sin referencia muestra —.
  El precio manual sigue disponible.
- La apertura empieza con las dos direcciones identificadas por ticker
  (por ejemplo, Long BMA / Short GGAL y Long GGAL / Short BMA), con el ratio
  de apertura entre ambas. Se omite el bloque repetido de título y par.
  Pulsar una dirección carga y resalta la mejor Ask para la pata long y la
  mejor Bid para la short, incluso al pulsar otra vez la dirección activa.
  Actualiza el ratio y el dimensionamiento B con esos precios, conservando A.
  Los precios quedan fijos hasta otra selección. Si falta una punta, deja ese
  precio vacío y avisa; admite ingreso manual o reintento, sin sustituirlo por
  último ni niveles más profundos. Elegir la dirección no registra la apertura.
- La comisión es un solo porcentaje, inicialmente 0%, para cada compra/venta
  de entrada y salida. Los DDMM de cada pata son editables y aparecen antes
  de su Monto A/B, en la misma fila del resumen debajo de los books.
- Si las monedas coinciden, ratio y objetivo son `(A/B − 1) × 100`; en monedas
  distintas se usa A/B. El objetivo se guarda siempre como cociente positivo;
  0% equivale a 1. El objetivo se alcanza al alza para Long A o a la baja para
  Short A. Es independiente del P&L monetario.
- No se pide tipo de cambio para dimensionar cantidades. El P&L se muestra
  separado por moneda; no suma ARS, USD y USD C. Al editar un registro anterior
  con distinta cantidad B se conserva esa cantidad hasta cambiar A o los
  instrumentos, sin modificar cantidades históricas al corregir otro campo.
- Cada operación conserva entradas, cantidades, factores y tasas. Su neto incluye
  los gastos de apertura y el cierre estimado al último precio. Los cierres del
  25%, 50% o total usan precios reales ingresados y congelan el realizado.
- Editar reemplaza el mismo registro y conserva cierres. Tras cierres parciales
  no se cambian instrumentos/sentido/unidades y las cantidades totales deben
  cubrir lo cerrado. Corregir la entrada o gastos recalcula el resultado histórico.
  Eliminar admite deshacer; los registros cerrados también pueden eliminarse.
- En Operaciones abiertas, el par mantiene el orden A/B: cada instrumento usa
  un chip verde con «Long» o rojo con «Short», según el lado registrado. El
  estado Abierta/Parcial/Cerrada permanece debajo, sin repetir el sentido A/B.

### Columnas y hora del último valor

En Monitor y Operaciones abiertas, **Columnas** permite mostrar u ocultar los
campos opcionales y **Restablecer columnas** recupera la configuración inicial.
Par y Acciones permanecen visibles; en Operaciones también permanece Estado,
separado de los chips Long/Short para mantenerlos centrados en la fila. Las preferencias se guardan por cuenta/sitio
y por grilla, independientemente del registro de operaciones. Ocultar una columna
por la que se está ordenando vuelve al orden manual.

**Últ. valor** muestra `HH:mm:ss` de Argentina: la hora de mercado más reciente
de los precios que forman el ratio (A/B, incluyendo C si se usa una referencia).
Se puede ordenar por esa hora. No es la hora del refresco de pantalla; si falta
alguna hora o no puede calcularse el ratio, muestra **—**. El tooltip incluye
la fecha y hora completas para distinguir cotizaciones de días anteriores.

### Orden y lectura de las grillas

Monitor y Operaciones abiertas tienen encabezados con fondo, filas alternadas,
resaltado al pasar el cursor y una marca para la operación seleccionada. Los
encabezados permanecen visibles al desplazarse dentro de una lista larga;
en pantallas angostas la grilla tiene desplazamiento horizontal propio.

- Clic en un encabezado: ascendente → descendente → orden manual. Se ordenan
  los valores numéricos publicados, no los textos formateados; los valores
  ausentes siempre quedan al final. Ratio/brecha usa el valor mostrado y la
  columna de cantidad ordena por la cantidad abierta de A.
- Arrastrá el agarre ⠿ hasta otra fila para guardar su posición. También podés
  enfocarlo y usar ↑/↓ varias veces seguidas. Si partís de una vista ordenada,
  ese orden visible, con el movimiento aplicado, pasa a ser el nuevo orden manual.
- El orden manual se guarda por cuenta/sitio y sobrevive a la recarga. Con el
  filtro Abiertas, las operaciones cerradas conservan sus posiciones ocultas.
  Ordenar por columna sólo cambia la vista durante la sesión, sin escribir el
  registro; **Orden manual** recupera las posiciones guardadas.
- Para ordenar Realizado/Pendiente/Neto con varias monedas, elegí **P&L en**.
  Se compara sólo esa moneda, sin sumar ARS, USD o USD C; los registros sin
  importe en la moneda elegida quedan al final.
- Un movimiento guarda únicamente la posición: conserva instrumentos, cantidades,
  entradas, tasas, objetivos e historial. Si otra pestaña cambia el registro
  durante el arrastre, el movimiento desactualizado se rechaza.

Se guardan hasta 100 pares y 500 operaciones, separadas por cuenta y sitio en
`chrome.storage.local`. La revisión y un bloqueo entre pestañas previenen
sobrescrituras de ediciones viejas. Un cambio de cuenta limpia la vista antes de
cargar el registro correspondiente. Al desinstalar o borrar los datos del perfil
se pierde este registro; no es el historial del broker. El widget del dashboard
continúa usando su guardado nativo independiente.

### Procedencia de los DDMM

Defaults tomados de `C:/git/chuchobot-premium`, commit
`b12dbdaa84f153b06425788bb5475360a4441bff`,
`Primary.WinFormsApp/Shared/InstrumentExtensions.cs` (`GetDerechosDeMercado`),
`Properties/Settings.settings` y `App.config`. Se porta sólo el componente DDMM,
sin la comisión de Premium:

| CFI de Matriz (BYMA) | Tipo | DDMM inicial |
| --- | --- | --- |
| ESXXXX / EMXXXX | Acción / CEDEAR | 0,0847% (0,07% + IVA 21%) |
| DBXXXX / DBXXFR | Bono / ON | 0,01% |
| DYXTXR | Letra | 0,001% |
| OCASPS / OPASPS / OCAFXS / OPAFXS / FXXXSX | Opción / futuro | 0,01% (default general de Premium, sólo BYMA) |

No se infiere el tipo por el ticker. Para tipos o mercados sin regla verificada,
la tasa queda vacía y debe completarse. Un factor/lote ausente también exige una
entrada explícita. Son valores iniciales editables, no una consulta de aranceles
vigentes al broker, ni un vínculo en ejecución con ChuchoBot Premium.

Tests específicos: `src/ratios/trading*.test.ts` y
`scripts/ratio-operations-reader.test.mjs`. El validador
`tools/validate-ratio-operations.playwright.js` recorre el bundle real sobre el
fixture loopback de `tools/preview-free.mjs`, con catálogo/precios sintéticos;
se ejecuta con Playwright MCP compartido. Ver `docs/manual-regression.md`.

## Widget del dashboard

Dentro de un dashboard de Matriz, abrí **Nuevo widget → RATIOS · CHUCHOTRIZ**.
El panel se mueve desde su título y se redimensiona desde la esquina inferior
derecha, también con las flechas del teclado sobre ese control.
El ancho inicial es de 560 px y se puede reducir hasta 360 px. La grilla de Matriz
impide solapar otros widgets al moverlos: el destino debe tener espacio libre.

## Agregar y editar pares

Cada widget nuevo comienza, en este orden, con AL30/AL30D, AL30/AL30C,
AL30D/AL30C, GD30/AL30, BMA/GGAL, ALUA/TXAR, PESOS - 7D/PESOS - 1D, (AL30/AL30D) / DLR/SPOT y
(AL30/AL30C) / DLR/SPOT.
Se resuelven las especies BYMA exactas del catálogo y se aplica el formato por
moneda. Si alguna falta o tiene varias coincidencias, se omite ese par y se
informa en el widget, sin inventar instrumentos. Las filas se pueden editar o
eliminar; no se vuelven a insertar al recargar ni se cambian widgets existentes.

1. Pulsá **＋**: el foco queda en **A · Numerador**. **Tab** pasa directamente
   a **B · Denominador**, y **Shift+Tab** vuelve a A.
2. Ingresá el ticker completo: al salir del campo se elige automáticamente si
   hay una coincidencia exacta única. También podés elegir una opción del catálogo,
   verificando ticker, mercado y moneda. El plazo
   está implícito en el ticker: por ejemplo, AL30 o AL30 CI.
3. Elegí **B · Denominador** y pulsá **Agregar**.

El formato **Mostrar → Número / Porcentaje (%)** se configura por cada fila y
queda guardado con el par. Al agregar un par, se propone **Porcentaje** si ambos
instrumentos tienen la misma moneda conocida y **Número** si tienen monedas
distintas o falta esa información. Una elección manual y los formatos ya guardados
se respetan. El porcentaje representa `(A/B − 1) × 100`: un ratio
de 1,065 se muestra como 6,50 %. Es independiente de la columna de variación
diaria. En formato número, los valores de magnitud al menos 100 se muestran con
dos decimales; por ejemplo, 1.584,986387 se muestra como 1.584,99. Los ratios
más pequeños conservan hasta seis decimales.

El ticker admite espacios exteriores y mayúsculas/minúsculas. `AL30 CI` también
encuentra la especie nativa `AL30 (CI)`. Si varios instrumentos comparten el
ticker exacto, se solicita una selección explícita en vez de adivinar la especie.

Cada fila muestra par, último A, último B, ratio y variación diaria. El lápiz
edita el par, **⇄** invierte A/B y **×** elimina la fila. La **×** del título
retira sólo ese widget del dashboard. Se admiten varios paneles y hasta 50 pares
por panel; no se permiten pares idénticos repetidos en el mismo panel.

Se usa el catálogo disponible en Matriz: acciones, CEDEARs, bonos, especies en
dólares, futuros, opciones y otros instrumentos publicados. No se fabrican
instrumentos ausentes ni se incluyen portfolios sintéticos de la cuenta.

Los selectores distinguen especies del mismo símbolo por mercado, moneda y
liquidación. La moneda nativa `EXT` se identifica como **USD C**; se conserva
su identidad separada de USD. No se presupone ARS para monedas desconocidas.

## Cálculo y datos faltantes

```
Ratio = último A / último B
Variación diaria % = (ratio actual / (referencia A / referencia B) − 1) × 100
```

La referencia diaria es el precio de referencia `md.refp` publicado por Matriz.
No se reemplaza por el último, BID/ASK ni por un cierre de fecha desconocida.
Si ambas referencias informan fecha y no coinciden, se omite la variación.

Los precios se dividen **tal como cotizan**. No se convierten monedas, ajustan
ratios de CEDEARs ni normalizan unidades de cotización de bonos. Por ejemplo,
AL30/AL30D conserva la división entre los dos precios publicados.

Un precio faltante, un denominador cero o un instrumento ausente se informa
en la fila. Si falta sólo una referencia, el ratio sigue visible sin variación.
Las filas ocupan una sola línea. Al pasar el mouse se pueden consultar mercado,
moneda y fechas/horas de ambas últimas operaciones. Un indicador de reloj destaca
si alguna supera 15 minutos. Los motivos de datos faltantes se consultan al pasar
el mouse por el valor y se conservan para lectores de pantalla. No se confunde la
hora de lectura con la operación.
Al desconectarse Matriz se retiran los valores de mercado; al reconectar se
reinicia la verificación de secuencias y se solicitan suscripciones nuevamente.

## Guardado y compatibilidad

Pares, orden de filas, identidad del widget, posición y tamaño se guardan mediante
el guardado nativo del dashboard de Matriz. Los cambios de pares se confirman
con una lectura nueva del servidor. Ante un guardado no confirmado, se muestra
un aviso y debe comprobarse el estado al recargar antes de repetir el cambio.

El cierre/eliminación se hace por identidad exacta, sin usar la agrupación por
instrumento de los widgets nativos vacíos. El ajuste de tamaño conserva las
dimensiones de los otros widgets cuando Matriz redondea sus unidades de grilla.

Disponible en los dominios admitidos por ChuchoTriz: `https://*.xoms.com.ar/*`
y `https://remarkets.matriz.com.ar/*`. La integración comprueba la estructura del
dashboard y admite las versiones 4.23.16, 4.24.1 y 4.24.4; rechaza otras versiones
con un aviso. El recorrido instalado se verificó en ReMarkets 4.23.16.

Sin ChuchoTriz, Matriz conserva el registro del panel pero su contenido queda
vacío. Para retirarlo antes de desinstalar, cerrá el panel desde su título.

## Verificación

- Tests de cálculo: `src/ratios/model.test.ts`; selección al salir del campo y
  respuestas asíncronas: `src/ratios/InstrumentPicker.test.tsx`.
- Contrato del lector y guardado nativo: `node --test scripts/ratios-reader.test.mjs`.
- Prueba del bundle completo sin broker: `node tools/ratios-fixture.mjs`.
  Abrí la URL loopback informada en el navegador compartido y ejecutá
  `tools/validate-ratios-widget.playwright.js` con el MCP Playwright. Si el MCP
  restringe filenames al workspace original, copiá el validador a su carpeta
  ignorada `.playwright-mcp/` antes de llamarlo. No usa otro perfil.

El recorrido del bundle pasó 37 comprobaciones: pares iniciales y su persistencia,
formato predeterminado por moneda,
elección manual, foco inicial, Tab entre instrumentos,
resolución del ticker sin mover el foco, cálculo, varios pares y widgets,
precios actualizados/faltantes, referencias faltantes, monedas/plazos distintos,
duplicados, inversión, edición, borrado, desconexión/reconexión, tamaño, cambio de
dashboard y recarga, selección exacta al salir del campo y formato persistido por
fila. Evidencias locales en `test-results/ratios-widget/`.

Los contenedores descartables de pruebas deben retirarse al terminar. Matriz
reserva su posición aunque no dibuje su contenido: un contenedor de tipo
desconocido puede quedar invisible y bloquear un destino de arrastre. El
contenedor inicial de la prueba de integración fue retirado por identidad exacta;
se comprobó el mismo gesto antes bloqueado y su persistencia tras recargar.

En la sesión de ReMarkets del 16/11/2026, los instrumentos consultados no tenían
último precio publicado, por lo que se verificó el estado **Sin último precio**.
La aritmética y las actualizaciones se verificaron con datos controlados en el
fixture, sin modificar las cotizaciones de ReMarkets.

En Cocos 4.24.4 se verificaron selección automática de AL30, AL30D y AL30 CI,
AL30/AL30D con dos decimales (1.584,99) y AL30D/AL30C en porcentaje (6,16 %),
con variación diaria independiente (+0,01 %). El formato sobrevivió a la recarga;
se restauró después la presentación original en número, conservando los cinco
pares, su orden, posición y tamaño. Las cotizaciones no se alteraron.
