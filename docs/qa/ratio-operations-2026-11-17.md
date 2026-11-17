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
