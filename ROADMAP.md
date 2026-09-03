# ROADMAP — Sales Watcher

Checklist de fases del proyecto. Marcar según avance.
Detalle funcional en [SPECS.md](SPECS.md) · Notas y decisiones en [ANEXO.md](ANEXO.md)

**Leyenda:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho

> **⚠️ Reencuadre funcional (2026-08-25).** El cliente ha entregado el *Primer boceto funcional*, que **cambia el propósito del producto**: de registro de actividad con checklist a **gestión de incidencias y oportunidades con seguimiento hasta el resultado**. Las tareas nuevas van marcadas con **🆕** en la fase que les corresponde.
>
> Reparto del impacto: **fases 1 y 2 aguantan bien** (son infraestructura), **la fase 3 se rehace en su mayor parte** (la pantalla de visita cambia entera) y **la fase 4 se amplía** más que se rehace. El balance completo está en [ANEXO.md](ANEXO.md) sección 1-bis.
>
> **Reencuadre cerrado (ronda 5).** El cliente ha respondido a las doce preguntas y ha delegado dos decisiones. **Nada bloquea ya el arranque.** Quedan abiertas P31 (audio en vídeo) y P32 (origen del catálogo de referencias), ninguna de las cuales impide diseñar ni construir — pero P31 conviene resolverla antes de implementar el flujo de vídeo, porque después sale caro.
>
> **📄 Especificación v2 (2026-08-31).** El cliente entrega una segunda especificación funcional que **ajusta, no reencuadra**: nueve cambios de detalle sobre los flujos ya diseñados (nevera, nueva implantación, bloque de marca, Top Picos, evidencia obligatoria, GPS, preguntas redundantes). Ver el detalle en [ANEXO.md](ANEXO.md) ronda 6 y las tareas nuevas con **🆕** en la fase 3. P32 (catálogo de referencias) sigue abierta — el cliente lo enviará más adelante.
>
> **📄 Especificación funcional FSM v2.0 (2026-09-03).** El cliente entrega una tercera especificación, esta vez centrada por completo en **el backoffice**. Reencuadra la fase 4: el producto se organiza en cuatro secciones (Actividad · Acciones · Tiendas · Resultados), y la planificación de rutas y la bandeja de justificaciones dejan de ser pantallas centrales. No afecta a la app de campo (fase 3) ni al modelo de `Visita`. Detalle completo en [ANEXO.md](ANEXO.md) ronda 7, [SPECS.md](SPECS.md) v0.8 y las tareas nuevas con **🆕** en la fase 4.

> **Actualizado tras tres rondas de respuestas de negocio (2026-08-24).** Multi-idioma en el MVP con cinco idiomas de interfaz, flujo de visita no realizada con ventana diaria de justificación, y catálogo de tiendas preparado para un ERP futuro. Fase 0 casi cerrada.

---

## Fase 0 — Validación y arranque

- [x] Validar SPECS.md con el equipo de negocio
- [x] Decidir si el encargado de tienda tendrá acceso propio → **no, es interlocutor**
- [x] Confirmar origen del catálogo de tiendas → **manual con placeholders; ERP más adelante**
- [x] Confirmar franjas horarias → **ruta diaria sin franja obligatoria**
- [x] Definir qué pasa con una visita planificada no realizada → **estado propio + justificación**
- [x] Confirmar multi-idioma → **sí, desde el MVP**
- [x] Definir recuperación de contraseña → **regeneración desde backoffice**
- [x] Definir qué idiomas soporta v1 → **castellano, euskera, catalán, francés e inglés; ninguno RTL**
- [x] Confirmar si los idiomas implican operación multi-país → **no, son solo idiomas de interfaz; operación española**
- [x] Confirmar variante de inglés → **`en-GB`**
- [x] Definir si la justificación caduca → **ventana diaria: se justifica antes de terminar la jornada**
- [x] Traducción inicial de los catálogos placeholder a los cinco idiomas *(ANEXO sección 4)*
- [ ] Revisión de las traducciones al euskera por hablante nativo *(deja de ser urgente: la versión inicial cubre solo Granada y Almería)*
- [ ] Definir circuito de traducción del contenido creado tras el rollout
- [ ] Confirmar si hay comerciales en Canarias (huso único o no)
- [ ] Informar a la plantilla y su representación legal sobre la geolocalización (art. 90 LOPDGDD)
- [ ] Definir la hora de cierre de jornada
- [ ] Cerrar catálogo de categorías de incidencia/oportunidad con el cliente *(en curso)*
- [ ] Cerrar catálogo de motivos de no realización
- [ ] Definir política de retención de fotos (RGPD) *(pospuesta por negocio)*
### 🆕 Derivadas del boceto funcional

Ordenadas por lo que bloquean. Las cinco primeras conviene resolverlas antes de escribir código nuevo.

- [x] P19 — Checklist → **se conserva como capa de configuración de los flujos + sección opcional corta, nunca obligatoria** *(delegada)*
- [x] P20 — Vídeo → **720p · 60 s · MP4 H.264 · AAC 128 kbps · 25 MB**, captura nativa y normalización en servidor *(delegada)*
- [x] P24 — Modelo → **tabla por flujo**, no JSONB genérico *(delegada)*
- [x] P22 — Marcas → **sin catálogo definitivo aún; se arranca con placeholders** *(ANEXO §4)*
- [x] P23 — Cierre de acciones → **ambos, GPV y FSM. Sin caducidad: se marcan como estancadas**
- [x] P25 — Top Picos → **catálogo de referencias**, no texto libre
- [x] P21 — RSM → **sin acceso en esta versión; el rol no se implementa**
- [x] P26 — Código de nevera → **sí, todas lo llevan dentro; es un puente a la aplicación de neveras del FSM**
- [x] P27 — Canales → **se guarda `canal`, no se bifurca ningún flujo**
- [x] P28 — Ruta → **la visita se incorpora, conservando `planificada = false`**
- [x] P29 — Zonas → **solo Granada y Almería** *(cierra también P17: huso único)*
- [x] P30 — Duración de visita → **sin acción pendiente: se registra, no se muestra**
- [x] Navegación confirmada por el cliente: código **o nombre** → categorías → incidencias/oportunidades/extraespacios
- [ ] **P31 — Audio en los vídeos y grabación de voz de terceros** *(resolver antes de implementar vídeo)*
- [ ] **P32 — Origen y mantenimiento del catálogo de referencias de producto**
- [ ] Validar con el cliente la tabla de responsable de actuar por situación *(SPECS 5.4)*
- [ ] Confirmar si el resumen de cierre debe poder corregirse o es solo lectura

- [x] Aprobar stack técnico → **monorepo TypeScript: NestJS + 2 frontends React/Vite, PostgreSQL + Drizzle**
- [~] Proveedor de hosting → *decisión aplazada a propósito; el código solo conoce `DATABASE_URL` y `S3_*`*

## Fase 1 — Fundaciones técnicas

- [x] Estructura de proyecto y convenciones *(pnpm workspaces + Turborepo; ver [CONVENTIONS.md](CONVENTIONS.md))*
- [x] Repositorio git inicializado con `.gitattributes` y primer commit
- [x] Entorno de desarrollo *(docker-compose: Postgres + MinIO)*
- [ ] Entornos de staging y producción *(a la espera del proveedor)*
- [x] Esquema de base de datos *(15 tablas, catálogos configurables, JSONB traducible)*
- [x] Campos `id_externo` / `origen` / `sincronizado_en` en `Tienda` (preparación ERP)
- [x] Infraestructura de i18n: 5 locales, cadena de respaldo, negociación de idioma *(`@sw/shared/i18n`)*
- [x] Marcas de tiempo en UTC y conversión por zona *(`@sw/shared/jornada`, 8 tests en verde)*
- [x] Migraciones generadas y aplicadas *(15 tablas, 9 enums)*
- [x] Datos semilla idempotentes *(5 zonas, 14 categorías, 6 motivos, 2 checklists, 8 usuarios, 16 tiendas)*
- [x] Autenticación JWT y control de acceso por rol *(guards globales: throttle → jwt → cambio-password → roles)*
- [x] Invalidación de tokens al cambiar contraseña *(`password_cambiado_en`)*
- [x] Bloqueo por intentos fallidos + throttle por IP en login
- [x] Flag `requiere_cambio_password` y forzado real en toda la API, no solo en login
- [x] Almacenamiento de objetos con URLs firmadas *(subida directa desde el dispositivo, verificada en servidor)*
- [x] Mecanismo de retención y purga de fotos, con plazo configurable *(el plazo sigue sin decidir; el mecanismo ya funciona)*
- [x] CI: build, tipos y tests + job con Postgres real que valida migraciones y seed
- [ ] CD *(a la espera del proveedor)*
- [x] Registro de auditoría cableado en auth, visitas, incidencias, checklist y backoffice
- [ ] Backups automáticos de BD y ficheros

### 🆕 Modelo del ciclo detección → acción → resultado

- [x] Entidad **`Accion`** con ciclo de vida propio, colgada de la **tienda** y no de la visita
- [x] Entidad **`ComprobacionAccion`** como registro de eventos *(cada comprobación se añade; ninguna sobreescribe)*
- [x] Campos **`cerrada_por`** y **`cerrada_por_rol`** en `Accion`
- [x] **`estancada`** derivado de la antigüedad — **sin columna**, se calcula desde `detectada_en`
- [x] Detalles tipificados, **una tabla por flujo**: stock, fechas, huecos, Top Picos, facings, visibilidad, reorganización, extraespacios, neveras
- [x] Entidad **`RelacionResponsable`**, una por visita *(índice único sobre `visita_id`)*
- [x] Catálogo **`marcas`** — **sin `textoI18n`**: son nombres propios
- [x] Catálogo **`referencias_producto`** para los Top Picos
- [x] Campo **`canal`** en `Tienda` (Modern / Proximity) — solo dato, sin bifurcar flujos
- [x] Categorías de producto Dairy / Waters / PBB como enum del dominio
- [x] **Motor de reglas del responsable de actuar** en `@sw/shared`, con las reglas derivadas marcadas como tales *(33 tests)*
- [x] Campos `tipo` y `duracion_s` en evidencias, con enum foto/vídeo
- [x] Migración `0004` aplicada: 14 tablas y 16 enumeraciones nuevas
- [x] Datos semilla: **Granada y Almería**, 12 tiendas con códigos `350…` y canal, 11 marcas, 15 referencias
- [x] `db:verify` amplía sus invariantes al ciclo de acciones
- [x] `db:acciones` ejercita los nueve flujos contra la base de datos real
- [ ] Importación CSV de referencias de producto *(el catálogo se siembra; falta la carga masiva)*
- [x] Renombrada la tabla `fotos` a **`evidencias`**, con migración escrita a mano *(`ALTER ... RENAME`, no `DROP`+`CREATE`)*
- [x] Límites **por tipo**: 5 MB la foto, 25 MB el vídeo, 60 s de duración máxima
- [x] La URL de subida de vídeo dura **45 minutos** frente a los 15 de una foto
- [x] **Normalización a 720p H.264/AAC** con ffmpeg, en cola y no en la petición
- [x] Sin ffmpeg, el vídeo se conserva **servible y sin normalizar**: nunca se pierde el original
- [x] `api:video` verifica el ciclo entero sondeando el fichero almacenado con ffprobe
- [ ] Traducir a los cinco idiomas las etiquetas de las opciones de los flujos *(son enums en base de datos; sus etiquetas van en los ficheros de idioma del cliente, no en el seed)*

### 🆕 Hallazgos del modelado

- [x] **El FSM gestiona dos provincias y el modelo admite una zona por usuario** → **fusionadas en una sola zona `gra-alm`**. Una zona es el territorio de un FSM, no una división administrativa; con esa definición el desajuste desaparece sin tabla de unión ni alcance multi-zona. La provincia se segmenta por localidad o código postal
- [ ] **Al reducirse la operación a dos provincias andaluzas, el euskera y el catalán se quedan sin hablantes en esta versión.** La infraestructura de cinco idiomas sigue siendo correcta y la operación puede crecer, pero **la revisión nativa del euskera deja de ser urgente** para el arranque *(reordena una tarea de fase 0)*

## Fase 2 — API backend

- [x] Endpoints de autenticación (login, bloqueo por intentos, cambio forzado)
- [x] CRUD de tiendas + importación CSV *(tolerante a filas malas, con motivo y línea)*
- [x] CRUD de usuarios/comerciales + regeneración de contraseña
- [x] CRUD de plantillas de checklist e ítems (con textos traducibles)
- [x] CRUD de catálogos + estado de traducciones faltantes
- [x] Planificación de rutas diarias, que crea también las visitas
- [x] Endpoints de visita: vista del día, crear no planificada, comenzar, finalizar
- [x] Justificación con **ventana validada contra la hora de captura en dispositivo**
- [x] Cierre de jornada por zona horaria, materializando las rutas nunca abiertas
- [x] Endpoints de resultados de checklist *(con requisito de foto verificado en servidor)*
- [x] Endpoints de incidencias/oportunidades *(alta en campo + bandeja de backoffice por zona)*
- [x] Subida y asociación de fotografías
- [x] Endpoint de sincronización por lotes, con clave de idempotencia por operación
- [x] Endpoints de consulta agregada para dashboard e informes
- [x] Exportación CSV *(compatible con Excel; PDF pendiente)*
- [x] Negociación de idioma en la API (`Accept-Language` / preferencia de usuario)

### 🆕 API del ciclo de acciones

- [x] Endpoint de registro por flujo *(`POST /visitas/:id/acciones`)*, unión discriminada por `tipoSituacion` y **responsable derivado en servidor**
- [x] Validación cruzada que **rechaza lo imposible**: fechas fuera de Dairy, «el reponedor no ha pasado» en Waters/PBB, «lo corregí yo» en Dairy, nevera a retirar sin código, «otro» sin detallar
- [x] Endpoint de **acciones abiertas de una tienda** *(`GET /tiendas/:id/acciones`)*, con días abierta y estancada calculados
- [x] Endpoint de **comprobación** *(`POST /acciones/:id/comprobaciones`)*, que acumula historial y cierra si el desenlace lo indica
- [x] Historial completo de una acción *(`GET /acciones/:id/comprobaciones`)*
- [x] Cierre **desde ambos lados**, registrando `cerrada_por` y `cerrada_por_rol`
- [x] Marcado de acciones **estancadas** por antigüedad, sin cerrarlas *(`ACCION_ESTANCADA_DIAS`)*
- [x] Endpoint de **Top Picos pendientes** por tienda, que marca `incorporada` al resolverse
- [x] Endpoint de **relación con el responsable** *(`PUT /visitas/:id/responsable`)*, una por visita y corregible
- [x] Endpoint de **resumen de visita** *(`GET /visitas/:id/resumen`)*, que avisa sin bloquear
- [x] Bandeja de **acciones pendientes del FSM** *(`GET /acciones`)*, lo más antiguo primero, acotada a su zona
- [x] Idempotencia offline por `idCliente` en acciones y comprobaciones
- [x] `api:acciones` ejercita los endpoints contra el servidor en marcha *(30 comprobaciones)*
- [x] Búsqueda de tienda **por código `350…` y por nombre al mismo nivel**, acotada al alcance del GPV
- [x] La visita fuera de ruta **se incorpora a la ruta del día conservando `planificada = false`**, sin duplicarse en la vista
- [x] Cierre de visita **sin mínimos obligatorios**: `incompleta` deja de marcarse
- [x] **Aviso al FSM cuando un GPV cierra una acción que le estaba asignada**, con filtro para verlas
- [x] `api:visitas` verifica los cinco cambios de un tirón

### 🆕 Hallazgo: no existe la asignación tienda–GPV

- [ ] **El boceto dice que se busca «entre las tiendas asignadas al GPV», y el modelo no tiene esa asignación.** Lo más parecido que expresa es la zona, que es por lo que se acota hoy. Con una sola zona eso no filtra nada en la práctica. Hace falta decidir si la asignación individual llega a existir —una tabla `gpv_tiendas`— o si el rutero diario es asignación suficiente
- [x] Agregados de resultado: facings por GPV/tienda/categoría/marca/mes, Top Picos incorporados, embudo detectado → trabajado → solucionado
- [x] Agregados de patrón: incidencias de stock repetidas, tiendas con problemas recurrentes, acciones abiertas demasiado tiempo
- [x] Las once preguntas del dashboard *(`GET /resultados` y siete endpoints de detalle)*
- [x] Detección y resultado por GPV **en la misma fila**, para no crear un incentivo torcido
- [x] `db:pruebas` genera acciones, comprobaciones y relación con el responsable, con gradiente de antigüedad
- [x] `api:resultados` contrasta cada agregado con SQL independiente *(40 comprobaciones)*
- [x] Subida, confirmación y **normalización de vídeo** a 720p MP4
- [x] **Retirada la duración de visita** de respuestas, informes y exportaciones. El dato se sigue registrando, pero no sale
- [x] Incluir los flujos nuevos en el endpoint de sincronización por lotes

## Fase 3 — App del comercial (PWA) — MVP

- [x] Esqueleto PWA: manifest, service worker, instalable
- [x] Traducciones de interfaz en 5 idiomas y selector, disponible ya en login
- [x] Componentes tolerantes a expansión de texto *(verificado con euskera real)*
- [x] Pantalla de login + cambio de contraseña forzado
- [x] Vista del día con cards y resumen de progreso
- [x] Buscador de tiendas y "Añadir visita"
- [x] Detalle de visita: cabecera y los cuatro estados
- [x] Comenzar visita (hora + geolocalización, con aviso de desviación)
- [x] Finalizar visita (hora + geolocalización, marca incompleta)
- [x] Flujo "No he podido visitarla": motivo + comentario
- [x] Aviso de cierre de jornada con una hora de antelación
- [x] Modo solo lectura en visita finalizada y en no realizada
- [x] Sección checklist con ítems que exigen foto
- [x] Formulario de incidencias/oportunidades con categorías del catálogo
- [x] Captura de fotos desde cámara con metadatos de fecha y ubicación
- [x] Compresión y redimensionado en dispositivo *(4 MB → 267 KB)*
- [x] Notas libres
- [x] Contexto de la visita anterior, con incidencias abiertas de la tienda
- [x] Caché local de ruta y catálogos, con precarga de la jornada al entrar
- [x] Cola de sincronización con reintentos e idempotencia por `opId`
- [x] Indicador visible de "pendiente de sincronizar" / "sincronizado"

### 🆕 Rehacer la pantalla de visita

> **Desbloqueada.** El checklist se conserva como capa de configuración y como sección opcional corta, así que los flujos nuevos no sustituyen la maquinaria: se apoyan en ella.

- [x] Inicio de visita **por código o por nombre**, con confirmación visual antes de iniciar
- [x] Pantalla principal con las **tres categorías** (Dairy / Waters / PBB) + **responsable de tienda** transversal
- [x] Menú por categoría: **Incidencias · Oportunidades · Extraespacios**
- [x] Los nueve flujos, con validación en cliente que replica la del servidor
- [x] La disponibilidad por categoría sale de `situacionDisponible` de `@sw/shared`: la **misma función** que valida el servidor, no una lista paralela
- [x] **Acciones pendientes de visitas anteriores**, plegadas cuando son muchas para no enterrar las categorías
- [x] Sección de **responsable de tienda**, con la aclaración *«la relación en general, no la conversación de hoy»* visible bajo la pregunta
- [x] **Resumen de visita** antes de cerrar, con extraespacios en su propio bloque
- [x] Cierre **sin mínimos obligatorios**: el resumen avisa, no bloquea
- [x] Aviso de a quién irá lo registrado, calculado con el motor de reglas real
- [x] Traducción de los flujos a los **cinco idiomas** *(verificado en euskera a 360 px: sin desbordes)*
- [x] Los flujos nuevos viajan por la **cola offline** *(`accion.registrar`, `accion.comprobar`, `relacion.guardar`)*
- [x] Los avisos del resumen viajan como **códigos**, no como frases: una frase del servidor saldría en castellano para quien tiene la interfaz en otro idioma
- [x] Captura de **vídeo** con cámara nativa, validando duración y tamaño en el dispositivo, con aviso de que graba sonido
- [ ] **Resultados propios del GPV visibles para él** — facings ganados, Top Picos incorporados *(«la idea es que los GPVs generen más oportunidades»)*
- [x] Captura de **evidencia** en los flujos que la admiten, como segundo paso opcional tras registrar
- [x] Ámbito **`accion`** en evidencias: la foto cuelga de lo que documenta, no de la visita en general
- [x] Checklist como **sección opcional, apagada por defecto** (`CHECKLIST_ACTIVO`) y nunca obligatoria para cerrar
- [x] **Retirado el registro genérico de incidencias de la app de campo** *(`ContextoAnterior` y `SeccionIncidencias`)*: duplicaban lo que ya muestran las acciones
- [ ] Probar el recorrido completo **sin cobertura**, no solo con red

### 🆕 Especificación v2 del cliente (2026-08-31)

> Ajuste sobre los nueve flujos ya construidos, no un reencuadre — ver [ANEXO.md](ANEXO.md) ronda 6 y [SPECS.md](SPECS.md) v0.7. La más importante de las peticiones del cliente (guardado automático de incidencias/oportunidades por PDV con seguimiento) **ya está construida** desde la fase 1-2; no genera tarea nueva, solo hay que enchufar los flujos de abajo al mismo mecanismo.

- [x] Quitar el aviso de **desviación de geolocalización** de la vista del GPV — sigue calculándose en servidor, deja de mostrarse en `DetalleVisita.tsx`
- [ ] Auditar **todos** los flujos existentes contra la regla de preguntas sin redundancia (SPECS §5.5), no solo los que cambian en esta ronda
- [x] Renombrar "Top Pico" → **"Top Picos"** en las etiquetas de interfaz de los cinco idiomas (field) y castellano (backoffice); el identificador interno `top_pico` no cambia
- [x] El buscador de Top Picos ahora permite **añadir varias referencias en una sola pantalla** sin volver atrás (`SeleccionMultiple`, una `Acción` por referencia)
- [x] **Foto obligatoria** en falta de producto de Waters/PBB (`evidenciaObligatoria()` en cliente, bloquea "Terminar" sin foto); retirada la columna y la pregunta "¿se ha comunicado al responsable?"
- [x] Renombrado y rehecho **"Reorganizar lineal" → "Nueva implantación"**: selección múltiple de marca de catálogo + "Todo el lineal", tabla `nueva_implantacion_marcas` nueva
- [x] Nuevo flujo **"Bloque de marca"** (solo Waters/PBB): pregunta única, sin tabla de detalle propia
- [x] Rehecho el flujo de **Nevera** (Dairy/Waters): árbol binario existe → mantener/recoger → código + foto obligatoria si se recoge; si no existe, oportunidad de añadir. Desacoplada de `extraespacios`, cuelga directo de `acciones`
- [x] Disponibilidad de flujos por categoría en `situacionDisponible` de `@sw/shared`: bloque de marca (Waters/PBB, no Dairy), nevera (Dairy/Waters, no PBB) — con tests
- [ ] Importación CSV del **listado de referencias de Danone por categoría** — pendiente de que el cliente lo envíe (P32 sigue abierta, sin bloquear el resto)

**Feedback del primer despliegue (2026-08-31)** — ver ANEXO.md:

- [x] Foto obligatoria capturada y subida **antes** de guardar, no en una segunda pantalla tras guardar — corrige que "volver atrás" en esa segunda pantalla dejaba la incidencia registrada sin foto
- [x] `DELETE /acciones/:id`: el GPV puede borrar un misclick, solo mientras la visita que lo originó sigue `en_curso` — borrado real, no un estado "descartada"
- [x] `GET /visitas/:id/acciones` + sección "Registrado en esta visita" en la app de campo, con confirmación antes de borrar
- [ ] Hueco conocido, sin resolver: la foto obligatoria capturada no se sube si el registro de la acción se encola sin cobertura (mismo límite que el vídeo)
- [x] `index.html` sin caché en los dos frontends (`no-cache, no-store, must-revalidate`) — nginx no mandaba ninguna cabecera, causa real de que un fix ya desplegado tardara en verse
- [x] `registerType: "prompt"` con banner propio en vez de `autoUpdate` silencioso — evita perder una detección sin guardar por una recarga a mitad de formulario
- [x] ~~`DELETE /visitas/:id`~~ — revertido el 2026-09-01: el cliente pidió cancelar con motivo para las dos (planificada y no), no borrar. Ver ANEXO
- [x] `justificar` ya no rechaza las visitas no planificadas: mismo formulario (motivo + comentario) para las dos
- [x] `POST /visitas/cerrar-mi-jornada`: "Terminar mi jornada" sin esperar al cierre automático por hora — rechaza si queda cualquier visita pendiente, sea planificada o no
- [x] Evidencia SIEMPRE en el formulario, antes de guardar, para cualquier flujo que la admita — eliminada la pantalla de evidencia posterior a guardar que seguía existiendo para stock en Dairy, visibilidad y nueva implantación
- [ ] **Migración 0007 sin aplicar contra una base real** — este entorno no tenía Docker/Postgres disponible para ejecutar `pnpm db:migrate` ni los scripts `db:pruebas` / `db:acciones` / `api:acciones`. Todo el código pasa `typecheck` y los 62 tests de `@sw/shared`, pero la migración y los scripts de integración solo se han revisado estáticamente — hace falta correrlos una vez contra Postgres real antes de dar esta ronda por cerrada

**Añadidas tras la segunda pasada sobre la v2** (ver ANEXO.md, ronda 6):

- [x] Colapsado **hueco en Dairy** de dos preguntas a una sola combinada; `detecciones_hueco` pierde `cubierto_con_adyacente`
- [x] Añadida la exclusión de **Bledina** en SPECS §2; no hay ninguna referencia a Bledina en catálogos ni código
- [ ] Decidir cómo representar **"corregida en visita"** y **"no resuelta"** frente a los enums actuales (`estado_accion`, `desenlace_comprobacion`) — sin decidir todavía, ver SPECS §7.1
- [x] **Ya estaba decidido y no hacía falta abrirlo**: `grupoSituacion()` en `@sw/shared` ya trata incidencias/oportunidades/extraespacios como tres grupos deliberadamente separados, con su propio comentario explicando por qué no colapsar extraespacio en oportunidad. La nota de ANEXO/SPECS que lo daba por abierto se corrige
- [ ] Confirmar si el backoffice tiene (o hace falta construir) una **ficha de tienda** con histórico de acciones, más allá del listado plano filtrable

## Fase 4 — Backoffice — MVP

- [x] Login y navegación por rol
- [~] Interfaz multi-idioma *(navegación y comunes en los 5; paneles solo en castellano)*
- [x] Gestión de tiendas + importación CSV + indicador de origen del dato
- [x] Gestión de comerciales y regeneración de contraseñas
- [x] Editor de plantillas de checklist e ítems
- [x] Gestión de catálogos: categorías, motivos, tipos de tienda, zonas
- [x] Editor de traducciones con aviso de idiomas faltantes por elemento
- [x] Planificador de rutas con asignación manual
- [ ] Aviso al asignar ruta en festivo regional *(pendiente del calendario laboral)*
- [x] Dashboard del día: completadas vs. planificadas, activos, incidencias abiertas, no realizadas
- [x] Bandeja de justificaciones, distinguiendo justificadas de no justificadas
- [x] Detalle de visita en solo lectura — *sin duración; ver el punto por categoría más abajo*
- [x] Bandeja de incidencias con cambio de estado
- [x] Informes de cobertura, no realización y ejecución con filtros de periodo
- [x] Métrica de tasa de no realización con desglose por motivo
- [x] Exportación CSV desde el panel *(PDF sigue pendiente)*

### 🆕 Panel del FSM y dashboard de resultados

> El panel de acciones **sustituye** a la bandeja de incidencias, que se retira: el registro genérico de incidencias queda desautorizado por el reencuadre y nada lo alimenta ya.

- [x] **Panel de acciones pendientes**: antigüedad · situación · tienda · quién la detectó · responsable, ordenado de más antiguo a más reciente
- [x] Cambio de estado y cierre de acciones desde el panel
- [x] **Aviso cuando un GPV cierra una acción asignada al FSM**
- [x] Acciones **estancadas** destacadas y filtrables
- [x] **Código de nevera prominente y copiable**, con botón de copiar al portapapeles
- [x] **Historial desplegable** de cada acción: quién se pronunció, cuándo y qué dijo
- [x] El dashboard cuenta **acciones abiertas**, no incidencias muertas
- [x] Traducido a los cinco idiomas
- [x] Redactar el cierre de acciones de nevera como **«informado en la aplicación de neveras»**, no «nevera recogida»
- [x] Detalle de visita **organizado por categoría de producto**, con evidencias
- [x] **Retirada la duración de visita** del detalle y de los informes
- [x] Dashboard de resultados — las once preguntas de SPECS 6.4:
  - [x] Embudo detectadas → trabajadas → solucionadas, como barra apilada de una rampa secuencial *(es una progresión ordenada, no tres identidades)*
  - [x] **Facings ganados**, con desglose conmutable por GPV, tienda, categoría, marca y mes
  - [x] Top Picos incorporados y pendientes
  - [x] Faltas de stock repetidas y tiendas con más incidencias
  - [x] Acciones abiertas demasiado tiempo, sin filtro de periodo
  - [x] Detección y resultado **por GPV en la misma tabla**, con la razón escrita en la propia pantalla
  - [x] Cada bloque **declara su base temporal** y la pregunta 11 declara su lectura
  - [x] Vista de tabla del embudo, como alivio del aviso de contraste del paso más claro
  - [x] Traducido a los cinco idiomas
- [x] Histórico de la **relación con el responsable** por tienda
- [x] Reproducción de **vídeo** en el detalle
- [x] Gestión del catálogo de **marcas/segmentos** y de **referencias de producto**, con importación CSV
- [ ] Configuración de flujos por categoría, tipo de tienda y canal *(reutiliza el editor de plantillas)*
- [x] **Aviso en el editor al superar unos pocos ítems de checklist** — el guardarraíl contra el cuestionario
- [x] Segmentación de informes **por canal** (Modern / Proximity)

### 🆕 Reencuadre del backoffice — especificación FSM v2.0 (2026-09-03)

> Ver [ANEXO.md](ANEXO.md) ronda 7 y [SPECS.md](SPECS.md) v0.8 §6 para el detalle funcional completo. Nada de esto toca `apps/field` ni el modelo de `Visita`/`JustificacionNoRealizada` en base de datos — es una reorganización de qué pantallas ve el FSM en el backoffice y en qué se apoyan.

- [x] Construir la pantalla **Actividad** (`Actividad.tsx`, nueva ruta `/`): filtros GPV + periodo (hoy/semana/mes/personalizado), agrupada por tienda, con oportunidades + incidencias + acciones solucionadas del periodo — `GET /actividad`, nuevo en `AccionesService`
- [x] Construir la **ficha de tienda con histórico** (`FichaTienda.tsx` + `ConsultaTiendas.tsx`, SPECS §6.4): buscador por nombre, cabecera nombre+código+GPV responsable, dos zonas (acciones abiertas / histórico con filtro tipo + resultado), sin ubicación ni características generales — `GET /tiendas/:id` (ficha) y `GET /tiendas/:id/historico`, nuevos. **GPV responsable es derivado** (última visita a la tienda), no una asignación real — no existe esa tabla (ver hallazgo de fase 2)
- [x] **Retirado Rutas y Justificaciones de la navegación principal del backoffice** (`Marco.tsx`). Las rutas de React Router y los endpoints se conservan intactos, accesibles directamente, por si hace falta lógica interna de asignación
- [x] Sustituido `Dashboard.tsx` (completadas vs. planificadas, no realizadas) por `Actividad.tsx` — el fichero viejo se ha borrado, ya no queda código muerto
- [x] Verificado: el panel de **Acciones** ya tenía solo dos botones — SOLUCIONADA (`resolver`/`informado`) / NO SOLUCIONADA (`descartar`) — sin "mantener abierta". No hizo falta cambiar nada
- [x] Verificado: el ranking "PDV con más" de Resultados (patrones, pérdidas) ya no tenía filas clicables — nada que cambiar
- [x] Añadido **Comparar periodos** a Resultados: dos periodos libres, `GET /resultados/comparar` (nuevo en `ResultadosService`/`ResultadosController`), tabla con las nueve métricas mínimas de SPECS §6.5 y el cambio en puntos porcentuales para conversión/resolución
- [ ] Quitar el filtro planificada/no-planificada y la tasa de no-realización como métrica central de Informes (SPECS §6.6) — **revisado: ese filtro no existe literalmente en `Informes.tsx` hoy** (solo canal + fechas); lo pendiente es solo la decisión de nav de abajo
- [ ] Confirmar con el cliente si Rutas/Justificaciones deben desaparecer del todo o quedar accesibles como herramienta secundaria de administración (no bloquea: ya están fuera de la navegación principal)

## Fase 5 — Endurecimiento y piloto

- [ ] Pruebas de integración de la API
- [ ] Pruebas del flujo offline → sincronización (incluidas justificaciones)
- [ ] Pruebas de i18n en los bordes: informes, exportaciones, emails, formatos de fecha
- [ ] Revisión visual de la app de campo en los cinco idiomas (desbordamiento de texto)
- [ ] Prueba clave: justificar sin cobertura cerca del cierre y sincronizar después — debe aceptarse
- [ ] Pruebas en móviles de gama media y red lenta
- [ ] Revisión de seguridad (hashing, tokens, permisos por rol, contraseñas temporales)
- [ ] Revisión RGPD y aviso a tiendas si aplica
- [ ] Documentación de uso para el comercial
- [ ] Comunicación interna del lanzamiento
- [ ] **Piloto con 5–10 comerciales durante 2–4 semanas**
- [ ] Revisar distribución de motivos de no realización y ajustar catálogo
- [ ] Recoger feedback y corregir antes de escalar

### 🆕 Validaciones propias del reencuadre

- [ ] **Medir el tiempo real de una visita sin incidencias.** Es la prueba de fuego del boceto: si registrar «todo correcto» en las tres categorías es lento, la aplicación se convirtió en el cuestionario que quería evitar
- [ ] Comprobar que el **seguimiento entre visitas** funciona de extremo a extremo: detectar, volver, comprobar, cerrar
- [ ] Verificar que el **responsable derivado** acierta en la realidad de las tiendas del piloto
- [ ] Revisar si el volumen de acciones abiertas hace legible el panel del FSM o lo satura
- [ ] Contrastar los **facings declarados** con una revisión sobre el terreno
- [ ] Medir el volumen real de **vídeo** por visita y su efecto en la cola offline
- [ ] Preguntar explícitamente a los GPVs si el seguimiento se percibe como ayuda o como reproche

## Fase 6 — Rollout v1

- [ ] Carga del catálogo completo de tiendas **con códigos `350…` y canal**
- [ ] Catálogos definitivos de categorías y motivos, sustituyendo placeholders
- [ ] 🆕 Catálogo definitivo de **marcas/segmentos**
- [ ] 🆕 Alta de la estructura real: zonas (Granada, Almería), FSMs, GPVs y su reparto por canal
- [ ] 🆕 Carga del catálogo definitivo de **referencias de producto** *(depende de P32)*
- [ ] Traducciones completas revisadas
- [ ] Alta de todos los comerciales y zonas
- [ ] Formación a supervisores
- [ ] Despliegue a producción
- [ ] Monitorización activa las primeras semanas

---

## Fase 7 — Post-MVP

- [ ] 🆕 **Requisitos mínimos para cerrar una visita** *(el cliente los aplazó explícitamente del MVP, no los descartó)*
- [ ] 🆕 **Tiempo de permanencia como métrica** — solo si el cliente llega a pedirlo, y entonces con revisión legal previa (art. 90 LOPDGDD)
- [ ] 🆕 Extender el seguimiento al resto de tipos de acción *(el cliente lo plantea como incorporación progresiva)*
- [ ] 🆕 Alertas al FSM por acciones que superan un umbral de antigüedad
- [ ] 🆕 Detección automática de tiendas con incidencias recurrentes
- [ ] Notificaciones push completas (comercial y supervisor)
- [ ] Informes automáticos semanales por email, en el idioma del destinatario
- [ ] Dashboard avanzado con gráficas
- [ ] Marca de agua de fecha/hora/geolocalización en fotos
- [ ] Alertas de desviación entre geolocalización y ubicación de la tienda
- [ ] Vista de histórico propio para el comercial (palanca de adopción)

## Fase 8 — Futuro (según necesidad)

- [ ] **Integración con ERP** para el catálogo de tiendas
- [ ] App nativa (React Native/Flutter) si la PWA se queda corta
- [ ] Optimización automática de rutas
- [ ] Firma digital del encargado
