# Ratios: orden y lectura de grillas — 20/11/2026

Base main `cb9f9d19db33056d762af13d9c134c63c12f7da2` (Free 0.0.28).
Monitor y Operaciones abiertas: orden por columna y manual con arrastre/teclado,
encabezados con fondo, filas alternadas, hover, selección y ajuste claro/oscuro.
El book de apertura y los widgets del dashboard no cambian.

## Comportamiento

- Encabezados: ascendente → descendente → manual, con flecha y aria-sort.
  Se comparan números sin parsear textos; ausentes al final en ambos sentidos.
- Arrastrar desde una proyección ordenada guarda ese orden visible con el
  movimiento aplicado. El guardado existente conserva cuenta/sitio, WebLocks,
  revisión y verificaciones de contexto. No cambia campos financieros.
- Con Abiertas se mueven sólo los slots visibles; los registros cerrados se
  conservan en sus posiciones ocultas. El orden manual sobrevive a la recarga.
- Los grips admiten varias pulsaciones ↑/↓ sin volver a enfocar. Durante un
  guardado rechazan otro movimiento mediante aria-disabled, sin perder el foco.
- El orden por columna es de sesión y no escribe el registro. Una selección
  posterior de columna/moneda no se descarta al terminar un guardado anterior.
- P&L: selector de moneda cuando corresponde; no se suman monedas distintas.

## Validación

| Control | Resultado |
| --- | --- |
| Tests completos | 558 Vitest + 67 Node + 2 QA infra = **627 PASS** |
| Helper de grillas | 5 casos, incluidos empates, ausentes, slots ocultos e IDs inválidos |
| Regresión del tab sobre bundle de producción | **30 recorridos Playwright PASS** |
| Seguridad, política y lint | PASS |
| Compilación y paquete Free | PASS; 24 archivos |
| Revisión independiente | Sin hallazgos pendientes tras corregir dos detalles de interacción |

Los recorridos añadidos comprueban orden numérico, ausencia de escrituras al
ordenar por columna, arrastre real desde una vista ordenada en ambas grillas,
teclado consecutivo, recarga, moneda, registros ocultos, snapshot financiero
sin cambios, guardado demorado con un nuevo sort y rechazo de un drag con
revisión vieja. Catálogo y registros sintéticos únicamente en el fixture loopback
del perfil compartido, con foco emulado para evitar throttling de pestañas ocultas.

Las capturas locales `test-results/grid-monitor-dark.png`,
`grid-monitor-light.png`, `grid-operations-dark.png`, `grid-operations-light.png`
y `grid-narrow.png` documentan la presentación. Se corrigió también el contraste
de botones activos en tema claro y el overflow del contenedor a 420 px.

## Revisión y correcciones

La revisión detectó una posible pérdida del foco por deshabilitar nativamente
el grip durante el guardado y una carrera que podía borrar un sort más reciente.
Se corrigieron con aria-disabled y guardas de interacción, y con una versión de
intención por grilla. Los recorridos de teclado consecutivo y guardado bloqueado
comprobaron ambas correcciones. La revisión estática posterior no encontró
otros P1/P2/P3; su condición de validación en navegador quedó satisfecha.

## Instalación compartida

Compilación de desarrollo basada en Free 0.0.28, no una nueva release publicada.
Perfil Free verificado por launcher; extensión `gkbenbfcfpamhfppeepbbfcifnbglfhp`.
Los 24 archivos de dist coinciden por hash con los instalados. Respaldo:
`Free/backups/extension-before-ratio-grid-20261120-160931`.

En una pestaña nueva de Cocos se comprobó orden ascendente del monitor y vuelta
al manual, fondo del header y agarres en Operaciones abiertas. Se conservó la
pestaña original del usuario y no se arrastraron sus registros ni se enviaron órdenes.
Las siete claves locales conservaron el hash agregado
`b9ceb7a00a7b64b848d55d0ae72d2019d4202925ce0286d85c8158a371f4a72d`.

## Ajuste de color de selección

Por pedido del usuario, la selección, su borde, la flecha de orden y la marca de
arrastre usan azul. Verificación focalizada con Playwright: fondo seleccionado
oscuro rgb(32,61,85) y claro rgb(225,239,251), con borde azul en ambos; los chips
Long/Short conservan sus fondos verde rgb(22,61,44) y rojo rgb(72,35,45).
Build aprobado. Capturas locales: `blue-selection-dark.png` y `blue-selection-light.png`.
No se repite la suite funcional completa por este ajuste exclusivo de CSS.

## Acciones y ancho compacto

Los botones de Detalle, Editar y Eliminar usan iconos con nombre accesible y
ayuda al pasar el puntero. Las acciones de ambas grillas se alinean a la derecha,
incluso cuando una fila tiene menos botones. Las flechas de orden también quedan
al extremo derecho del encabezado. Operaciones abiertas ajusta sus columnas al
contenido y deja el detalle a 12 px de la tabla, sin repartir el ancho sobrante.

Validación del ajuste: paquete Free y seguridad PASS; los 30 recorridos Playwright
del tab pasan sobre el bundle actualizado, incluido abrir/editar/eliminar.
Comprobación visual en ambos temas: tabla de 817,64 px en viewport de 2560 px,
acciones alineadas sin diferencias y contenedor sin desborde a 420 px.
Capturas locales: `compact-operations-dark.png` y `compact-operations-light.png`.

Instalado y comprobado en Cocos: tabla de 804,05 px en viewport de 2048 px,
iconos presentes con nombre accesible y selección azul conservada. Los 24 archivos
coinciden por hash con dist. Respaldo previo:
`Free/backups/extension-before-compact-actions-20261120-171604`.
Las siete claves locales conservaron el mismo hash agregado indicado arriba;
no se modificaron operaciones ni se enviaron órdenes.

## Referencia C, columnas y última actualización

El Monitor expone **Agregar referencia C**, con selector **Referencia C · ej.
DLR/SPOT**, para agregar comparaciones `(A/B)/C` igual que en el widget.
Se mantienen las restricciones de sólo monitor y el guardado schema 2 existente.

Ambas grillas tienen **Columnas** para mostrar/ocultar campos opcionales y
restablecerlos por separado. Par y Acciones permanecen visibles. Preferencias
persistidas por cuenta/sitio/grilla bajo `RatioGridColumnsV1:`, fuera del ledger.
Ocultar una columna ordenada vuelve al orden manual. El guardado aplica la
visibilidad solicitada al estado compartido bajo lock; no invierte un cambio
idéntico de otra pestaña. Los pendientes se identifican por clave y solicitud.

**Últ. valor** muestra y permite ordenar por la hora de mercado del último precio
que forma el ratio, incluyendo C. Usa Argentina, HH:mm:ss, con fecha completa en
el tooltip. No usa el reloj del refresco; sin ratio u horas válidas muestra —.
Se elimina el gutter reservado que generaba una franja vacía al final de ambas
grillas; el contenedor sigue permitiendo scroll cuando hace falta.

Pruebas nuevas: selección de columnas independiente, recarga/reset, ausencia de
escrituras al ledger, desaparición del sort oculto, reloj actualizado por C,
horas ausentes y borde derecho sin franja. Los tests del hook cubren rollback
tras error, cambios idempotentes de dos pestañas, evento de cuenta nueva con
lectura/escritura anteriores pendientes y vuelta A→B→A con locks pendientes.
La revisión independiente detectó dos carreras de concurrencia y un caso de
solapamiento; corregidos y comprobados por esos tests, sin hallazgos pendientes.

Validación final: **633 tests PASS** (564 Vitest + 67 Node + 2 QA infra),
**33 recorridos Playwright PASS** sobre el paquete final, build/seguridad PASS.
Comprobación visual en ambos temas y a 420 px sin desborde del contenedor.
Capturas locales `columns-monitor-dark.png`, `columns-monitor-light.png`,
`columns-operations-dark.png` y `columns-operations-light.png`.

Instalación compartida verificada: mismo ID/ruta/versión de desarrollo Free
0.0.28, 24 archivos coincidentes con dist y respaldo
`Free/backups/extension-before-ratio-columns-20261120-173402`.
Cocos muestra Últ. valor en ambas grillas, el selector de C y Columnas;
la tabla de operaciones mide 879,85 px y el borde derecho restante es 0,8 px
en ambas tablas (sin gutter reservado). Las siete claves locales mantienen
el hash agregado anterior. Se conservó la pestaña original y el navegador abierto.
