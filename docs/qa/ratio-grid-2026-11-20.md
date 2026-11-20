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
