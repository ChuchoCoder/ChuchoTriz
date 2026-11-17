# Picomatch endurecido para las herramientas de ChuchoTriz

Copia local privada de picomatch 4.0.7 (MIT). El paquete original se obtuvo de
https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz con integridad
`sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`.

Se conserva la licencia y el código original, excepto `lib/parse.js`:
`extglobClose` trata todas las repeticiones `+(...)` y `*(...)` como literales,
incluidas alternativas y anidaciones, sin permitir desactivar esta restricción.
Esto elimina las repeticiones externas no acotadas de CVE-2026-112366 y de la
variante multirrama encontrada al evaluar un fork. El proyecto no necesita esas
expresiones. `?()`, `@()`, `!()`, globstar, llaves y la API original se conservan.

No se publica en npm y no forma parte de la extensión. Sólo reemplaza la
dependencia de las herramientas de desarrollo. No tiene dependencias ni scripts.
Los bytes revisados se validan antes de compilar mediante
`scripts/security/vendored-picomatch.mjs`; las pruebas incluyen procesos hijos
con tiempo máximo para que una regresión de ReDoS no bloquee el ejecutor.

Retirar esta copia y su override cuando exista una versión upstream corregida
y revisada que también pase los contraejemplos y la regresión del proyecto.
