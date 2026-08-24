# Convenciones — Sales Watcher

Decisiones de código y cómo trabajar en este repositorio. Las decisiones de **producto** están en [ANEXO.md](ANEXO.md); aquí solo van las de implementación.

---

## Estructura

```
sales-watcher/
├── apps/
│   ├── api/          API REST (NestJS) — lógica de negocio, cron, sincronización
│   ├── field/        PWA offline-first del comercial (Vite + React)
│   └── backoffice/   Panel de gestión (Vite + React)
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

## Sincronización offline

Toda operación que la PWA pueda originar sin conexión lleva `id_cliente`: un identificador generado en el dispositivo **antes** de encolar. Es lo que hace idempotente la sincronización — si la cola reintenta un envío que sí llegó, el servidor reconoce el duplicado por ese identificador en lugar de crear un registro doble.

Las tablas con `id_cliente` son `visitas`, `justificaciones`, `incidencias` y `fotos`. Todas tienen índice único sobre él.

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
