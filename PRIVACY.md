# Privacidad de ChuchoTriz

Esta declaración describe la extensión ChuchoTriz.

ChuchoTriz lee el instrumento, precio y cantidad del Mini Order Form de Matriz
para mostrar presets y completar las cantidades cuando el usuario lo habilita.
Completar el formulario no envía una orden: la confirmación corresponde a Matriz.

Los presets por instrumento y la preferencia de autocompletar se guardan en
`chrome.storage.local`, dentro del perfil de Chrome. El último preset elegido
por instrumento se mantiene en memoria durante la sesión del formulario.

El simulador de opciones lee el catálogo y las cotizaciones de mercado de Matriz
para mostrar calls/puts, VI y otras métricas. Al pulsar **Cargar posición**, consulta
el reporte de posición de la cuenta activa y copia únicamente los identificadores
y cantidades de las opciones de la cadena elegida, junto con la fecha del reporte.
El identificador de cuenta se usa dentro de Matriz y no se copia al simulador.
Se deriva una clave opaca con una semilla aleatoria de este perfil y sitio para
separar el guardado entre cuentas. Las primas históricas, VI por pata, gastos y
realizado se guardan automáticamente en `chrome.storage.local`, junto con los
identificadores y cantidades de la posición necesarios para detectar cambios.
Son datos financieros locales; no se sincronizan con otros perfiles ni se envían
a servidores de la extensión. Si cambia una cantidad, se solicita revisar su prima.
El simulador no envía operaciones. La selección de subyacente y vencimiento se guarda
localmente por sitio de Matriz. Los ajustes propuestos y sus supuestos se mantienen en memoria
mientras el simulador permanece abierto. El guardado de estrategias está retirado
de la interfaz; el simulador no lee ni sobrescribe datos guardados por versiones
anteriores.

La extensión no incorpora analítica, servidores propios, cuentas de usuario,
pagos ni transmisión de esos datos a terceros. No lee contraseñas, cookies ni
tokens de autenticación. Las comunicaciones de Matriz con su broker son
independientes de esta extensión.

Desde Configuración se pueden modificar o quitar instrumentos, desactivar
Autocompletar y restablecer los valores predeterminados. Al desinstalar la
extensión, Chrome elimina su almacenamiento local.

Consultas: [issues de ChuchoTriz](https://github.com/ChuchoCoder/ChuchoTriz/issues).
