# Privacidad al contribuir

Activá el control local desde un checkout que contenga estos archivos, con Node 24,
Git y `tar` disponibles. Windows y Linux x64 usan el Gitleaks fijado por SHA-256
en `scripts/security/tools.json`.

```sh
node scripts/security/install-privacy-hook.mjs
```

El instalador guarda el control en el directorio compartido de Git y se aplica
a todos los worktrees del clon. Ejecutalo en cada clon y cuando se actualice
el escáner. Si ya tenés un hook de pre-push, coordiná su integración antes de
instalar el control.

El hook inspecciona los commits que se van a enviar, incluidos los intermedios.
Bloquea secretos reconocidos por Gitleaks, correos fuera de dominios de ejemplo
o GitHub noreply y patrones de DNI, CUIT/CUIL, CBU/CVU y números de cuenta.
También bloquea archivos de entorno, trazas del navegador, archivos comprimidos
y exportaciones como CSV y Excel. El chequeo de seguridad de GitHub repite el
control para los commits del PR o de la cola de merge. GitHub Push Protection
bloquea en el servidor los secretos de proveedores que reconoce.

Para agregar o actualizar una captura, revisá lo que se ve y sus metadatos.
Usá datos ficticios o una copia enmascarada. Después de agregarla al índice,
obtené su blob con `git rev-parse :docs/images/archivo.png` y agregá el valor a
`scripts/security/reviewed-media.json`, bajo la ruta del archivo y en una lista
JSON de blobs revisados. Un cambio en el archivo requiere revisar el nuevo blob.
Usá el mismo procedimiento para otros binarios, videos y documentos. Incluí
la lista actualizada en el commit para que CI pueda verificar la revisión.

Si aparece un hallazgo, corregí todos los commits salientes afectados.
Borrar el dato en un commit posterior no lo quita del historial. Para
fixtures, usá datos ficticios y dominios reservados como `example.com`.
Si una credencial ya fue publicada, revocala o rotala.

Los patrones también se aplican a nombres de archivos, mensajes y correos de
autoría de los commits salientes. Configurá el correo noreply de GitHub como
`user.email` si usás una dirección privada para trabajar. Revisá manualmente
nombres, domicilios, saldos y posiciones de personas reales, además de archivos
con formatos distintos a los contemplados.
