# Reloj de Matriz durante la prueba de Ratios

Validación del 27/11/2026 en el perfil habitual de ChuchoTriz Free 0.0.36.
Commit probado `67bfdeb7d98965a0ec256d947d6b279c06039755`.

## Navegador compartido

El validador `ratio-operations` ejecutó el paquete de producción con
datos simulados en pestañas locales. En paralelo se observó el reloj
de una pestaña de Matriz ya abierta y autenticada en el mismo contexto.

| Tema | Casos aprobados | Lecturas de Matriz durante la prueba | Avance de Date.now() |
| --- | ---: | ---: | ---: |
| Oscuro | 52 de 52 | 165 | 86,4 s |
| Claro | 52 de 52 | 135 | 69,8 s |

Se comprobó el avance de `Date.now()` antes, durante y después de cada
recorrido. El constructor `Date` de Matriz coincidió con ese reloj,
incluida una lectura mientras el fixture tenía su fecha simulada.
La inspección de Matriz consistió en lecturas del reloj y de la sesión.
La protección contra relojes simulados de sesiones previas se limitó
a las pestañas locales. La primera corrida en claro agotó una espera
del fixture. El recorrido completo pasó al repetirlo.

## Caso de cambio de minuto

Con datos simulados, el borrador empezó con cotizaciones en B y C. Al
copiar A en un minuto posterior, el ticket borró B y C. Al volver a
copiar la cotización actualizada de C dentro de ese minuto, conservó
el precio de A. El fixture restauró `Date` antes de seguir con los
casos de fechas históricas.

## Pruebas locales

El armado del paquete Free y las 120 pruebas de Node pasaron. En la
corrida local de Vitest, 650 casos pasaron y dos del simulador de
Opciones agotaron el límite de cinco segundos. Uno también agotó ese
límite en el árbol base `84aa0ce`. Al repetir ambos casos con un límite
local de 15 segundos, los dos pasaron.

## Rendimiento

La revisión cubrió arranque, reposo e interacción. El diff modifica el
validador de Playwright. La fecha simulada vive en la pestaña local de
prueba y se restaura al terminar el escenario.
