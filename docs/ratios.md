# Ratios de instrumentos

Dentro de un dashboard de Matriz, abrí **Nuevo widget → RATIOS · CHUCHOTRIZ**.
El panel se mueve desde su título y se redimensiona desde la esquina inferior
derecha, también con las flechas del teclado sobre ese control.

## Agregar y editar pares

1. Pulsá **＋** y buscá el instrumento **A · Numerador**.
2. Elegí una opción del catálogo, verificando ticker, mercado y moneda. El plazo
   está implícito en el ticker: por ejemplo, AL30 o AL30 CI.
3. Elegí **B · Denominador** y pulsá **Agregar**.

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

- Tests de cálculo: `src/ratios/model.test.ts`.
- Contrato del lector y guardado nativo: `node --test scripts/ratios-reader.test.mjs`.
- Prueba del bundle completo sin broker: `node tools/ratios-fixture.mjs`.
  Abrí la URL loopback informada en el navegador compartido y ejecutá
  `tools/validate-ratios-widget.playwright.js` con el MCP Playwright. Si el MCP
  restringe filenames al workspace original, copiá el validador a su carpeta
  ignorada `.playwright-mcp/` antes de llamarlo. No usa otro perfil.

El recorrido del bundle pasó 18 comprobaciones: cálculo, varios pares y widgets,
precios actualizados/faltantes, referencias faltantes, monedas/plazos distintos,
duplicados, inversión, edición, borrado, desconexión/reconexión, tamaño, cambio de
dashboard y recarga. Evidencias locales en `test-results/ratios-widget/`.

En la sesión de ReMarkets del 16/11/2026, los instrumentos consultados no tenían
último precio publicado, por lo que se verificó el estado **Sin último precio**.
La aritmética y las actualizaciones se verificaron con datos controlados en el
fixture, sin modificar las cotizaciones de ReMarkets.
