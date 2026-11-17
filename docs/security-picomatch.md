# Picomatch de las herramientas: corrección local de CVE-2026-112366

El 17/11/2026, [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
bloqueó el PR #75. El registro oficial mantiene 4.0.7 como última versión y el
aviso no identifica una versión upstream corregida. La propuesta upstream
[#237](https://github.com/micromatch/picomatch/pull/237) sigue abierta.

Se revisó el contenido publicado de `@ryotsu/picomatch@4.0.7-a`. Corrige la
variante simple, pero conserva un problema multirrama de la misma familia y
cambia otras reglas de glob. Se descartó: que un nombre distinto no coincida
con la auditoría no demuestra una corrección suficiente. Otras alternativas
revisadas no conservan la API o los sistemas necesarios.

## Cambio y compatibilidad

Se mantiene una copia privada del paquete original, no del fork externo.
En `lib/parse.js`, `extglobClose` clasifica toda repetición `+(...)` o `*(...)`
para su tratamiento literal mediante el mecanismo existente del parser.
No depende del número de alternativas y no puede desactivarse con
`maxExtglobRecursion: false`. Esta sintaxis no es necesaria para la compilación
ni las pruebas del proyecto. `?()`, `@()`, `!()`, globs habituales y API original
permanecen disponibles.

Es una restricción deliberada de compatibilidad para las herramientas, no una
promesa general sobre expresiones regulares arbitrarias. No cambia el código
de ejecución del navegador ni los permisos de la extensión.

## Procedencia y controles

- Original MIT: `https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz`.
- Integridad original: `sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`.
- Se conservan los siete archivos JavaScript y LICENSE; sólo cambia la decisión
  del parser descrita arriba. README y package.json identifican la copia privada
  como `@chuchotriz/picomatch-hardened@4.0.8-chuchotriz.1`.
- No tiene dependencias, scripts de ciclo de vida ni publicación en otro registro.
- `scripts/security/vendored-picomatch.mjs` fija los diez archivos con SHA-256,
  normalizando sólo CRLF/LF. Rechaza cambios, archivos adicionales y symlinks.
  Se ejecuta antes de las entradas habituales de desarrollo, pruebas, lint y build.
- La política admite sólo `picomatch: file:vendor/picomatch` como dependencia de
  desarrollo y el override `$picomatch`. El lockfile permite únicamente ese enlace
  y los metadatos exactos de la copia. Los otros paquetes mantienen registro
  oficial, HTTPS, SHA-512, versiones exactas y rechazo de enlaces y paquetes Git/file.

No se agregan exclusiones de npm audit ni se cambia su umbral, los workflows o
las protecciones de main. La auditoría vuelve a pasar al retirar de la cadena
la implementación afectada, con pruebas del comportamiento real.

## Pruebas y retirada

Las pruebas de seguridad verifican la resolución local efectiva, ausencia de
copias transitivas, API usada por las herramientas y rechazo de cambios no
revisados. Los casos de repeticiones simples, anidadas y multirrama corren en
un hijo con tiempo máximo para que una regresión no bloquee los tests.
Se ejecutan también suite completa, build/paquete, auditoría y regresión del
navegador. Los resultados del commit final están en el PR #75; los fixtures no
sustituyen la integración de una cuenta real de Matriz.

Retirar esta copia cuando una versión upstream revisada supere los mismos
contraejemplos y la regresión: fijar esa versión, restaurar la política sin la
excepción local y eliminar copia, guardas y referencias. No actualizar las sumas
para aceptar cambios sin revisar de nuevo su contenido y sus pruebas.
