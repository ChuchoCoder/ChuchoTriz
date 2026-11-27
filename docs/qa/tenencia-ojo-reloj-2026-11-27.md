# Ojo de tenencia y reloj de la prueba del ticket

Validación del 27/11/2026 en el perfil habitual de ChuchoTriz Free 0.0.36.
Commit probado `b8305958c81db4b82a400d4521f35c09ddb6dd29`.

## Matriz

| Ticket | Ancho de ventana | Separación entre el ojo y las flechas de Monto |
| --- | ---: | ---: |
| Contraído | 1380 px | 16 px |
| Contraído | 1186 px | 12 px |
| Expandido | 1186 px | 12 px |

El ojo de 14 px queda dentro de Cantidad. Se comprobó que el número permanece
visible y que el campo y las flechas conservan su posición al mostrar el ojo.

En la pestaña recuperada, Matriz volvió a hacer dos consultas de tenencia
con temporizadores nativos y mostró las filas CI y 24 h. Se conservó abierta
la pestaña original. La comprobación se limitó a seleccionar el instrumento
y leer la tenencia.

## Datos simulados

| Recorrido | Resultado |
| --- | --- |
| `ticket-position`, tema oscuro | 13 de 13 aprobados. |
| `ticket-position`, tema claro | 13 de 13 aprobados. |
| Pruebas unitarias de tenencia | 13 de 13 aprobadas. |
| Plan de QA | 5 de 5 aprobadas. |

En ambos temas se verificó que `Date` y `setInterval` eran nativos al
principio y al final. TP-13 mostró la hora exacta de un cálculo simulado
del mismo día con 30 minutos de antigüedad y mantuvo disponible «Usar».
El ejecutor estándar agotó la espera en ambos temas. La repetición
ejecutó el mismo grupo en el perfil compartido y neutralizó únicamente
en las pestañas del fixture la simulación residual de sesiones anteriores.

Si la hora de Buenos Aires impide simular un cálculo del mismo día con
más de cinco minutos de antigüedad, la prueba omite TP-13. La prueba
unitaria cubre de forma determinista el cálculo de 30 minutos.

La validación en navegador cubrió el grupo `ticket-position`. El caso
independiente de [Ratios](../../tools/validate-ratio-operations.playwright.js)
todavía puede fijar el reloj del contexto compartido con `setFixedTime`.

## Rendimiento

La comprobación comparó la geometría del campo, las flechas y Monto antes
y después de mostrar el ojo. El ajuste está en CSS y la simulación de la
fecha del reporte está en el fixture. La revisión del diff cubrió las
rutas de arranque, reposo y consulta de la extensión.
