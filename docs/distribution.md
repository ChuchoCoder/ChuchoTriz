# Mantenimiento y distribución

ChuchoTriz ofrece presets por instrumento, autocompletado de cantidades y su
configuración desde Matriz.

## Incorporar cambios

1. Partir de una rama de este repositorio.
2. Revisar los puntos de entrada y sus imports.
3. Revisar el diff completo antes del push, incluidos tests, imágenes y scripts.
4. Actualizar `free-files.json` solamente después de revisar cada nuevo archivo.
5. Ejecutar `npm ci --ignore-scripts --no-audit`, `npm run security:check`,
   `npm test` y `npm run package:free`. Revisar el ZIP y el PR.

`check:free` exige una lista explícita de archivos del repositorio y examina
también archivos ignorados dentro de `src` y `public`. El build valida permisos,
dominios, recursos expuestos y el contenido de `dist`. El empaquetado agrega
solamente los archivos de ese directorio validado. CI ejecuta estos controles
también en PRs draft.

Estos controles previenen incorporaciones accidentales conocidas; no sustituyen
la revisión humana. Código renombrado, secretos fuera de los patrones detectados
o cambios a las propias guardas necesitan revisión del diff.

## Preparación de Chrome Web Store

El comando `npm run package:free` genera
`releases/chuchotriz-free-<versión>.zip`, con `manifest.json` en la raíz.
Este comando prepara un paquete local; no publica ni actualiza una extensión.

Antes de enviar una versión al Store, validar el formulario en las versiones
vigentes de Matriz, preparar capturas y descripción de la extensión,
publicar la [declaración de privacidad](../PRIVACY.md) en una URL accesible y
completar las declaraciones de datos y permisos del panel de desarrollador.
Confirmar también las condiciones de distribución y los avisos de dependencias.

ChuchoTriz usa Manifest V3 y únicamente el permiso `storage`.
Su código de ejecución se incluye en el paquete; no descarga funciones adicionales.
Google exige declarar el manejo de datos incluso si ocurre solamente de forma
local: [FAQ de datos de usuario](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
La publicación queda sujeta a la revisión de Google:
[guía de publicación](https://developer.chrome.com/docs/webstore/publish).

Los controles adicionales de dependencias, workflows, inyección y secretos están
documentados en [SECURITY.md](../SECURITY.md). Mantener un único propietario
humano, `@chuchocoder`, y los checks obligatorios de GitHub.
