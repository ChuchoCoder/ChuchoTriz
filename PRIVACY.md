# Privacidad de ChuchoTriz

Esta declaración describe la extensión ChuchoTriz.

ChuchoTriz lee el instrumento, precio y cantidad del Mini Order Form de Matriz
para mostrar presets y completar las cantidades cuando el usuario lo habilita.
Completar el formulario no envía una orden: la confirmación corresponde a Matriz.

Los presets por instrumento y la preferencia de autocompletar se guardan en
`chrome.storage.local`, dentro del perfil de Chrome. El último preset elegido
por instrumento se mantiene en memoria durante la sesión del formulario.

El simulador de opciones lee el catálogo y las cotizaciones de mercado de Matriz
para mostrar calls/puts, VI y otras métricas. No lee órdenes propias, tenencias ni
saldos y no envía operaciones. Las estrategias que el usuario guarda se almacenan
en `chrome.storage.local` en este perfil, junto con los supuestos de simulación.

La extensión no incorpora analítica, servidores propios, cuentas de usuario,
pagos ni transmisión de esos datos a terceros. No lee contraseñas, cookies ni
tokens de autenticación. Las comunicaciones de Matriz con su broker son
independientes de esta extensión.

Desde Configuración se pueden modificar o quitar instrumentos, desactivar
Autocompletar y restablecer los valores predeterminados. Al desinstalar la
extensión, Chrome elimina su almacenamiento local.

Consultas: [issues de ChuchoTriz](https://github.com/ChuchoCoder/ChuchoTriz/issues).
