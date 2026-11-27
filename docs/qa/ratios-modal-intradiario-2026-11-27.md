# Modal intradiario de Ratios

Validación del 27/11/2026, de 15:14 a 15:21 en Buenos Aires, con ChuchoTriz
Free 0.0.36 y Chrome 156.0.8078.80. Código probado en `37cf243`, sobre
`main` en `cadcce0`. El SHA-256 del paquete usado por las pruebas fue
`ad092d8fb1835e733a465f845d820fb768d3f1dbd8761c98f4336523baf0a7a5`.
Los 33 archivos de la instalación coincidieron byte por byte con esa build.

| Caso | Entorno | Tema | Resultado |
| --- | --- | --- | --- |
| Intradiario de Ratios | Fixture local | Oscuro | 57 de 57 aprobados |
| Intradiario de Ratios | Fixture local | Claro | 57 de 57 aprobados |
| Instalación y gráfico GD30/AL30 | Matriz | Tema del perfil | Apertura y gráfico renderizado |

La prueba del widget abrió BMA/GGAL con el teclado y verificó el formato
porcentual en la leyenda, el eje y el tooltip. Al cerrar, el foco volvió al
botón de la fila con un contorno visible. El recorrido de Referencia C ejercitó
la comparación, la brecha y el divisor. En Matriz se recargó la instalación
existente y se comprobó la apertura y el gráfico de GD30/AL30. Se conservaron
el ID de la extensión y la carpeta previa como respaldo.

`npm test`, `npm run package:free`, `npm run security:check` y la auditoría
de dependencias aprobaron. El smoke general registró 172 aprobados y tres
fallos. La geometría del editor de Presets falló una vez en oscuro. Al
repetir ese grupo pasaron los 12 casos entre ambos temas. El caso
de Tenencia del instrumento agotó la misma espera de visibilidad en
ambos temas sobre el candidato y sobre `main`.

## Alineación de los iconos

El acceso intradiario reserva el mismo ancho y la misma posición del
icono en las filas «5m» y «C». El recorrido comparó la posición horizontal
de las acciones entre ambos tipos de fila. Pasaron los 58 casos en oscuro
y los 58 en claro.

## Rendimiento

El cambio agrega un botón por fila A/B. Las lecturas y el gráfico se inician
al abrir el modal, con el mismo lector y ciclo de suscripción del gráfico de
Referencia C. La prueba de componente verifica que los botones cerrados no
inicien lecturas y que el lector se libere al cerrar el último gráfico.
