# Convenciones — Sales Watcher

Decisiones de código y cómo trabajar en este repositorio. Las decisiones de **producto** están en [ANEXO.md](ANEXO.md); aquí solo van las de implementación.

---

## Estructura

```
sales-watcher/
├── apps/
│   ├── api/          API REST (NestJS) — lógica de negocio, cron, sincronización
│   ├── field/        PWA offline-first del comercial (Vite + React, puerto 5173)
│   └── backoffice/   Panel de gestión (Vite + React, puerto 5174)
├── packages/
│   ├── shared/       Tipos, validación Zod, i18n y reglas de jornada
│   └── db/           Esquema Drizzle, migraciones y datos semilla
├── docker-compose.yml
└── *.md              Documentación de producto
```

**Por qué monorepo:** los tipos del dominio y las reglas de jornada tienen que ser idénticos en la PWA y en la API. Duplicarlos garantizaría que se desincronizasen, y el punto donde eso más duele es la ventana de justificación: si el cliente y el servidor no coinciden en si está abierta, el comercial ve un botón que el servidor rechaza.

## Idioma del código

**Los identificadores del dominio van en castellano**: `visita`, `tienda`, `justificacion`, `noRealizada`. El andamiaje técnico va en inglés por convención del ecosistema: `index.ts`, `build`, `test`.

Es una decisión deliberada, no descuido. La especificación está en castellano y el dominio también (DANONE España); traducir `tienda` a `store` o `shop` introduce ambigüedad en cada lectura y obliga a mantener un diccionario mental entre SPECS.md y el código. Manteniéndolos iguales, cualquier término del documento se puede buscar literalmente en el repositorio.

- **Base de datos:** `snake_case` en castellano — `numero_trabajador`, `capturada_en`.
- **TypeScript:** `camelCase` en castellano — `numeroTrabajador`, `capturadaEn`.
- **Comentarios y commits:** castellano.

## Reglas del esquema

Estas no son preferencias, son invariantes del dominio. Romperlas rompe datos.

**Marcas de tiempo en UTC, siempre.** Todas las columnas temporales son `timestamptz`. La conversión a la zona del comercial ocurre solo en presentación. Única excepción: `ruta_diaria.fecha` y `visita.fecha` son `date` sin zona, porque una jornada es un día del calendario local, no un instante universal.

**Los catálogos se desactivan, no se borran.** Categorías, motivos, tipos de tienda y zonas llevan `activo`. Un borrado real rompería el histórico de visitas que los referencia. Ninguna relación hacia un catálogo usa `ON DELETE CASCADE`.

**Las incidencias referencian la categoría por `id`, nunca por texto.** Si guardaran el texto, renombrar una categoría reescribiría retroactivamente lo que reportaron los comerciales.

**`numero_referencia` de tienda no es clave primaria.** Cuando llegue el ERP la correspondencia se hará por `id_externo`. Ver la decisión que cierra P2 en el ANEXO.

**El contenido configurable traducible es JSONB**, con una clave por idioma. Se resuelve siempre con `resolverTexto()` de `@sw/shared`, nunca accediendo a la clave directamente: la cadena de respaldo es parte de la especificación.

**La auditoría es append-only.** La tabla `auditoria` no se actualiza ni se borra nunca. Un registro de auditoría editable no vale como registro de auditoría.

## La regla que más fácil se rompe

> **La ventana de justificación se valida contra `capturada_en` (hora del dispositivo), nunca contra `recibida_en` (hora del servidor).**

El comercial puede justificar a las 19:55 sin cobertura y que la cola sincronice a las 21:30. Validar contra la hora de recepción rechazaría esa justificación y castigaría al comercial por el fallo de red que el modo offline existe para absorber.

`recibida_en` existe solo para auditoría. Si aparece en una comparación de ventana, es un bug. Hay un test que lo cubre en `packages/shared/src/jornada.test.ts`.

## Autenticación

Cuatro guards globales, en este orden — importa, porque cada uno depende del anterior:

1. **Throttle** — antes que nada, para que un ataque no llegue ni a consultar la base de datos. Login lleva un límite propio más estricto.
2. **JWT** — valida el token *y consulta base de datos*. Un JWT es autocontenido, y con tokens de 30 días eso significa que sin mirar la base de datos un usuario dado de baja seguiría entrando un mes. Se comprueba que sigue activo, que no está bloqueado, y que la contraseña no ha cambiado desde la emisión.
3. **Cambio de contraseña pendiente** — veta toda la API salvo el propio cambio y `/auth/yo`.
4. **Roles** — la comprobación más específica, la última.

Todo endpoint exige autenticación por defecto. `@Publico()` es la única forma de abrir una ruta, y cada uso es una puerta sin cerradura.

**Los roles no heredan.** Un administrador *no* puede comenzar una visita. Las acciones de campo pertenecen a quien pisa la tienda; que un administrador pudiera ejecutarlas contaminaría el registro de actividad, que es lo que este sistema existe para documentar.

**Comprobar `requiereCambioPassword` solo en login no sirve de nada.** El usuario recibe un token válido y puede ignorar la pantalla de cambio llamando directamente a cualquier endpoint, con una contraseña temporal que un tercero conoce. Por eso el veto es un guard global.

**`password_cambiado_en` es el interruptor de emergencia.** Cada token lleva su fecha de emisión y el guard la compara con ese campo: cambiar o regenerar la contraseña mata al instante todos los tokens anteriores. Sin él, regenerar la contraseña de un móvil perdido no cerraría la sesión que sigue viva en él.

**El login verifica un hash aunque el usuario no exista.** Si no, la respuesta sería mucho más rápida para un número de trabajador inexistente, y esa diferencia de tiempo permite enumerar cuáles son válidos. Los números de trabajador son correlativos, así que la enumeración es barata.

## Visitas

**La visita se materializa, no aparece sola.** Una ruta asignada es solo una fila en `rutas_diarias`; sin fila en `visitas` no hay `visitaId` que enviar, y el comercial no podría justificar una tienda a la que no ha ido — que es justo el caso que la justificación existe para cubrir.

Se materializa en dos sitios, ambos idempotentes por `NOT EXISTS`: al cargar la vista del día, y en el cierre de jornada. Lo segundo importa más de lo que parece: **quien no visita una tienda normalmente tampoco abre la app**, así que el incumplimiento más frecuente es precisamente el que no deja fila. Sin materializar en el cierre, la bandeja del supervisor mostraría cero.

**Los estados terminales son terminales.** `finalizada` y `no_realizada` no admiten fotos, ni justificación, ni reapertura. Las transiciones devuelven 409 en lugar de aceptar en silencio.

**Todas las operaciones aceptan `capturadaEn` del dispositivo.** Con modo offline pueden separarse horas de la llegada al servidor, y lo que documenta la visita es cuándo ocurrió.

### Geolocalización: tres resultados, no dos

`evaluarDesviacion` vive en `@sw/shared` y devuelve `evaluable`, no solo un booleano. Un "no se pudo evaluar" honesto es más útil al supervisor que un falso positivo.

No se evalúa cuando falta alguna ubicación, o cuando la precisión del GPS supera 200 m — dentro de un centro comercial las lecturas se van cientos de metros y marcar eso como sospechoso sería culpar al comercial del edificio. Y la incertidumbre declarada **se suma a la tolerancia**: 330 m medidos con 150 m de error podrían ser 180 reales, así que no se marcan.

Nada de esto bloquea la visita. Es una señal para el supervisor.

### Cierre de jornada: por zona, cada hora

El cron corre **cada hora**, no una vez al día, y comprueba zona por zona si su hora local ya pasó el cierre. Un único disparo diario obligaría a elegir la zona de quién: cuando en la Península son las 21:00, en Canarias son las 20:00 y allí todavía se trabaja.

Las visitas cerradas así quedan con `justificada: false`, que es un desenlace distinto y peor que una justificada. El backoffice los separa.

### Checklist: el resultado existe antes de rellenarse

Abrir el checklist **materializa las filas de resultado**, igual que la vista del día materializa las visitas. Resuelve un orden si no imposible: una foto de ítem necesita `resultadoChecklistId` para asociarse, pero ese resultado no existiría hasta marcar el ítem — y marcar un ítem que exige foto requiere que la foto ya esté.

**El requisito de fotografía cuenta solo fotos confirmadas.** Una reserva cuya subida no terminó no satisface nada, y se comprueba en servidor, no solo en la app: la cola offline envía operaciones preparadas hace horas contra un estado que pudo cambiar.

**Desmarcar se permite mientras la visita siga abierta.** El comercial puede equivocarse de fila en una lista de nueve ítems mirando el móvil en un pasillo; obligarle a cerrar la visita mal por un toque erróneo sería absurdo. Al cerrar, el estado queda congelado.

**La plantilla específica del tipo de tienda gana sobre la global, pero la global es el respaldo.** Sin respaldo, una tienda de tipo nuevo se quedaría sin checklist y toda visita a ella parecería completa: peor que no tener checklist es tener uno vacío que da la visita por buena.

## Incidencias

**Las transiciones de estado se declaran explícitamente.** Sin eso, un supervisor podría reabrir una incidencia resuelta hace meses y descuadrar los informes de un periodo ya cerrado. `resuelta` y `descartada` son terminales.

**La bandeja filtra por zona para supervisores.** Sin ese filtro, la bandeja de un supervisor catalán se llenaría de incidencias vascas que no puede resolver.

**La prioridad por defecto viene del catálogo, pero el comercial puede cambiarla.** Es quien está delante del lineal y ve el contexto que la categoría no captura.

## Backoffice

**No hay endpoints de borrado.** Catálogos, tiendas, usuarios e ítems de checklist se desactivan. Borrar de verdad rompería el histórico que los referencia, y una incidencia sin categoría no se puede leer ni contar.

**Los códigos no se editan.** `codigo` es la clave estable que usan seeds e integraciones; renombrarlo rompería referencias externas en silencio. Para "renombrar" se desactiva y se crea otro. El `PATCH` descarta el campo aunque venga en el cuerpo.

**Basta con el castellano para crear contenido traducible.** Exigir los cinco idiomas bloquearía al administrador que necesita dar de alta una categoría hoy porque el cliente la pidió esta mañana. Lo que falte aparece en `GET /catalogos/traducciones`, que es el mecanismo que evita que los idiomas minoritarios se degraden por acumulación (P16).

**El filtro por zona no es opcional para supervisores.** Un supervisor ve solo los comerciales y las incidencias de su zona. Sin ese filtro tendría delante la plantilla entera y una bandeja llena de cosas que no puede resolver.

**Un administrador no puede desactivarse ni degradarse a sí mismo.** Con un solo administrador, cualquiera de las dos cosas dejaría la instalación sin nadie capaz de gestionarla.

### Importación CSV

Es el ensayo de la futura integración con ERP: el mapeo de columnas que define es el borrador de ese contrato.

**No aborta el fichero ante una fila mala.** Un CSV de tres mil tiendas con dos filas defectuosas carga las otras dos mil novecientas noventa y ocho y devuelve número de línea y motivo de cada rechazo. Rechazarlo entero obligaría a un ciclo de corrección a ciegas.

El parseo respeta comillas porque las direcciones españolas traen comas con frecuencia (`"Calle Mayor 12, 3º B"`), que es justo lo que un `split(",")` rompería. Las filas importadas quedan con `origen: 'csv'`.

### Planificar una ruta crea sus visitas

El planificador inserta la fila de `visitas` junto a la de `rutas_diarias`. La materialización perezosa de la vista del día pasa así a ser una red de seguridad para rutas cargadas por otras vías, no el mecanismo principal.

**Replanificar sustituye la ruta completa**, pero se bloquea si alguna visita de ese día ya empezó: borrarla destruiría un registro de actividad real.

## Backoffice como aplicación

**Sin service worker ni caché offline**, a diferencia de la app de campo. Lo dice la especificación (SPECS §4) y tiene razón: se usa desde un escritorio con conexión estable, y una caché de informes mostraría cifras viejas al supervisor sin que él lo supiera.

**Cliente de API y sesión son ficheros propios, no compartidos con `field`.** Comparten forma, y esa duplicación es deliberada: allí `esFalloDeRed` decide si una operación se encola, aquí solo decide qué mensaje se enseña. Unificarlos arrastraría la semántica offline a una app que no la tiene. Si divergen en algo que no sea eso, conviene revisarlo.

**Claves de almacenamiento distintas** (`sw.bo.*` frente a `sw.*`). Los dos front pueden convivir en el mismo navegador, y compartirlas haría que entrar como supervisor cerrara la sesión del comercial.

**El "hoy" del panel es el del usuario, no el del servidor.** Se resuelve con la zona horaria de su zona comercial. Usar la fecha UTC haría que a las 00:30 en Madrid el panel mostrara el estado de ayer bajo el título "Estado de hoy".

**Las incidencias abiertas del panel son el pendiente TOTAL, no las de hoy.** Es una cifra de acumulación: mostrar cero porque hoy no se ha reportado ninguna, teniendo sesenta sin resolver, le diría al supervisor que no tiene nada que hacer.

**Los filtros de periodo se aplican con un botón, no al escribir.** Cambiar la fecha carácter a carácter dispararía una consulta agregada por pulsación, y esas consultas recorren la actividad de un mes.

**Las descargas de CSV van por `fetch` y blob, no por `<a href>`.** El endpoint exige cabecera de autorización y un enlace directo llegaría sin ella.

## Informes

**El denominador de la cobertura sale de `rutas_diarias`, no de `visitas`.** Es la diferencia entre "qué se planificó" y "qué llegó a existir": si una ruta no se materializó, contar sobre visitas inflaría la cobertura al hacer desaparecer del denominador justo lo que no se hizo.

**Las no realizadas sin justificar se cuentan aparte, siempre.** Son el desenlace peor y lo que el supervisor tiene que reclamar; mezclarlas con las justificadas escondería exactamente lo que hay que mirar.

**La bandeja de justificaciones se construye sobre `visitas`, no sobre `justificaciones`.** Una visita no realizada sin justificar no tiene fila en esa tabla y desaparecería del listado — y son precisamente las que exigen acción. Van primero en el orden.

**El informe de no realización devuelve un indicador de concentración.** Si un solo motivo se lleva más de la mitad, marca `revisarCatalogo: true`: el catálogo estaría funcionando como trámite y no como medida, que es el riesgo identificado en el ANEXO.

**La duración media descarta las visitas de más de ocho horas.** Son un check-out olvidado, no una visita larga, y una sola arrastraría la media del equipo entero. Se devuelve también la mediana, que aguanta mejor los valores extremos.

**El ámbito por zona se aplica sobre la zona del COMERCIAL, no la de la tienda.** Una visita fuera de ruta a una tienda de otra zona sigue siendo actividad de su equipo, y es a su equipo a quien el supervisor supervisa.

**El CSV lleva BOM y saltos CRLF.** Sin ellos, Excel en Windows abre el fichero con los acentos rotos y el informe llega ilegible a quien lo pidió.

## Fotografías

**El fichero nunca pasa por la API.** El dispositivo sube directo al almacenamiento con una URL firmada. Con cientos de visitas al día y varias fotos por visita, proxiar las subidas convertiría la API en un cuello de botella.

Eso obliga a un flujo de tres pasos: reservar (la API crea la fila y devuelve la URL firmada) → subir (dispositivo contra el almacenamiento) → confirmar (la API comprueba con `HeadObject` que el objeto existe y que tamaño y tipo coinciden con lo declarado).

**El paso de confirmación no es opcional.** Mientras `confirmada_en` sea null, la foto es solo una reserva. Sin esa verificación, un ítem de checklist que exige fotografía quedaría satisfecho por una fila apuntando a un objeto que nunca se subió — y como el comercial puede perder cobertura a mitad de la subida, eso no es un caso hipotético.

**Los tipos van en lista blanca cerrada**, no comprobando que empiece por `image/`. Un SVG es técnicamente una imagen y el navegador ejecuta el script que lleve dentro al abrirlo desde una URL firmada.

**Bucket privado.** No hay acceso sin URL firmada ni conociendo la clave. Las de descarga duran 5 minutos porque se generan al vuelo cada vez que alguien mira una foto.

### El orden de borrado en la purga

> **Primero el objeto, después la fila. Nunca al revés.**

Si se borrase primero la fila, un fallo al borrar el objeto lo dejaría huérfano para siempre: nadie sabría que existe, seguiría ocupando espacio y —en el caso de la retención— seguiría existiendo un dato personal que debía haberse eliminado. Al revés, un fallo deja la fila viva y el siguiente pase lo reintenta.

Por eso solo se borran de base de datos las claves que el almacenamiento confirma haber eliminado.

La purga limpia dos cosas: fotos caducadas por retención, y reservas que nunca se confirmaron. La segunda no es un caso raro — es lo que deja una pérdida de cobertura a mitad de subida.

**El plazo de retención sigue sin decidirse (P7), pero el mecanismo ya funciona.** El plazo es un parámetro; el proceso era el trabajo. Cuando negocio fije el número, `POST /api/mantenimiento/purga-fotos` ejecuta el borrado retroactivo sin desplegar nada.

**`RETENCION_FOTOS_DIAS` vacío significa indefinido, no cero.** Confundirlo borraría todas las fotos en la primera pasada. Hay un test que lo cubre.

## La app de campo sin cobertura

**Se intenta el envío directo y solo se encola si falla por RED.** Un 409 por ventana cerrada o un 403 por visita ajena se propagan tal cual: encolarlos metería en la cola algo que va a fallar igual en cada reintento.

La contrapartida es que hay dos caminos y pueden divergir. Por eso el cuerpo directo y el encolado se construyen en el **mismo sitio**, dentro de `ejecutar()`.

**Nunca decir "no hay" cuando es "no se pudo cargar".** Una visita abierta sin cobertura mostraba *"Esta tienda no tiene checklist configurado"* — mentira que llevaría al comercial a cerrar la visita sin hacerlo. Los componentes reciben `disponible` además de los datos.

**La precarga ocurre al cargar la vista del día, no al abrir cada visita.** El comercial pierde la señal *dentro* de la tienda: descargar el checklist al abrirla llegaría tarde. Es el requisito de SPECS §4.

**El service worker no reintenta escrituras.** Cachea el shell y las lecturas (`NetworkFirst`, 4 s de espera), pero las mutaciones son de la cola en IndexedDB, que sabe distinguir un fallo temporal de uno permanente. Background Sync duplicaría esa lógica con menos información.

**El almacén se vacía al cerrar sesión.** Los móviles se comparten entre turnos y el siguiente comercial vería la ruta del anterior.

**El indicador solo aparece cuando hay algo que decir.** Un distintivo verde permanente se vuelve invisible por costumbre y deja de comunicar cuando importa.

## Fotografías en el cliente

**Se comprime antes de subir, siempre.** Lado mayor 1600 px y JPEG al 0,8: una foto de móvil pasa de ~4 MB a ~270 KB sin que deje de leerse un precio en el lineal. Sin esto se consumen los datos móviles del comercial —que suelen ser su tarifa— y el almacenamiento crece a razón de cientos de visitas al día.

**`createImageBitmap` con `imageOrientation: "from-image"`.** Sin ello, las fotos verticales de algunos móviles se suben giradas 90° y el supervisor ve el lineal de lado.

**Fondo blanco antes de dibujar en el lienzo.** Un PNG con transparencia convertido a JPEG mostraría esas zonas en negro, y una foto de lineal con manchas negras parece un fallo de cámara.

**El binario se guarda en IndexedDB cuando no hay cobertura.** La subida son tres pasos y el primero ya necesita red, así que encolar solo la intención no bastaría: sin el fichero no habría nada que subir al volver la señal.

**Las fotos se suben DESPUÉS de sincronizar la cola.** Una foto de ítem de checklist necesita que su fila de resultado exista en el servidor; al revés, el destino al que asociarla podría no haberse creado todavía.

**Una foto rechazada de forma definitiva se descarta tras unos intentos.** Un binario que nunca va a entrar ocuparía el almacenamiento del móvil sin límite.

## Sincronización offline

Hay **dos identificadores distintos** y confundirlos rompe cosas:

- **`id_cliente`** identifica una **entidad**: esta visita, esta incidencia. Sirve para que las operaciones posteriores del lote puedan referirse a algo que aún no existe en servidor. Está en `visitas`, `justificaciones`, `incidencias` y `fotos`, con índice único.
- **`op_id`** identifica una **entrada de cola**: este intento de finalizar. Vive en `operaciones_sincronizadas` y sirve para no repetir la operación.

### Por qué hacen falta los dos

Las claves únicas de entidad resuelven las altas: reenviar "crear visita" no duplica. Pero **no resuelven las transiciones de estado**. Si el servidor aplica el lote entero y la respuesta se pierde, el cliente reenvía, y "comenzar visita" sobre una visita ya finalizada devuelve un conflicto. Datos correctos, pero el comercial ve *"no se pudo comenzar la visita"* de una visita que sí se registró.

Con `op_id`, el reintento reproduce el resultado guardado en lugar de reintentar la transición.

### El lote NO es una transacción

Envolverlo entero haría que una sola operación imposible —una justificación cuya ventana cerró— revirtiera también las diez que sí valían. Y como esa operación fallaría igual en cada reintento, la cola quedaría atascada para siempre y se perdería el trabajo de toda la jornada.

Cada operación se aplica por separado, en orden, y se informa de su suerte.

### Permanente frente a temporal

> El cliente tiene que poder distinguir **"descarta esto"** de **"vuelve a intentarlo"**.

Sin esa distinción, o reintenta indefinidamente algo que nunca entrará, o descarta trabajo real de campo. Los códigos 4xx son permanentes; todo lo demás, temporal. **El sesgo por defecto es conservar**: reintentar de más cuesta una petición, descartar de menos pierde una visita entera.

Los fallos no se registran en `operaciones_sincronizadas` — un fallo temporal debe poder reintentarse con el mismo `op_id`.

### Adopción de visitas

Si el comercial llega a una tienda de su ruta por el buscador en vez de por la card —típico si abrió la app sin cobertura—, se crea una visita "no planificada" para una tienda que sí estaba asignada. Al materializar la ruta después, **se adopta la existente** en lugar de crear otra: enlazarla a la ruta y reclasificarla como planificada. Crear una segunda dejaría dos tarjetas de la misma tienda y contaría doble en cobertura.

## Puesta en marcha

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm infra:up          # Postgres + MinIO en Docker
pnpm db:generate       # genera migraciones desde el esquema
pnpm db:migrate
pnpm db:seed           # catálogos placeholder traducidos
pnpm dev
```

`pnpm infra:reset` borra los volúmenes y arranca de cero.

## Migraciones

Se generan desde el esquema con `pnpm db:generate` y se revisan **siempre** antes de commitear — drizzle-kit acierta casi siempre, pero un renombrado de columna lo interpreta como borrar y crear, lo que perdería datos en producción.

Las migraciones ya aplicadas en un entorno compartido no se editan. Se corrige con una migración nueva.

## Hosting

Deliberadamente sin decidir (ROADMAP fase 0). El código solo conoce `DATABASE_URL` y las variables `S3_*`, así que `docker-compose` en local y cualquier proveedor gestionado en producción son intercambiables sin tocar nada.

La consecuencia práctica: **no usar APIs específicas de un proveedor**. Nada de funciones edge, nada de SDK propietario de almacenamiento — el cliente S3 estándar sirve para S3, R2, MinIO y Spaces.
