# Ratios de instrumentos

## Monitor y registro de operaciones

En **Configuración → Ratios** hay tres pasos: Monitor, Abrir operación de ratio
y Operaciones abiertas. Este tab usa cotizaciones nativas de Matriz y un registro
manual local. Abrir o cerrar un registro no manda órdenes al broker.

- Agregá los pares al monitor; un ticker exacto y único se resuelve al salir del
  campo. El par sigue en el monitor después de registrar una apertura.
- Ingresá la cantidad A y elegí sus precios y los de B desde Bid, último, Ask o
  escribiéndolos. B se dimensiona al lote más cercano para igualar los montos
  brutos, usando factores de cotización verificados del catálogo (bonos por 100
  nominales: factor 0,01). Los precios elegidos no se mueven con el mercado.
- La comisión es un solo porcentaje, inicialmente 0%, para cada compra/venta
  de entrada y salida. Los DDMM están dentro de cada pata y son editables.
- Si las monedas coinciden, ratio y objetivo son `(A/B − 1) × 100`; en monedas
  distintas se usa A/B. El objetivo se guarda siempre como cociente positivo;
  0% equivale a 1. El objetivo se alcanza al alza para Long A o a la baja para
  Short A. Es independiente del P&L monetario.
- Para monedas distintas ingresá una conversión explícita para dimensionar B.
  El P&L se muestra separado por moneda; no suma ARS, USD y USD C.
- Cada operación conserva entradas, cantidades, factores y tasas. Su neto incluye
  los gastos de apertura y el cierre estimado al último precio. Los cierres del
  25%, 50% o total usan precios reales ingresados y congelan el realizado.
- Editar reemplaza el mismo registro y conserva cierres. Tras cierres parciales
  no se cambian instrumentos/sentido/unidades y las cantidades totales deben
  cubrir lo cerrado. Corregir la entrada o gastos recalcula el resultado histórico.
  Eliminar admite deshacer; los registros cerrados también pueden eliminarse.

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

1. Pulsá **＋** y buscá el instrumento **A · Numerador**.
2. Ingresá el ticker completo: al salir del campo se elige automáticamente si
   hay una coincidencia exacta única. También podés elegir una opción del catálogo,
   verificando ticker, mercado y moneda. El plazo
   está implícito en el ticker: por ejemplo, AL30 o AL30 CI.
3. Elegí **B · Denominador** y pulsá **Agregar**.

El formato **Mostrar → Número / Porcentaje (%)** se configura por cada fila y
queda guardado con el par. El porcentaje representa `(A/B − 1) × 100`: un ratio
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

El recorrido del bundle pasó 22 comprobaciones: cálculo, varios pares y widgets,
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
