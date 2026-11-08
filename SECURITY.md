# Seguridad de ChuchoTriz

Responsable: @chuchocoder. No publicar credenciales, tokens ni datos de cuentas en
issues públicos. Usar el canal privado habitual con el propietario.

## Controles

- CI valida todos los PRs, incluidos borradores y actualizaciones automáticas,
  pushes a main, merge groups y ejecuciones manuales. Security también corre diariamente.
- Dependabot propone actualizaciones semanales de npm en la raíz y GitHub Actions.
  No se configura auto-merge ni otros responsables humanos. Las actualizaciones de
  versiones no habilitan por sí solas las alertas o correcciones de seguridad.
- npm audit rechaza vulnerabilidades moderadas o superiores, incluidas las herramientas
  de desarrollo. Los fallos de instalación, red o escaneo fallan el check.
- Las dependencias directas tienen versiones exactas; el lockfile v3 debe coincidir,
  usar HTTPS del registro oficial y declarar integridad SHA-512 para cada paquete.
- .npmrc deshabilita lifecycle scripts, guarda versiones exactas y exige el engine.
  CI usa npm ci --ignore-scripts --no-audit y no comparte caché npm. Los comandos
  explícitos de build y tests siguen ejecutando código del proyecto y sus dependencias.
- El override exacto de minimatch 11.0.1 corrige GHSA-g3hv-75wg-m249 en las
  dependencias transitivas de ESLint y typescript-eslint, que todavía solicitan v10.
  Retirarlo cuando esas herramientas resuelvan una versión corregida sin override;
  validar instalación, lint, tests y auditoría al actualizarlo.
- ESLint analiza JS/JSX/MJS/CJS/TS/TSX de src y public. Rechaza usos directos de eval,
  Function, callbacks dinámicos de temporizadores, imports remotos/dinámicos y sinks
  de HTML inseguro. Los fixtures *.test.* están excluidos y no se distribuyen.
- scripts/check-free.mjs mantiene la autoridad única del manifest y paquete: solo
  storage, dominios actuales y recursos explícitos, sin workers, permisos opcionales
  ni acceso ampliado. El simulador usa dos lectores de página acotados.
  `options-market-reader.js` se limita al catálogo y las cotizaciones públicas
  nativas. `options-position-reader.js` consulta el reporte nativo de la cuenta
  activa al abrir el simulador o pulsar **Cargar posición** o **Recargar tenencia**. Devuelve los
  identificadores y cantidades de las opciones de la cadena seleccionada, los
  nominales del subyacente, las fechas, el estado de esa lectura y un token
  opaco de contexto y una clave de cuenta derivada mediante SHA-256 con semilla
  aleatoria local por sitio. El identificador de cuenta nunca se exporta ni guarda.
  La contabilidad de opciones se guarda localmente por esa clave, cadena y factor.
  El costo promedio de la tenencia del subyacente se guarda por cuenta, subyacente
  y moneda. Los ajustes de nominales y su costo quedan en el borrador. Las pruebas
  verifican cancelación, cambios de cuenta,
  serialización, datos incompletos y ausencia de cuerpos o errores privados.
  `options-executions-reader.js` consulta las ejecuciones de la cuenta activa
  al pulsar **Actualizar desde Matriz**. Solo devuelve los campos necesarios
  para la vista y el token opaco de contexto. Si se cierra la pestaña, expira
  la lectura o cambia la cuenta, el lector descarta el resultado y deja
  de iniciar búsquedas de instrumentos.
  Se revisan CSP, frames y exposición a otras extensiones.
  La ausencia de CSP conserva los valores predeterminados de Chrome MV3.
- free-files.json enumera cada archivo autorizado. Cada incorporación requiere
  revisión individual; las guardas inspeccionan también src/public ignorados y dist.
- Los workflows requieren Actions fijadas a SHA completo, checkout sin credenciales,
  token de lectura, runners efímeros y timeout. No se permiten triggers privilegiados
  ni expresiones de GitHub interpoladas directamente en shell.
- Gitleaks examina todo el historial alcanzable y zizmor los workflows en modo offline.
  scripts/security/tools.json fija versiones y SHA-256 de releases oficiales para
  Windows/Linux x64; los hashes se comprueban antes de extraer o ejecutar los binarios.
  Se requiere tar y acceso a GitHub. Dependabot no actualiza este JSON: cada actualización
  de herramientas requiere revisar versión, asset y digest oficiales en ambas plataformas.
  CI informa la regla y el commit sin imprimir valores ni rutas de archivos.
- El hook de pre-push revisa secretos, datos personales y adjuntos en los
  commits salientes. El chequeo obligatorio de CI revisa también el rango
  entrante. [Instalación y revisión de capturas](docs/contribuir-privacidad.md).

No se copian excepciones de Premium: cualquier hallazgo de este historial debe
revisarse por separado. Un secreto real requiere revocación/rotación e investigación;
borrarlo del archivo actual no lo elimina del historial. Una excepción futura debe
limitarse al fingerprint del falso positivo revisado, sin excluir archivos ni reglas.
El escaneo git local no incluye cambios sin commit; CI sí incluye el commit del PR.

## Verificación local

Node ^24.15.0 o >=26.0.0, según el requisito de jsdom 30; Node 25 no está
soportado. CI verifica únicamente Node 24, la versión de referencia para
desarrollo y compilación.

```powershell
npm ci --ignore-scripts --no-audit
npm run security:check
npm run security:tools
npm audit --audit-level=moderate
npm test
npm run package:free
node scripts/security/check-policy.mjs --dist
```

## Activación en GitHub

Repositorio objetivo: ChuchoCoder/ChuchoTriz. Usar siempre --repo explícito al
configurar con gh. Los archivos se activan al fusionarse en main; el PR permite
comprobar los checks antes de esa incorporación.

Configuración prevista y verificada por API durante la entrega:

- Dependabot alerts y security updates habilitados; sin auto-merge.
- Secret Scanning y Push Protection de GitHub habilitados.
- Actions exige SHA completo, token por defecto de lectura y no puede aprobar PRs.
- main exige PR, resolución de conversaciones y checks al día, sin force-push ni
  borrado, aplicando las reglas también al administrador:
  - Free validation (Node 24)
  - Dependency audit (.)
  - Extension security policy and source
  - Workflow analysis and secret scan
- CODEOWNERS contiene exclusivamente @chuchocoder para todo el repositorio.
  Se requieren cero aprobaciones y no se exige revisión de CODEOWNERS: GitHub
  impide que el autor apruebe su propio PR y existe un único propietario humano.
  Los checks siguen siendo obligatorios; no se configura un bypass general.

Este repositorio es público y puede proteger main con GitHub Free. Los ajustes
remotos se verifican por separado: estos archivos no habilitan por sí solos la
protección de rama, alertas ni la política global de Actions.

## Alcance

Estos controles reducen riesgos; no garantizan detectar malware, vulnerabilidades
desconocidas ni todas las formas de inyección. El lint no realiza análisis
interprocedural completo. Mantener revisión del diff, dependencias, permisos,
scripts y de las propias guardas. Los hashes fijan bytes o commits, no su confiabilidad.
La validación automática no sustituye comprobar la extensión cargada en Chrome
ni autoriza operaciones de trading. No se modifica el código operativo ni la UI.

Adaptado del PR #56 de ChuchoCoder/ChuchoTriz-premium, head
adb33af0243df309413af9a58b0ef6a7bc05f222, conservando el contrato estricto de Free.

## Referencias oficiales

- [Seguridad de Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [Protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Aprobaciones de PRs](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)
- [Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/)
- [Chrome CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [zizmor](https://docs.zizmor.sh/)
