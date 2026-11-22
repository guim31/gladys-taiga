# Taiga

Lleve sus proyectos de [Taiga](https://taiga.io) a Gladys: las historias de
usuario, tareas y peticiones abiertas, los elementos atrasados y el estado del
sprint en curso (progreso y días restantes). Una escena reacciona cuando un
elemento se atrasa o se abre una nueva petición, otra abre una petición o
añade una historia de usuario al backlog, y un widget lo muestra todo en el
panel.

> **Sus comentarios son bienvenidos.** Esta integración se probó con un
> servidor Taiga real (imagen Docker `taigaio/taiga-back` del 22 de noviembre
> de 2026, con PostgreSQL 16 y RabbitMQ 4), aún no en el uso diario, y no con
> taiga.io. Si algo no funciona como se describe, dígalo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-taiga/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un **Taiga autoalojado** accesible desde Gladys, o una cuenta en
  **taiga.io** (la oferta en la nube usa la misma API; no probada).
- El **usuario** (o correo) y la **contraseña** de un usuario de Taiga
  miembro de los proyectos que se siguen. Debe ser una **cuenta con
  contraseña**: un usuario que entra con GitHub, GitLab o LDAP no puede
  conectarse desde Gladys. Un usuario dedicado, añadido como miembro de los
  proyectos, es buena idea.

La integración ve los proyectos de los que este usuario es miembro, y actúa
**como este usuario**: las peticiones e historias creadas desde Gladys lo
muestran como autor. Un miembro cuyo rol no puede añadir peticiones ni
historias puede seguir un proyecto, pero no crear nada en él.

## Configuración

1. En Gladys, **Integraciones** → instale **Taiga**.
2. En la pantalla **Configuración**, rellene:
   - **Dirección**: la dirección de Taiga como en el navegador, por ejemplo
     `http://192.168.1.20:9000`, o `https://taiga.example.org` detrás de un
     proxy inverso (se conserva un prefijo de ruta como `/taiga`). Para
     taiga.io, `https://tree.taiga.io`;
   - **Usuario o correo electrónico** y **Contraseña**.
3. Opciones:
   - **Proyectos seguidos**: nombres o slugs (el nombre en la dirección del
     proyecto) separados por comas. Vacío: todos los proyectos del usuario,
     20 como máximo;
   - **Aceptar certificados autofirmados**: para una dirección `https://` con
     certificado autofirmado, solo en su propio servidor;
   - **Intervalo de actualización**: de 1 a 10 minutos (5 por defecto). La
     medianoche, cuando los elementos se atrasan, se sigue siempre a tiempo;
   - **Idioma de los nombres de funciones**: los nombres dados a las
     funciones al añadir un dispositivo (francés por defecto).
4. Guarde y luego **Probar la conexión**: lee Taiga e indica el número de
   elementos abiertos y atrasados, y de proyectos seguidos.
5. En la pestaña **Descubrimiento**, añada los dispositivos que desee.

## Dispositivos

**Taiga _dirección_**, la instancia, con una función: `Accesible` (1 cuando
Taiga responde, 0 si no).

**Taiga _proyecto_** para cada proyecto seguido:

| Función                         | Lo que indica                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `Historias de usuario abiertas` | las historias de usuario cuyo estado no está cerrado                                |
| `Tareas abiertas`               | las tareas cuyo estado no está cerrado                                              |
| `Peticiones abiertas`           | las peticiones cuyo estado no está cerrado (0 si el módulo Peticiones está apagado) |
| `Elementos atrasados`           | historias, tareas y peticiones abiertas cuyo vencimiento ha pasado                  |
| `Progreso del sprint`           | % del sprint en curso: puntos cerrados, si no historias de usuario cerradas         |
| `Días restantes del sprint`     | días hasta la fecha de fin del sprint (0 en su último día)                          |
| `Sprint en curso`               | el nombre del sprint en curso; `Ninguno` si no hay                                  |

Un elemento está **atrasado** cuando su día de vencimiento ha terminado, en la
zona horaria de Gladys, y su estado no está cerrado. El **sprint en curso** es
el sprint abierto cuya fecha de inicio es la más reciente ya alcanzada. Si
Taiga no responde, los contadores conservan su último valor y `Accesible`
pasa a 0.

## Panel

El widget **Proyectos de Taiga** muestra tres mosaicos (atrasados, para hoy,
peticiones abiertas) y una lista de 8 filas como máximo: los sprints en curso
con su progreso y días restantes, y luego los elementos atrasados o para hoy,
con su tipo, número y proyecto. Elija un dispositivo de proyecto en la
configuración del widget para ver solo ese proyecto; déjelo vacío para todos
los proyectos seguidos. Desmarque **Mostrar la lista de elementos atrasados**
para mantener solo las cifras y los sprints. Los proyectos llevan su nombre de
Gladys una vez añadido su dispositivo.

Los contadores también pueden ir al panel como cualquier función de
dispositivo.

## Escenas

### Disparadores

- **Elemento de Taiga atrasado**: a medianoche, una historia, tarea o
  petición abierta que vencía ese día no está cerrada. Una vez por elemento y
  vencimiento. Filtros: el proyecto (un dispositivo de proyecto), el tipo
  (historia de usuario, tarea, petición).
- **Nueva petición de Taiga**: se creó una petición en un proyecto seguido.
  Filtro: el proyecto.

Información transmitida a las acciones: el título, el número (`#`), el tipo,
el proyecto, el estado, el vencimiento y el enlace al elemento en Taiga.

Una nueva petición se ve en la lectura siguiente: dentro del intervalo de
actualización. Un proyecto recién añadido a los seguidos no trae ninguna
«nueva petición», y una petición creada y cerrada entre dos lecturas no se ve.
Un vencimiento fijado en un día ya pasado no dispara nada. Un reinicio no
dispara nada dos veces; un elemento atrasado menos de una hora antes del
reinicio dispara en ese momento.

### Acciones

- **Crear una petición de Taiga**: un título, el proyecto por nombre o slug
  (vacío: el primer proyecto seguido), una descripción opcional. La petición
  recibe el tipo, la prioridad y la gravedad predeterminados del proyecto.
- **Crear una historia de usuario de Taiga**: los mismos campos; la historia
  va al backlog del proyecto.

Resultados de ambas: el número (`#`), el identificador, el título, el proyecto
y el enlace. Un fallo (proyecto no encontrado, módulo Peticiones apagado,
permiso que falta, Taiga que no responde) se muestra como un error. Los
campos aceptan variables de escena: `{{triggerEvent.data.item}}`.

### Ideas de escenas

- **Elemento de Taiga atrasado**: enviar el título y el enlace por Telegram.
- **Nueva petición de Taiga** en el proyecto `Sitio web`: hacer parpadear una
  luz de la oficina.
- Cuando la lavadora indica un error, **Crear una petición de Taiga**
  `Lavadora: error` en el proyecto `Casa`.
- Un botón junto a la puerta lanza **Crear una historia de usuario de Taiga**
  `Reparar el portón`.

## Solución de problemas

- **«Taiga no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys (la dirección abre Taiga en un navegador).
- **«Usuario o contraseña rechazados»**: la contraseña cambió, o el usuario
  entra con GitHub, GitLab o LDAP: use un usuario con cuenta por contraseña.
- **«No hay ninguna API de Taiga en esta dirección»**: la dirección responde,
  pero no con la API de Taiga (`/api/v1`): compruebe el puerto y el prefijo
  de ruta.
- **«La dirección redirige»**: introduzca la dirección `https://`.
- **«Este usuario no tiene este permiso en el proyecto»**: el rol del
  usuario en el proyecto no puede añadir peticiones ni historias.
- **Falta un proyecto**: el usuario debe ser miembro; un nombre escrito en
  **Proyectos seguidos** que no corresponde a ningún proyecto se ignora, y
  **Probar la conexión** lo indica. Más allá de 20 proyectos, enumere los que
  desea seguir.
- Registros: `LOG_LEVEL=debug` en el contenedor muestra cada lectura.

## Límites

- Taiga se lee cada 1 a 10 minutos (y a medianoche): un cambio en Taiga llega
  a Gladys en ese plazo. No se usan los webhooks de Taiga.
- En cada lectura: la lista de proyectos y, para cada proyecto seguido, sus
  historias, tareas, peticiones y sprints abiertos (cinco solicitudes). En
  taiga.io, mantenga un intervalo largo: el servicio limita el número de
  solicitudes.
- La sesión se guarda en memoria y se renueva con el token de refresco de
  Taiga al caducar (a las 24 horas en un servidor por defecto); la contraseña
  solo se envía de nuevo si Taiga rechaza ambos.
- La integración crea peticiones e historias de usuario; no edita, cierra,
  asigna ni elimina nada, ni lee épicas, páginas de wiki o comentarios.
- Gladys no guarda datos de Taiga fuera de `/data/taiga-state.json` (la hora
  de la última lectura y el último número de petición visto en cada proyecto,
  para que ningún evento se dispare dos veces).
- Sin relación con Taiga ni Kaleidos.
