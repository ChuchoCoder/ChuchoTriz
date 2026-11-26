# Privacidad de ChuchoTriz

Esta declaración describe la extensión ChuchoTriz.

ChuchoTriz lee el instrumento, precio y cantidad del Mini Order Form de Matriz
para mostrar presets y completar las cantidades cuando el usuario lo habilita.
Al pulsar la acción de carga del simulador, copia el instrumento, la cantidad y
el precio de la operación elegida al Mini Order Form.
Completar el formulario no envía una orden: la confirmación corresponde a Matriz.

Cuando el ticket tiene un instrumento y un plazo compatibles, ChuchoTriz
consulta el reporte nativo de la cuenta seleccionada para mostrar el saldo y
los nominales que quedarían después de comprar o vender. El botón **Usar**
actualiza esa consulta y completa Cantidad. La cuenta, el reporte y el saldo
calculado se usan dentro de la página de Matriz, en memoria. Si ocultás la franja,
ChuchoTriz pausa las consultas y guarda esa preferencia en `chrome.storage.local`.

Los presets y la preferencia de autocompletar de cada instrumento se guardan en
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
cuenta activa automáticamente cada vez que se entra en la pestaña y al pulsar
**Actualizar desde Matriz**. El identificador de cuenta
y los eventos originales quedan dentro de Matriz. La pestaña conserva en memoria
los datos de las ejecuciones de opciones mientras está abierta. Al pulsar
**Copiar**, coloca vencimiento, cantidad con signo, base y prima en el portapapeles.
Las preferencias independientes de formato de fecha y números se guardan en `chrome.storage.local` dentro del
perfil de Chrome.

El widget **Ratios** lee el catálogo de instrumentos, sus últimos precios,
referencias diarias y fechas de operación desde Matriz. Al agregar, editar,
redimensionar o quitar el panel, usa el guardado nativo del dashboard: los pares
elegidos (identificadores, símbolos, mercado, moneda y plazo), posición y tamaño
quedan en el servidor de Matriz asociado a ese dashboard. No consulta reportes
de cuenta ni envía operaciones. Esos registros del dashboard no se eliminan al
desinstalar ChuchoTriz; cerrá el panel desde su título si querés retirarlos.

El widget **Dólar intradiario** también guarda en ese dashboard los instrumentos
A, B y la Referencia C opcional, con su divisor. El widget y los gráficos
intradiarios de las filas de Ratios consultan precios recientes y series
históricas de esos instrumentos en Matriz. ChuchoTriz mantiene las series
en memoria en la pestaña abierta.

La extensión no incorpora analítica, servidores propios, cuentas de usuario,
pagos ni transmisión de esos datos a terceros. No lee contraseñas, cookies ni
tokens de autenticación. Las comunicaciones de Matriz con su broker son
independientes de esta extensión.

La pestaña **Ratios** de Configuración lee el catálogo, el tipo de instrumento,
las unidades de cotización y las puntas/últimos precios desde Matriz. El monitor
y los registros manuales de apertura/cierre se guardan en `chrome.storage.local`,
separados por cuenta y sitio mediante una semilla local y una clave opaca.
Incluyen instrumentos, cantidades, precios, fechas, comisión, DDMM, factores,
objetivo de ratio y cierres. No consulta reportes de tenencia o ejecuciones ni
envía órdenes. Los registros permanecen en este perfil; no se sincronizan con
el servidor del broker. Al desinstalar la extensión se pierde este registro local.

Desde Configuración se pueden modificar o quitar instrumentos, desactivar
Autocompletar y restablecer los valores predeterminados. Al desinstalar la
extensión, Chrome elimina su almacenamiento local.

Consultas: [issues de ChuchoTriz](https://github.com/ChuchoCoder/ChuchoTriz/issues).
