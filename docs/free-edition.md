# Alcance y mantenimiento de la edición gratuita

Este repositorio y sus paquetes contienen únicamente la edición gratuita:
presets por instrumento, autocompletado de cantidades y su configuración.
Los módulos comerciales se desarrollan y distribuyen por separado.

## Traer mejoras compartidas

1. Partir de una rama de este repositorio público.
2. Seleccionar solamente los archivos revisados que correspondan al alcance
   gratuito. Adaptar los puntos de entrada y revisar sus imports.
3. No fusionar ramas ni importar commits de repositorios privados: su historial,
   mensajes, documentación y archivos eliminados también podrían quedar públicos.
4. Revisar el diff completo antes del push, incluidos tests, imágenes y scripts.
5. Actualizar `free-files.json` solamente después de revisar cada nuevo archivo.
6. Ejecutar `npm ci`, `npm test` y `npm run package:free`. Revisar el ZIP y el PR.

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
vigentes de Matriz, preparar capturas y descripción de la edición gratuita,
publicar la [declaración de privacidad](../PRIVACY.md) en una URL accesible y
completar las declaraciones de datos y permisos del panel de desarrollador.
Confirmar también las condiciones de distribución y los avisos de dependencias.

La edición gratuita usa Manifest V3 y únicamente el permiso `storage`.
Su código de ejecución se incluye en el paquete; no descarga funciones adicionales.
Google exige declarar el manejo de datos incluso si ocurre solamente de forma
local: [FAQ de datos de usuario](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
La publicación queda sujeta a la revisión de Google:
[guía de publicación](https://developer.chrome.com/docs/webstore/publish).
