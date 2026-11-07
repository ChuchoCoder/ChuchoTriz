# Privacidad de ChuchoTriz

Esta declaración describe la extensión ChuchoTriz.

ChuchoTriz lee el instrumento, precio y cantidad del Mini Order Form de Matriz
para mostrar presets y completar las cantidades cuando el usuario lo habilita.
Completar el formulario no envía una orden: la confirmación corresponde a Matriz.

Los presets por instrumento y la preferencia de autocompletar se guardan en
`chrome.storage.local`, dentro del perfil de Chrome. El último preset elegido
por instrumento se mantiene en memoria durante la sesión del formulario.

El simulador de opciones lee el catálogo y las cotizaciones de mercado de Matriz
para mostrar calls, puts, VI y otras métricas. Al abrir el simulador o al pulsar
**Cargar posición** o **Recargar tenencia**, consulta el reporte de la cuenta
activa. El lector devuelve los
identificadores y cantidades de las opciones de la cadena elegida, los nominales
del subyacente seleccionado, las fechas de lectura y reporte y referencias opacas
para verificar el contexto y separar el guardado.
El identificador de cuenta se usa dentro de Matriz y no se copia al simulador.
Se deriva una clave opaca con una semilla aleatoria de este perfil y sitio para
separar el guardado entre cuentas. Las primas históricas, VI por pata, gastos y
realizado se guardan automáticamente en `chrome.storage.local`, junto con los
identificadores y cantidades necesarios para detectar cambios. También se guarda
el costo promedio por nominal ingresado para la tenencia informada por Matriz,
asociado a la cuenta, el subyacente y la moneda. Estos datos financieros quedan
en el perfil de Chrome. Si cambia una cantidad, el simulador pide revisar la
prima o ingresar de nuevo el costo promedio, según corresponda.
El simulador no envía operaciones. La selección de subyacente y vencimiento se guarda
localmente por sitio de Matriz. Los ajustes propuestos, sus supuestos y las
cantidades de nominales ajustadas manualmente se mantienen en memoria durante
la sesión de la página de Matriz, junto con el costo asignado a esas cantidades.
El guardado de estrategias está retirado
de la interfaz; el simulador no lee ni sobrescribe datos guardados por versiones
anteriores.

La pestaña **Operaciones de opciones** consulta el reporte de ejecuciones de la
cuenta activa al pulsar **Actualizar desde Matriz**. El identificador de cuenta
y los eventos originales quedan dentro de Matriz. La pestaña conserva en memoria
los datos de las ejecuciones de opciones mientras está abierta. Al pulsar
**Copiar**, coloca fecha, cantidad con signo, strike y precio en el portapapeles.

La extensión no incorpora analítica, servidores propios, cuentas de usuario,
pagos ni transmisión de esos datos a terceros. No lee contraseñas, cookies ni
tokens de autenticación. Las comunicaciones de Matriz con su broker son
independientes de esta extensión.

Desde Configuración se pueden modificar o quitar instrumentos, desactivar
Autocompletar y restablecer los valores predeterminados. Al desinstalar la
extensión, Chrome elimina su almacenamiento local.

Consultas: [issues de ChuchoTriz](https://github.com/ChuchoCoder/ChuchoTriz/issues).
