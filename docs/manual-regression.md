# Smoke y regresión de ChuchoTriz Free

## Ejecutar antes de un PR

Desde el checkout del cambio, con dependencias instaladas (`npm ci --ignore-scripts --no-audit`):

```powershell
npm run test:pr
```

Ejecuta seguridad, todos los tests de Node/Vitest, empaquetado, auditoría y la
regresión de navegador. Un fallo devuelve código de salida distinto de cero.
No necesita sesión de broker ni mercado abierto. Para ejecutar solo la interfaz:

```powershell
npm run test:smoke
npm run test:regression
```

Ambos compilan primero el paquete de producción. Smoke ejecuta los recorridos
básicos; regression agrega las 34 comprobaciones anteriores de estrategias y
los casos ampliados de contabilidad, cuentas/vencimientos, rolado y límites.
Los tests usan el bundle recién generado y los lectores reales sobre APIs externas
ficticias. **No prueban por sí solos que Chrome haya instalado ese bundle ni que
la versión actual de Matriz mantenga el contrato simulado.**

Requisitos de navegador: Windows, PowerShell 7 (`pwsh` en PATH), Node compatible
con `package.json` y el perfil compartido ChuchoTriz abierto. El ejecutor usa el
servidor MCP del launcher `Start-Browser.ps1 -Mcp`; verifica el perfil mediante
ese launcher, sin crear otro navegador. Si está cerrado o no se puede conectar,
falla y registra el motivo. Abrilo explícitamente con el launcher compartido.
La ubicación habitual es `%LOCALAPPDATA%/AgentBrowsers/ChuchoTriz/Start-Browser.ps1`;
se puede indicar otra con `CHUCHOTRIZ_BROWSER_LAUNCHER`.

El recorrido abre únicamente una pestaña nueva en un puerto loopback asignado
por el sistema, bloquea solicitudes externas desde esa pestaña, y conserva las
pestañas y preferencias de Matriz. Usa almacenamiento del origen local y una
captura temporal del portapapeles ficticio; no reemplaza el portapapeles del
sistema. Al terminar cierra su pestaña y servidor local, no el navegador compartido.
No interactuar con la pestaña de prueba mientras corre. Un lock impide dos
ejecuciones CLI simultáneas. Si se interrumpe abruptamente y queda un lock,
comprobar que el PID del archivo temporal `chuchotriz-free-qa.lock` ya no existe
antes de eliminarlo; no cerrar ni terminar procesos del navegador para limpiarlo.

Cada ejecución guarda `report.json` y `report.md` en una carpeta nueva bajo
`test-results/qa-<fecha-UTC>/`, con commit, indicador de cambios locales, versión,
SHA-256 del ZIP, suites esperadas/completadas y resultados. Ante un fallo del
recorrido intenta guardar además una captura de **su fixture**, nunca de Matriz.
Los artefactos se ignoran en Git. Adjuntar al PR el resumen revisado o copiarlo a
`docs/qa/` siguiendo la allowlist. No marcar aprobado un reporte parcial.

Para depurar un grupo sin repetir todo:

```powershell
npm run test:regression -- --group=scope
```

Ese reporte se marca **PARTIAL**, aun si el grupo aprueba. Los grupos disponibles
son los de la tabla siguiente. CI ejecuta automáticamente los tests unitarios,
de lectores y del transporte/parseo MCP mediante `npm test`; la suite de navegador
se ejecuta localmente porque requiere el perfil compartido. No se lanza un
navegador aislado en CI.

## Cobertura automática y comprobaciones humanas

| Casos de la guía | Grupo de navegador | Cobertura reproducible |
| --- | --- | --- |
| SM-01 | `opening` | Apertura/cierre/reapertura, una instancia y coexistencia de herramientas. |
| SM-02, SM-03, RG-01 | `presets` | RAW válido/inválido, guardado/recarga, cantidad fija/aleatoria, cambio de instrumento, último preset, Limpiar, reemplazo de formulario y foco tras cotización. |
| SM-04 | `quotes` | Calls/puts, selección y deselección, último operado como respaldo, prima ausente y bloqueo de precarga sin punta. |
| SM-04-drag | `quotes` | Arrastre nativo en ambos sentidos, nueva prima y VI, origen cruzado, Escape y rechazo de destinos ocupados, sin punta o de otro tipo o lado. |
| SM-05 | `columns` | Ocultar/mostrar/reordenar, persistencia, encabezados simétricos y columnas fijas. |
| SM-06 | `tooltip` | VI y griegas, ausencia de VI, Escape y clic exterior. |
| SM-07, RG-08 | `analysis` | Vistas compartidas, 25 escenarios, vencimiento, zoom/Ajustar y cambio entre tasa automática/manual. Los tests de caución también cubren vencimiento y ausencia de referencia. |
| SM-08 | `position` | Importación, primas desconocidas y conservación de ajustes al alternar vistas. |
| SM-09 | `operations` | Lectura y copia de ejecuciones ficticias con cantidades firmadas, vencimientos, bases y primas. |
| SM-10 | `preload` | Precarga ASK/BID con cantidad elegida y precio editado por pata; ticket ficticio limpiado. |
| RG-02, RG-03, RG-09 | `baseline` | 24 variantes y 10 comprobaciones de cantidades, strikes, precios, gráficos, VI y desconexión/libro cruzado. |
| RG-02 | `limits` | Coincidencia de patas entre previsualización/armado y límites de cantidad/strikes. |
| RG-03 | `editing` | VI por pata modifica el teórico y conserva prima, cantidad y resultado al vencimiento; quitar pata. |
| RG-04 | `oracle` | Resultados independientes de call manual comprada/vendida a precios 90/100/110. |
| RG-05 | `accounting` | Primas, gastos, realizado, nominales/costo, recarga y persistencia; totales y exclusión/inclusión de posición. |
| RG-06 | `scope` | Cambios de cantidad/sentido, separación entre cuentas y entre vencimientos. |
| RG-07 | `roll` | Rolado comprado/vendido, contratos financiables, gastos y falta de liquidez. |
| SM-08, SM-09 | `reader-errors` | Reportes vacíos/fallidos, errores sin datos privados, cambio de cuenta y recuperación. |
| RG-10 | `layout` | Geometría a 1024/1920, scroll, controles, teclado y devolución de foco. |

Quedan como comprobaciones humanas de integración, no como pasos repetidos sobre
la fixture:

1. **Instalación y Matriz real:** verificar la versión/ID cargados y recorrer
   apertura, un preset, foco de cotización y una precarga sin confirmar. Esto
   detecta cambios en el DOM de Matriz que la fixture no puede anticipar.
2. **Datos reales:** con sesión/2FA cuando corresponda y durante rueda, contrastar
   instrumento, plazo, puntas/VI/tasa, tenencia y ejecuciones contra Matriz. No
   editar primas personales para fabricar pruebas ni confirmar órdenes.
3. **Inspección visual:** legibilidad, recortes, tooltips y gráficos con el tema,
   zoom de Windows y densidad de datos reales utilizados. La geometría automática
   no reemplaza ese juicio visual ni una revisión con lector de pantalla.

Repetir la integración cuando el PR afecte los adaptadores, la instalación o esos
flujos. Para cambios internos cubiertos, adjuntar el reporte automático y explicar
si no corresponde repetir integración. Los casos detallados debajo siguen siendo
el procedimiento de referencia y permiten contrastar manualmente un fallo.

Ejecutar el smoke antes de cada PR que cambie comportamiento y la regresión
completa antes de publicar una versión. Repetir los casos afectados sobre el
commit final si cambia el código después de probar. Una pasada no garantiza
ausencia de errores: registrar también los casos bloqueados y no ejecutados.

## Preparación y seguridad

1. Registrar commit, versión, fecha y zona horaria, navegador, entorno y estado
   del mercado en una copia de [la plantilla](qa/run-template.md).
2. Ejecutar `npm ci --ignore-scripts --no-audit`, `npm run security:check`,
   `npm test`, `npm run package:free` y `npm audit --audit-level=moderate`.
3. Extraer `releases/chuchotriz-free-<versión>.zip` en una carpeta estable.
   En `chrome://extensions`, cargarla sin empaquetar o actualizar el contenido
   de la instalación existente y pulsar Recargar. Respaldar antes esa carpeta;
   conservar su ruta e ID conserva la asociación con las preferencias locales.
   Verificar versión, una sola instancia habilitada y recargar Matriz.
4. Usar el perfil compartido ChuchoTriz y comprobar que la sesión esté iniciada.
   No exportar cookies, tokens, cuentas, saldos ni posiciones a los reportes.
   Guardar capturas privadas fuera de Git o enmascararlas antes de revisarlas.
5. Tomar nota de preferencias a modificar y restaurarlas al terminar. No limpiar
   ni sobrescribir primas/costos personales para fabricar datos de prueba:
   usar la fixture para casos de posición editables y cambios de cuenta sintéticos.
6. **No enviar, modificar ni cancelar órdenes reales.** Cargar Op. solo debe
   completar el formulario. No pulsar Comprar/Vender/Confirmar del ticket nativo
   ni sus atajos. Limpiar la precarga al terminar. La ejecución real requiere
   otra validación y confirmación humana explícita.

Estados: **PASS**, **FAIL**, **BLOCKED** (falta un requisito), **NOT RUN**.
Anotar entorno y evidencia por caso; un PASS sintético no acredita integración
con broker. Un caso sin posiciones o cotizaciones no cuenta como aprobado.

## Smoke (15–25 minutos)

| ID | Pasos | Resultado esperado |
| --- | --- | --- |
| SM-01 | Comprobar versión e ID en Extensiones, recargar Matriz y abrir/cerrar ChuchoTriz dos veces. Revisar errores de extensión y consola. | Una instancia; panel abre y cierra sin error atribuible a ChuchoTriz. |
| SM-02 | En Cantidades rápidas revisar un preset existente. Volver a Matriz, seleccionar ese instrumento/plazo y pulsar un preset; cambiar instrumento y volver. Pulsar Limpiar. | Cantidad correcta para el instrumento; no mezcla presets; Limpiar no reaplica la selección anterior. No se envían órdenes. |
| SM-03 | Hacer clic en una cotización nativa y comprobar foco en Cantidad. Abrir/cerrar el panel lateral o navegar y volver al ticket. | Presets y foco funcionan sobre el formulario vigente, sin duplicados ni escritura sobre el formulario anterior. |
| SM-04 | Abrir simulador; elegir subyacente/vencimiento. Seleccionar ASK de call y BID de put; volver a pulsar una punta. Probar una punta sin precio. | Compra/venta y cantidades firmadas correctas; segundo clic quita la pata. Sin punta usa último o exige prima manual; nunca inventa cero. |
| SM-04-drag | Seleccionar un ASK o BID y arrastrarlo al strike central o a la misma punta de otra fila. Repetir en el otro sentido y cancelar un intento con Escape. | El destino válido se resalta. La pata conserva tipo, lado y cantidad y usa la prima y VI disponibles del destino. Al cancelar se conserva la pata de origen. |
| SM-05 | Config. de cadena: ocultar una columna, reordenarla y cambiar otra desde el encabezado. Cerrar y reabrir; restaurar preferencias. | Calls/puts reflejan el cambio, BID/ASK/VI/Strike siguen fijos y la selección persiste. |
| SM-06 | Abrir VI por clic; cerrar por Escape y por clic exterior. Probar una serie con y otra sin VI. | Tooltip identifica serie y datos disponibles; ausencia de VI no produce métricas ficticias ni impide cerrar. |
| SM-07 | Con una pata válida alternar Armado/Análisis. Cambiar precio, VI y fecha; usar zoom y Ajustar. | Patas conservadas, resultados finitos cuando corresponde, máximo ilimitado explícito y gráficos consistentes. Sin datos, aviso claro. |
| SM-08 | Abrir Posición actual y consultar Info. Alternar Cotizaciones y el check de incluir posición. | Estado de lectura claro; no mezcla ajustes con primas históricas; una posición vacía/fallo se distingue de una importación exitosa. |
| SM-09 | Operaciones de opciones → Actualizar desde Matriz. Si hay filas, copiar una selección y revisar encabezados/orden/decimales en un editor local privado. | Carga finaliza; vacío/error explícito; copia vencimiento, cantidad, base y prima, sin datos ajenos. No pegar operaciones reales en Git. |
| SM-10 | Con opción ARS/24 h y prima válida, usar Cargar Op. desde una pata editada y luego desde la barra de cantidad de una punta seleccionada en la cadena (mantener el puntero sobre ella). Revisar ticket sin confirmarlo; Limpiar. | Instrumento, cantidad y precio coinciden; desde la cadena usa ASK compra/BID venta. Si falta precio, no precarga desde esa punta. Ninguna orden enviada. |

## Regresión ampliada

Usar datos ficticios para las ediciones destructivas del borrador y los cambios
de cantidad/sentido de posiciones. Para integración, repetir además las lecturas
con datos reales disponibles, sin publicar detalles de la cuenta.

| ID | Pasos | Resultado esperado |
| --- | --- | --- |
| RG-01 | Configurar presets y Cantidad a mostrar; probar guardado, editor RAW válido/inválido y recarga. Restaurar configuración original. | Valores válidos persisten; texto RAW inválido no destruye la configuración; cantidad visible respeta las reglas del formulario. |
| RG-02 | Recorrer las ocho familias y sus variantes en Estrategia; Armar, subir/bajar cantidades y strikes, clic simple/doble y límites. | Previsualización y armado coinciden; proporciones y sentido se conservan; dobles clics suman diez unidades; límites no invierten posición. |
| RG-03 | Comparar Natural/Mid/Opuesto; editar cantidad/precio/VI; quitar patas y limpiar ajustes. | Primas y crédito/débito coherentes con puntas y gastos; no se pisa una prima editada con un refresco. |
| RG-04 | Ingresar manualmente una call: spot/strike 100, prima 8, cantidad +1, factor 100, gastos 0. Evaluar al vencimiento a 90/100/110; invertir a −1. | Compra: −800/−800/+200; venta: +800/+800/−200. Ganancia/pérdida ilimitada identificada según lado. |
| RG-05 | En fixture cargar posición, completar primas, gastos y realizado; incluir/excluir posición; añadir nominales y costo. Recargar tenencia y reabrir. | Totales incorporan exactamente los conceptos seleccionados; primas/costos persisten en el contexto correcto; ajustes se conservan al recargar tenencia. |
| RG-06 | Con fixture cambiar cantidad importada, luego signo, cuenta y cadena. | Cantidad cambiada exige revisar prima; signo cambiado la vacía; cuenta/cadena no hereda datos de otra. Los tests de repositorio cubren estos cambios sintéticos. |
| RG-07 | Rolar una posición comprada y una vendida; variar gastos, probar punta/tamaño faltantes y cargar propuesta. | Mismo tipo/vencimiento; compra usa BID cierre/ASK apertura y venta ASK cierre/BID apertura; respeta liquidez y cantidad financiable. Agrega dos ajustes e incluye posición, sin operar. |
| RG-08 | En Análisis revisar tasa de caución y supuestos; probar tasa manual y datos ausentes. | Fuente/plazo/fecha disponibles; usa caución BYMA ARS elegible; ausencia no se disfraza de lectura actual; tasa manual se aplica. |
| RG-09 | En fixture probar libro cruzado, VI ausente, desconexión y recuperación. | Avisos claros; sin NaN; no usa puntas inválidas; recuperación sin duplicar paneles/patas. |
| RG-10 | Probar ancho 1024 y 1920, panel lateral, scroll horizontal/vertical, teclado, Escape y foco al cerrar diálogos. | Controles accesibles, cadena/overlays alineados, sin superposición que impida operar la interfaz. |

## Recorrido sintético reproducible

Después de compilar, en una terminal PowerShell desde el checkout:

```powershell
$env:CHUCHOTRIZ_PREVIEW_PORT = '60472'
node tools/preview-free.mjs
```

Abrir `http://127.0.0.1:60472/fixture?scenario=regression` en el mismo perfil.
La fixture usa datos ficticios y el bundle de `dist`, sin conexión a broker.
Si el puerto está ocupado, elegir otro libre. Para repetir desde cero, borrar
solo el almacenamiento de ese origen local o usar un puerto nuevo; no borrar
el almacenamiento de Matriz ni el de la extensión.

El recorrido asistido ya disponible es
`tools/validate-options-simulator.playwright.js`: pasar su función al argumento
`code` de `playwright.browser_run_code_unsafe` (o su ruta absoluta a `filename`
si el checkout está dentro de las raíces admitidas por el servidor MCP).
Requiere la pestaña local seleccionada y rechaza páginas de broker. Registrar
los checks devueltos y si se usaron clics de Playwright o eventos DOM. Si falla
un selector, investigar si cambió la UI antes de atribuir un defecto al producto.
No afirmar que este recorrido cubre todos los casos anteriores: completar los
faltantes manualmente o marcarlos pendientes. Detener solo el servidor local al
terminar; mantener abierto el navegador compartido.

## Registro y criterio para PR/release

Copiar [qa/run-template.md](qa/run-template.md) a `docs/qa/<versión>-<fecha>.md`,
registrar resultados y agregar el archivo revisado a `free-files.json`.
Vincular el reporte en el PR. No adjuntar logs de Matriz sin revisar privacidad.
Los logs técnicos locales pueden guardarse en `test-results/` (ignorado por Git).

- Un FAIL reproducible atribuible al cambio bloquea su aprobación hasta corregir
  y repetir los casos afectados.
- BLOCKED/NOT RUN deben decir qué falta y cuándo se repetirán; no equivalen a PASS.
- Para una release, ejecutar todos los casos aplicables o explicitar la cobertura
  pendiente en el reporte y notas. Validar datos de mercado durante rueda cuando
  fuera de horario no sea posible; no presentar el smoke como certificación bursátil.

