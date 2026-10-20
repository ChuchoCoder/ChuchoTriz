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
- ESLint analiza JS/JSX/MJS/CJS/TS/TSX de src y public. Rechaza usos directos de eval,
  Function, callbacks dinámicos de temporizadores, imports remotos/dinámicos y sinks
  de HTML inseguro. Los fixtures *.test.* están excluidos y no se distribuyen.
- scripts/check-free.mjs mantiene la autoridad única del manifest y paquete: solo
  storage, dominios actuales y recursos explícitos, sin workers, puentes, permisos
  opcionales ni acceso ampliado. Se revisan CSP, frames y exposición a otras extensiones.
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
  El reporte de secretos imprime solo ubicaciones/fingerprints, nunca valores.

No se copian excepciones de Premium: cualquier hallazgo de este historial debe
revisarse por separado. Un secreto real requiere revocación/rotación e investigación;
borrarlo del archivo actual no lo elimina del historial. Una excepción futura debe
limitarse al fingerprint del falso positivo revisado, sin excluir archivos ni reglas.
El escaneo git local no incluye cambios sin commit; CI sí incluye el commit del PR.

## Verificación local

Node >=22.13.0; CI verifica 22.13.0 y 24. La actualización mínima desde 22.12.0
corresponde al engine de ESLint; se conservan Vite/Vitest y las versiones de producto.

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
- Actions exige SHA completo, token por defecto de lectura y no puede aprobar PRs.
- main exige PR, resolución de conversaciones y checks al día, sin force-push ni
  borrado, aplicando las reglas también al administrador:
  - Free validation (Node 22.13.0)
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
