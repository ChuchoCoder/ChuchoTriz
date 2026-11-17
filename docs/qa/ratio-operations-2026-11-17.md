# Operaciones de ratios — 17/11/2026

Implementación en `codex/ratio-operations`, desde main `2351007`.
Compilación de desarrollo instalada sobre Free 0.0.25; no es una release publicada.

## Alcance

Tab Ratios: monitor → apertura manual → operaciones abiertas. Precios nativos,
dimensionamiento B por monto/lote/factor, comisión común inicialmente 0%, DDMM
por pata, objetivo de ratio, P&L neto por moneda, cierres parciales, edición,
eliminación/deshacer y almacenamiento local por cuenta/sitio. No transmite órdenes.

Los DDMM portan defaults de Premium `b12dbdaa`: ESXXXX/EMXXXX 0,0847%
(0,07% + IVA 21%), DBXXXX/DBXXFR 0,01%, DYXTXR 0,001%. Los tipos/mercados
sin regla exigen tasa manual. Ver procedencia y límites en `docs/ratios.md`.

## Pruebas automatizadas

- `npm test`: PASS, 533 Vitest + 59 contratos/lectores Node + 2 QA infra = 594.
  Incluye 19 tests nuevos de contabilidad, tasas, objetivos, unidades,
  almacenamiento concurrente y lectura/cambio de contexto.
- `npm run security:check`: PASS; 10 tests de política, política y lint.
- `npm run security:tools`: PASS, sin hallazgos en el escaneo ejecutado.
- `npm run package:free`: PASS, source/dist verificados, ZIP generado localmente.
- `git diff --check` y `git diff --cached --check`: PASS.
- `npm audit --omit=dev --audit-level=moderate`: PASS, 0 vulnerabilidades.
- `npm audit --audit-level=moderate`: FAIL heredado: 9 avisos high del árbol de
  desarrollo por picomatch (GHSA-fc5q-39xc-vjpf). El lock y las versiones de
  dependencias no cambiaron respecto de main. No se aplicó el downgrade mayor
  que propone `audit fix --force`. Por esto no se declara `test:pr` completo verde.

## Navegador compartido

Conexión MCP `playwright` verificada. La ruta AgentBrowsers indicada no existe;
`C:/Users/feder/ChuchoTrizProfiles/Free/Start-Browser.ps1 -CheckOnly` confirmó
ChuchoTriz Free, puerto 9335 y su directorio de datos. Se reutilizó esa sesión;
no se abrió un perfil aislado ni se cerró el navegador.

Bundle de producción servido en loopback con datos sintéticos, sin broker:

- Las 20 suites existentes (baseline + 19 grupos), 70 comprobaciones, PASS.
  Ejecutadas desde el MCP mediante wrappers de los validadores originales.
- `tools/validate-ratio-operations.playwright.js`: 7 recorridos PASS, con varias
  aserciones por recorrido: ticker exacto, precios/ratio, DDMM/size/puntas,
  entrada fija, apertura/cierre parcial/edición, borrar/deshacer/recarga,
  aislamiento de cuentas, bonos/FX/monedas y limpieza de registros cerrados.
- Persistencia de entradas, objetivos, cierres y revisiones probada al recargar.
  El P&L y las actualizaciones controladas se prueban en este fixture; no son
  confirmación de ejecuciones reales ni de aranceles actuales del broker.

Revisión independiente: tres P2 resueltos (lookup sin límite, borrado del draft
ante error transitorio, límite sin limpieza de historia). Segunda revisión sin
P1/P2 pendientes; los tests incorporados cubren recuperación y conservación.

## Instalación y observación en Cocos

- ID `gkbenbfcfpamhfppeepbbfcifnbglfhp`, ENABLED, carpeta
  `C:/Users/feder/ChuchoTrizProfiles/Free/extension`.
- Respaldo previo en `Free/backups/extension-before-ratio-operations-20261117-152110`.
  Se verificaron hashes de todos los archivos actuales del dist en destino.
  La limpieza de assets anteriores fue rechazada por política automática;
  se conservaron y se copiaron los actuales. El manifiesto referencia el bundle nuevo.
- Matriz Cocos 4.24.4, catálogo de 10.095 instrumentos. Sin errores nuevos de página.
- Selección por ticker al perder foco: BMA/GGAL, DDMM 0,0847% en ambas patas,
  comisión 0%, cantidad A=100 → B=192. Precios y puntas/cantidades nativos
  visibles, ratio porcentual de apertura correcto.
- Defaults comprobados en UI: AAL/CEDEAR 0,0847%, AE38/bono 0,01%,
  A11LD/ON 0,01%, B2D6C/letra 0,001%.
- Cinco muestras compararon últimos publicados contra la UI (BMA 9.070,
  GGAL 4.725); coincidieron. Durante esas muestras no cambió el último,
  por lo que no prueban reacción a una nueva operación de mercado.
- No se crearon registros de operaciones ni se alteraron cotizaciones en Cocos.
- Preferencias antes/después: mismas seis claves, SHA256 agregado
  `554de88b44cea158954131bc756670eaa340a2e0e60edfb26f38ab121fdc23e8`.
- Dashboard: geometría/configuración antes/después iguales, SHA256
  `5cad8f44019bd105612733163baad78f44a9106757abb6523bde0228a88ab544`.
  No se modificaron otros widgets.
- Se corrigió contraste de títulos sobre el tema oscuro nativo; color calculado
  de h2 y cuerpo `rgb(237,244,250)` en la instalación final.

Evidencia local ignorada: `test-results/ratio-operations-evidence.json` y
capturas recortadas al tab (sin balances, posiciones ni datos personales).
La captura de Cocos anterior al ajuste de contraste se conserva como diagnóstico.

## Actualización: ocho pares predeterminados

Se agrega inicialización persistida por cuenta con los ocho pares solicitados:
AL30/AL30D, AL30/AL30C, AL30D/AL30C, GD30/AL30, BMA/GGAL,
ALUA/TXAR, TGSU2/TGNO4, PESOS - 7D/PESOS - 1D. La migración agrega sólo
faltantes y conserva IDs/orden de filas existentes y registros de operaciones.
Un par quitado no vuelve al recargar; la restauración explícita agrega faltantes.
Las cauciones RPXXXX BYMA/ARS se muestran como TNA, con apertura deshabilitada
y rechazo adicional en el dominio: las tasas no se tratan como precios para P&L.

- `npm test`: PASS, **537 Vitest + 60 Node + 2 QA infra = 599**.
- `npm run security:check` y `npm run package:free`: PASS.
- Validador del bundle actualizado: **9 recorridos PASS**, incluyendo orden de
  los ocho pares, TNA, eliminación/recarga/restauración y cuentas separadas con
  defaults independientes. También conserva los recorridos de contabilidad.
- Revisión independiente de esta actualización: sin P1/P2; reejecutó 17 tests
  de modelo/storage/hook y 7 del lector.
- Cocos 4.24.4: ocho filas en el orden solicitado, persistidas tras recargar.
  Sin datos previos de operaciones; la inicialización guardó ocho pares y cero
  operaciones, con `watchDefaults: 1`.
- Lecturas nativas PESOS - 7D/PESOS - 1D confirmadas. En la verificación de
  consistencia, UI y referencia nativa coincidieron en 18,60 para PESOS - 1D;
  `getSecurity` y el catálogo devuelven la misma referencia. En las muestras
  anteriores el documento estaba `hidden` y los timers de polling se demoraron
  respecto de los mensajes nativos; se observó convergencia posterior. Cada
  ratio mostrado coincidió con las dos TNA mostradas, a dos decimales.
- Las seis preferencias previas mantienen el hash agregado
  `554de88b44cea158954131bc756670eaa340a2e0e60edfb26f38ab121fdc23e8`.
- Los 18 widgets del dashboard CEDEARs mantienen geometría/configuración:
  SHA256 `9d645070798d4a3d12a87134daa975c75516359243f0f759f044f704cf2a6d09`.
- Respaldo: `Free/backups/extension-before-default-ratios-20261117-154730`.
  Archivos instalados comparados por hash con el dist. Captura recortada local:
  `test-results/default-ratios-cocos.png`.

La advertencia de auditoría de desarrollo del apartado inicial sigue pendiente;
no cambian dependencias ni permisos en esta actualización.
