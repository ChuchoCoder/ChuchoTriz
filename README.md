# ChuchoTriz gratuito

Extensión de Chrome para agilizar la carga de cantidades en el Mini Order Form de
Matriz. Configurá presets por instrumento y aplicalos con un clic. La extensión
completa cantidades; la confirmación de órdenes se realiza desde Matriz.

## Funcionalidades

- Presets de Cantidad y Cantidad a mostrar por instrumento.
- Autocompletado opcional: último preset elegido o primero configurado.
- Editor por instrumento con lista alfabética, búsqueda, altas y bajas.
- Acceso a Configuración desde el engranaje de la barra izquierda de Matriz.
- Reordenamiento de presets con teclado y vista previa de los botones.
- Validación de cantidades y recuperación ante errores al guardar.
- Actualización de preferencias entre vistas, con aviso ante borradores en conflicto.
- Compatibilidad con los dominios `*.xoms.com.ar` y `remarkets.matriz.com.ar`.

Se conservan las claves locales `InstrumentPresets` y `Autocomplete` de versiones
anteriores. Una instalación nueva activa Autocompletar de forma predeterminada;
podés desactivarlo desde Configuración. Limpiar olvida el último preset elegido
para ese instrumento durante la sesión.

## Instalar

Mientras se prepara la publicación en Chrome Web Store:

1. Descargar el ZIP de una [release](https://github.com/ChuchoCoder/ChuchoTriz/releases)
   o compilarlo con las instrucciones siguientes.
2. Descomprimir el ZIP en una carpeta permanente.
3. Abrir `chrome://extensions`, habilitar Modo de desarrollador y elegir
   Cargar extensión sin empaquetar.
4. Seleccionar la carpeta que contiene `manifest.json`.
5. Abrir Matriz y usar Configuración en su barra izquierda. También se puede
   configurar desde el icono de ChuchoTriz en Chrome.

Las releases anteriores pueden contener una versión anterior de la interfaz.
Compilar esta rama genera la versión 0.0.9. Para actualizar una instalación de
desarrollo, reemplazar el contenido de su carpeta y pulsar Recargar en Chrome.
Conservar la misma carpeta mantiene su identidad y configuración de desarrollo.

## Desarrollo y verificación

Usar Node.js 24 LTS y npm.

```sh
npm ci
npm test
npm run package:free
```

El paquete se genera en `releases/chuchotriz-free-0.0.9.zip`. También se puede
cargar `dist` directamente desde Chrome. `npm run build` ejecuta TypeScript,
compila y comprueba el alcance de los archivos fuente y del paquete resultante.
`npm run watch` recompila durante el desarrollo; validar con `package:free`
antes de distribuir.

CI ejecuta las pruebas, valida la edición gratuita, genera el ZIP y comprueba
las dependencias. Los nuevos archivos requieren una revisión explícita y su
incorporación en `free-files.json`.

## Datos y distribución

Las preferencias se almacenan localmente. Esta edición pide solamente el permiso
`storage` y no incorpora servidores propios, analítica ni pagos.
La extensión no bloquea las solicitudes de telemetría de Matriz.

- [Privacidad](PRIVACY.md).
- [Alcance de la edición gratuita y preparación del Store](docs/free-edition.md).
- [Reportar problemas](https://github.com/ChuchoCoder/ChuchoTriz/issues).
