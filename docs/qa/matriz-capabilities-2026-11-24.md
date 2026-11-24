# Funciones de Matriz sin bloqueo por versión — 24/11/2026

Base: `ecd1e22`, rama `codex/ratios-native-history`.

## Política solicitada

Se retiraron las listas de versiones y las decisiones de habilitación por
número de versión de Matriz de los seis lectores: widget Ratios, Monitor de
ratios, gráfico nativo de ratios, mercado de opciones/caución, importación de
posiciones y lectura de ejecuciones. La versión que eventualmente se devuelve
en metadatos no habilita funciones ni cambia la identidad del contexto.
La ausencia del texto de versión en el pie tampoco impide las lecturas.

Se conservan los controles de funciones nativas, esquema de datos, IDs,
liquidaciones, cantidades, fechas, conexión, cuenta, contexto, cancelación,
secuencias y límites. Si una operación carece de una función o dato requerido,
informa ese problema concreto. No se eliminó el versionado de esquemas de
guardado local ni el control de versión del manifest de la extensión.

La caución se habilita según las funciones de lectura y suscripción disponibles.
El simulador propaga moneda y catálogo aunque la versión informativa esté vacía.

## Pruebas

- Se ejecutaron seis regresiones contra el código anterior: las seis fallaron
  con una versión posterior a la lista. Después del cambio pasan con la versión
  posterior, un número futuro arbitrario y el pie ausente.
- Las lecturas en curso continúan si sólo cambia el texto de versión. Siguen
  descartándose ante cambios reales de cuenta, catálogo o contexto nativo.
- Casos con funciones nativas ausentes siguen devolviendo el error correspondiente.
- Vitest: **575 PASS** en 27 archivos, incluidos casos de caución y moneda sin
  versión informativa.
- Tests Node de lectores/paquete: **88 PASS**; transporte: **2 PASS**.
- Seguridad: política, **14 PASS**, lint y verificación de fuentes/dist.
- TypeScript, build y empaquetado: PASS.
- Revisión independiente final: aprobada, sin observaciones pendientes.

## Apertura nativa y Cocos instalado

La primera comprobación instalada cargó el Monitor de Cocos sin el aviso por
versión y reveló dos diferencias de inicialización del gráfico:

1. La navegación nativa puede reescribir la URL a sólo `?interval=5`, quitando
   `ctRatio` y `ctRatioC`. Se conserva la solicitud capturada mientras siga en
   el mismo `/security/A`; otro instrumento o parámetros explícitos distintos
   siguen retirando la solicitud.
2. Las comparaciones pueden estar ocultas en `getStudiesList` aunque sus
   metadatos y API de creación estén disponibles. Se consultan las entradas de
   los nombres fijos Overlay/Compare y se espera la inicialización del widget.
   No se usa el número de versión para elegir el indicador.

Ambos indicadores se crearon correctamente en la comprobación nativa y se
retiraron únicamente los estudios temporales. Hay regresiones previas al arreglo
que fallaban para la limpieza de URL, metadatos ocultos y widget sin inicializar;
los 15 casos finales del lector de gráficos pasan. Compare también tiene un caso
que comprueba fuente close, eje izquierdo numérico y reutilización sin duplicados.

Se actualizó la carpeta estable de la extensión, conservando ID y almacenamiento,
con respaldo previo fuera del repositorio. Se compararon los 25 archivos del build
contra la instalación y se recargó la extensión.

Comprobación posterior del paquete instalado en Cocos:

- Monitor: **8 filas, 8 iconos, cero errores del módulo**.
- Simulador: **34 filas de cadena**, sin avisos por versión.
- Clic real en AL30/AL30D: pestaña nueva, velas de 5 minutos, Overlay AL30D
  visible en el panel principal y escala 0 (numérica), Ratio con fuente close
  y segundo símbolo AL30D, visible y numérico.
- El aviso de la solicitud sigue correcto después de que Cocos elimine los
  parámetros de ChuchoTriz de la URL.
- Se conservaron los estudios guardados ajenos, incluidos Compare/Ratio AL30C.
- El catálogo local del Monitor no tenía filas con C; no se agregaron pares
  reales sólo para la prueba. La variante C está cubierta por las regresiones.
- Extensión habilitada, cero errores de manifest y runtime en el administrador.
- La pestaña original de Cocos se recargó tras comprobar que no había borradores;
  quedó en Ratios con 8 filas y sin errores. Se dejó el gráfico nuevo abierto.

No se enviaron ni cancelaron órdenes. No se solicitaron reportes reales de
posiciones o ejecuciones para esta comprobación; esas lecturas se probaron con
fixtures. La apertura del gráfico no acredita continuidad de precios históricos.
Este informe actualiza la política descrita en los informes históricos anteriores.
