# Corrección de Mostrar todo en ReMarkets

Investigación y corrección del 19/10/2026 (UTC-3), sobre Free
`c8d6e3b7ed75acd9e0fc25c859d52797db69a054` y Matriz DMA 4.23.16.
**Corrección implementada y verificada localmente y contra los controles nativos.
No instalada en el perfil compartido.**

## Causa

Matriz distingue dos estados visualmente vacíos:

| Acción nativa, con Free apagada | Modelo | JSON de solicitud |
| --- | --- | --- |
| Campo inicial sin tocar | `undefined` | `displayQty` omitido |
| Ingresar parcial 20 | número 20 | `"displayQty":20` |
| Borrar el parcial | `null` | `"displayQty":null` |
| Limpiar | `undefined` | campo omitido |

Free usaba `mostrar:0` para su modo completo y escribía una cadena vacía en el
campo expandido. Al pasar de fijo/aleatorio a completo, el control nativo
producía `null`. El tutorial había confirmado HTTP 422, `/displayQty`,
`null value where number expected`. El mismo estado se reprodujo borrando
manualmente con Free apagada: es una incompatibilidad del formulario nativo
que la extensión también disparaba.

El recorrido es `PresetBook` → `resolvePreset` → `PresetSession` →
`MiniOrderForm.fill` → setter nativo/evento de campo →
`newOrder.setDisplayQuantity(e)`. El cliente oficial clona la orden y la
serializa mediante `JSON.stringify` hacia
`/api/v2/accounts/{account}/orders/single`: omite `undefined`, conserva `null`.
No se modificó ese cliente ni se interceptó el envío para cambiar cantidades.

El `null` de una **solicitud** no debe confundirse con el `null` de los campos
opcionales de una **respuesta** de orden aceptada.

Bundle público inspeccionado:
[main.js de Matriz 4.23.16](https://remarkets.matriz.com.ar/public/web/static/js/main.js?v=4.23.16).
SHA-256: `e78ed1bc03aec812cf9936d5c93645c6c2b0ce86f41fa6cecfacaad7f19ff207`.

La [evidencia saneada versionada](evidence/remarkets-displayqty.json) conserva las
solicitudes relevantes, ACK, estados posteriores, cancelaciones y observaciones
del adaptador. Excluye cuenta, IDs de órdenes, horarios individuales, headers,
credenciales y datos del perfil. Los identificadores originales quedan sólo en
la evidencia local; los casos públicos se identifican como control, cero y total.

## Fuentes oficiales

- [Primary API, páginas 20–24](https://apihub.primary.com.ar/assets/docs/Primary-API.pdf):
  `displayQty` es opcional para iceberg; el ejemplo ordinario lo omite con
  `iceberg=false`. Esa API REST/WS no es el contrato JSON interno de Matriz.
- [Primary, Order Management](https://pmy.atlassian.net/wiki/spaces/PTPROE/pages/4552655329/Order+Managment):
  DisplayQty es condicional a DisplayMethod para iceberg.
- [Manual oficial de Matriz, 2.11](https://storage.googleapis.com/public_shared_resources/Manual%20de%20Uso%20-%20MatrizOMS.pdf):
  describe la cantidad divulgada de una orden parcial.

Estas fuentes no justificaban enviar cero ni total por suposición. Se solicitaron
y recibieron instrucciones humanas explícitas para hasta tres órdenes de total 100
exclusivamente en una cuenta ReMarkets verificada. La evidencia proviene de ese entorno.

## Tres pruebas autorizadas

Las tres usaron AL30 24hs, compra Limit/Day, total 100 y precio ilustrativo100000.
Se prepararon y confirmaron por controles visibles de Matriz, con Free apagada,
cuenta simulada verificada y cero pendientes antes de empezar. No se alteraron
preferencias ni instalación de Premium.

| Caso | Solicitud | HTTP inicial | Estado posterior | Disposición final |
| --- | --- | --- | --- | --- |
| Control | `displayQty` omitido | 200 | Aceptada, estado 0; total 100, pendiente 100; `displayQty=null`, `displayMethod=null` | Cancelada, estado 4 |
| Cero | `displayQty:0` | 200 | Rechazada, estado 8; cantidad divulgada menor a la mínima | Sin remanente para cancelar |
| Total | `displayQty:100` | 200 | Aceptada, estado 0; total 100, pendiente 100; `displayQty=null`, `displayMethod=null`, igual al control | Cancelada, estado 4 |

Los alias control, cero y total conservan la correspondencia entre solicitud,
ACK y estado posterior en la evidencia pública. Los IDs y horarios precisos
permiten reconciliarlos con el broker únicamente en el archivo original local.

El ACK de cero y total inicialmente contenía `displayMethod:"1"`. El estado
posterior del broker es decisivo: cero fue rechazado y total fue aceptado con los
campos de parcial vacíos, igual al control. **Un HTTP 200 solo no probaba aceptación.**

Ambas cancelaciones propias devolvieron 200 y se verificó estado 4. Las tres órdenes
terminaron con `cumQty:0`; no quedó ninguna pendiente. No se enviaron reemplazos,
reintentos, cancelaciones masivas ni operaciones compensatorias.

**Límite de difusión:** hubo secuencias de libro recibidas, pero los niveles de
AL30 estaban vacíos incluso con el control pendiente. Se verificaron el total
aceptado100 y el estado de divulgación reportado por el broker; no se pudo medir
directamente el volumen en profundidad pública. No se afirma haber observado
un nivel público de 100.

## Cambio en Free

- El formato guardado sigue usando `0` como modo completo. No se envía ese cero.
- Mostrar todo escribe el total numérico en Cantidad a mostrar. Al aplicar un
  preset se expande el formulario para que ambas cantidades sean visibles,
  incluso si había un parcial oculto.
- Mientras ese modo siga activo, la cantidad visible acompaña la edición del
  total. Evita que100/100 termine involuntariamente en200/100.
- Editar el campo visible manualmente, con teclado o sus controles de incremento,
  termina el vínculo. Un fijo, incluso100/100, sigue siendo fijo. Los aleatorios
  conservan su muestra al editar el total y se vuelven a sortear al reaplicarlos.
- Cambiar de instrumento/preset, reemplazar el formulario o Limpiar retira el
  seguimiento. Si se contrae manualmente, permanece cerrado hasta cambiar el
  total; entonces se reabre para sincronizar.
- El seguimiento completo comienza antes de la expansión para conservar una
  edición del total durante ese intervalo. La espera inicial está limitada a 2 s;
  no escribe tardíamente sobre un ticket que perdió identidad.
- La toma de control manual del parcial se detecta antes del manejo nativo;
  la sincronización del total se hace después, para no interferir con su edición.

El adaptador sigue siendo DOM local. Sin red, puentes al store, permisos nuevos,
transporte de órdenes, interceptores de envío ni capacidades Premium.

## Regresión y comprobaciones

La regresión principal de `Matriz.test.ts` falló antes del cambio:
`{quantity:100,displayQty:null}` en lugar de
`{quantity:100,displayQty:100}`. Pasó después.
También se reprodujeron y fijaron la carrera durante expansión y actualizaciones
controladas de teclado que no emitían un evento DOM ordinario.

La suite cubre autocompletado completo, transiciones fijo/aleatorio/completo,
edición manual de ambos campos, fijo igual al total, campo oculto, cambio de
instrumento, reemplazo del formulario, Limpiar, expiración y eventos con bubbling
detenido por el control nativo.

Por el MCP Playwright compartido se ejecutó el adaptador corregido transpilado
en un mundo aislado de una pestaña propia sobre **Matriz real**, con mutaciones de
órdenes bloqueadas. Pasaron 17 observaciones con cero intentos de órdenes: fijo,
completo, teclado ArrowUp en total y parcial, edición manual, entrada localizada,
aleatorio, parcial oculto y Limpiar. Los botones de incremento por clic estaban
ocultos por CSS en esta versión; no se forzaron. Su secuencia está cubierta
localmente y el incremento por teclado sí se ejercitó en la pantalla nativa.

Esta prueba no instaló el paquete candidato ni acredita su carga completa como
extensión instalada. Las tres órdenes anteriores usaron el formulario nativo y
los valores que ahora prepara el adaptador; no se crearon órdenes adicionales
con el candidato.

Revisión independiente: detectó la carrera de expansión, confirmó su corrección
con una reproducción propia y no encontró otros defectos concretos pendientes.

## Artefactos y preservación

La evidencia original permanece en el directorio local del diagnóstico, fuera del
paquete y de este PR público. La versión portable y anonimizada está en
[`docs/evidence/remarkets-displayqty.json`](evidence/remarkets-displayqty.json).

- `comparison.json`: comparación original con Free apagada/encendida.
- `orders-evidence.json`: payloads reducidos, ACK, estados posteriores y
  cancelaciones de las tres pruebas; sin headers ni credenciales.
- `adapter-evidence.json`: 17 observaciones nativas del adaptador final.
- `repro-displayqty.cjs`: reproducción local sobre el adaptador real.
- `prepare-adapter-probe.cjs`: generador del sondeo sin órdenes.
- `matriz-main.js`: copia del bundle público oficial.

Instalación Free reservada y respaldada con el coordinador; restauración de
bytes y liberación confirmadas y registradas localmente. No se instaló ni copió
ningún candidato sobre la instalación.
Free quedó OFF, Premium ON sin cambios, seis pestañas originales conservadas y
navegador abierto. Los cambios ajenos del checkout original no se tocaron.

Verificaciones finales: npm ci; npm test (193 Vitest y tres guardas Node);
npm run package:free (TypeScript, build y check-free fuente/dist); npm audit
--audit-level=moderate (cero vulnerabilidades); git diff --check. Aprobadas.

## Preparación del PR draft

La rama se actualizó sobre `main` (`a779134`) antes de abrir el PR. Se conservaron
el README visual y las actualizaciones de React19, Vite8 y Vitest5 incorporadas
por otros cambios. El blob Git de `src/Matriz.ts` conserva exactamente el contenido
validado contra Matriz; la evidencia nativa anterior no implica una instalación
del paquete reconstruido con esas dependencias.

Se repiten instalación, pruebas, build, check-free y controles de seguridad sobre
esta base actualizada. Los resultados de CI pertenecen al head que muestre el PR;
un check omitido o pendiente no se considera aprobado. El PR se mantiene draft.
