# Pruebas manuales de ChuchoTriz Free

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
| RG-01 | Configurar presets y Cantidad a mostrar; probar guardado, editor RAW válido/inválido y recarga. Restaurar configuración original. | Valores válidos persisten; JSON inválido no destruye la configuración; cantidad visible respeta las reglas del formulario. |
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

