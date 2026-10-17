# ChuchoTriz

Extensión de Chrome para agilizar la carga de cantidades en el Mini Order Form de
Matriz. Configurá presets por instrumento y aplicalos con un clic. La extensión
completa cantidades; la confirmación de órdenes se realiza desde Matriz.

## Funcionalidades

- Presets de Cantidad y Cantidad a mostrar por instrumento.
- Cantidad a mostrar aleatoria con reglas `R2`, `R3`, `R5`, etc.
- Autocompletado opcional: último preset elegido o primero configurado.
- Editor por instrumento con lista alfabética, búsqueda, altas y bajas.
- Modo RAW para editar todos los presets como texto y alternar con el editor visual.
- Acceso a Configuración desde el engranaje de la barra izquierda de Matriz.
- Reordenamiento de presets con teclado y vista previa de los botones.
- Validación de cantidades y recuperación ante errores al guardar.
- Actualización de preferencias entre vistas, con aviso ante borradores en conflicto.
- Compatibilidad con los dominios `*.xoms.com.ar` y `remarkets.matriz.com.ar`.

Se conservan las claves locales `InstrumentPresets` y `Autocomplete` de versiones
anteriores. Una instalación nueva activa Autocompletar de forma predeterminada;
podés desactivarlo desde Configuración. Limpiar olvida el último preset elegido
para ese instrumento durante la sesión.

La extensión conserva el formulario contraído al iniciar. Sólo lo expande al
aplicar un preset con Cantidad a mostrar mayor que cero, también mediante
Autocompletar. Si ya está expandido, un preset sin cantidad parcial limpia
Cantidad a mostrar y conserva el formulario abierto.

En **A mostrar** podés ingresar un número fijo, `0` para mostrar todo, o `Rn`,
donde `n` es un divisor entero desde 2. Por ejemplo, Cantidad `100000` y A mostrar
`R5` generan el botón `100k/R5`: en cada aplicación se sortea un entero entre
`20000` y `20600`, con ambos extremos incluidos (cantidad dividida por 5, más hasta
un 3%). Los límites se redondean hacia abajo, con un mínimo de una unidad y sin
superar la cantidad total. El autocompletado también realiza un nuevo sorteo,
incluso al reutilizar el último preset elegido. Cambiar manualmente Cantidad
conserva el valor sorteado hasta volver a aplicar el preset; Matriz valida la
relación entre ambas cantidades. La configuración guarda la regla, no el resultado.

El editor muestra una fila compacta por preset. Un clic en cualquier celda o en
el lápiz abre la edición de esa fila: **Mostrar todo**, **Fija** (valor numérico)
o **Aleatoria** (divisor entero desde 2). Cantidad, opciones y valor o divisor
comparten la misma línea en pantallas amplias. En Aleatoria se muestra también
el rango posible. El botón ✓ o Enter en un campo termina la edición; **Guardar
cambios** guarda todos los presets. Reordenar y quitar conservan sus botones.

El selector **Visual / RAW** permite cambiar de editor conservando el borrador.
RAW usa una línea por instrumento, por ejemplo:

```text
AL30 100000/R5 50000/5000 100
GD30 200000/R4 50000/25000
```

Usá enteros sin separadores: `100` o `100/0` muestra todo, `100/20` fija la
cantidad visible y `100/R5` aplica la regla aleatoria. El orden de los presets
y de las líneas se conserva al guardar. Los errores indican su número de línea
y deben corregirse antes de guardar o volver al modo visual. **Guardar cambios**,
**Restablecer valores** y **Descartar cambios** funcionan también en RAW.

## Instalar

Mientras se prepara la publicación en Chrome Web Store:

1. Descargar el ZIP de una [release](https://github.com/ChuchoCoder/ChuchoTriz/releases)
   o compilarlo con las instrucciones siguientes.
2. Descomprimir el ZIP en una carpeta permanente.
3. Abrir `chrome://extensions`, habilitar Modo de desarrollador y elegir
   Cargar extensión sin empaquetar.
4. Seleccionar la carpeta que contiene `manifest.json`.
5. Abrir Matriz y usar Configuración en su barra izquierda. La extensión no
   agrega un popup de configuración a la barra superior de Chrome.

Las releases anteriores pueden contener una versión anterior de la interfaz.
Compilar esta rama genera la versión 0.0.13. Para actualizar una instalación de
desarrollo, reemplazar el contenido de su carpeta y pulsar Recargar en Chrome.
Conservar la misma carpeta mantiene su identidad y configuración de desarrollo.

## Desarrollo y verificación

Usar Node.js 24 LTS y npm.

```sh
npm ci
npm test
npm run package:free
```

El paquete se genera en `releases/chuchotriz-free-0.0.13.zip`. También se puede
cargar `dist` directamente desde Chrome. `npm run build` ejecuta TypeScript,
compila y comprueba el alcance de los archivos fuente y del paquete resultante.
`npm run watch` recompila durante el desarrollo; validar con `package:free`
antes de distribuir.

CI ejecuta las pruebas, valida la extensión, genera el ZIP y comprueba
las dependencias. Los nuevos archivos requieren una revisión explícita y su
incorporación en `free-files.json`.

## Datos y distribución

Las preferencias se almacenan localmente. La extensión pide solamente el permiso
`storage` y no incorpora servidores propios, analítica ni pagos.
La extensión no bloquea las solicitudes de telemetría de Matriz.

- [Privacidad](PRIVACY.md).
- [Mantenimiento y distribución](docs/distribution.md).
- [Reportar problemas](https://github.com/ChuchoCoder/ChuchoTriz/issues).
