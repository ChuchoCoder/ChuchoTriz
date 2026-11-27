# Botonera Long/Short con referencia C

Validación del 27/11/2026 en Buenos Aires con ChuchoTriz Free 0.0.36,
Chrome 156.0.8078.80 y cotizaciones simuladas. El ZIP probado tiene SHA-256
`d406088a6a1504027ef9ee6ca9f2f9ef9551f6791f5dca3384983e94831a433b`.

| Caso | Entorno | Tema | Resultado |
| --- | --- | --- | --- |
| Operaciones de Ratios | Fixture local | Oscuro | 52 de 52 aprobados |
| Operaciones de Ratios | Fixture local | Claro | 52 de 52 aprobados |
| Apertura de AL30/AL30D con DLR/SPOT, de 420 a 1920 px | Fixture local | Oscuro | Botones alineados con las patas, ratio centrado e inversión verificada con el puntero |
| Apertura de AL30/AL30D con DLR/SPOT, de 420 a 1920 px | Fixture local | Claro | Botones alineados con las patas, ratio centrado e inversión verificada con el puntero |
| Instalación | Matriz | Tema del perfil | NOT RUN |

Con el CSS anterior, a 1920 px el centro del ratio quedaba 156 px a
la izquierda del centro de las patas. La regresión verifica la alineación
con cuatro columnas, dos columnas y patas apiladas.

El smoke general del cambio registró 168 comprobaciones aprobadas y cuatro
fallos. Sobre `main` (`5b22348`), Tenencia obtuvo el mismo timeout al
esperar su tabla en ambos temas, y Presets reprodujo en claro el mismo
fallo de geometría del editor angosto. En oscuro Presets aprobó la pasada
sobre `main`. El [registro del PR anterior](ratios-modal-intradiario-2026-11-27.md)
documenta un fallo intermitente de esa comprobación en oscuro.

`npm test` y `npm run package:free` aprobaron. La revisión del CSS
cubre el impacto en rendimiento. La regla de ancho afectaba únicamente
la geometría del formulario de Ratios una vez abierto.
