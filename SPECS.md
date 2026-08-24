# SPECS.md — App de Registro de Visitas Comerciales

**Versión:** 0.4
**Fecha:** 2026-08-24
**Cliente:** DANONE
**Estado:** Preguntas de negocio resueltas salvo retención de fotos y catálogos definitivos. Listo para pasar a diseño técnico.

**Cambios respecto a v0.3:** los cinco idiomas son **solo de interfaz** — no hay operación multi-país, lo que reduce el alcance de husos horarios y deja una única jurisdicción (España). Inglés fijado en `en-GB`. La justificación de una visita no realizada tiene **ventana diaria**: se hace antes de terminar la jornada.

**Cambios respecto a v0.2:** se cierra el set de idiomas — castellano, euskera, catalán, francés e inglés. Ninguno es RTL, así que el maquetado no cambia.

**Cambios respecto a v0.1:** multi-idioma pasa a estar dentro del MVP; nuevo estado de visita `No realizada` con justificación obligatoria; catálogo de tiendas manual pero preparado para ERP; catálogo de categorías configurable; franja horaria descartada; recuperación de contraseña desde backoffice. Ver el registro de decisiones en [ANEXO.md](ANEXO.md).

---

## 1. Resumen y objetivo

Aplicación para que los representantes comerciales de la empresa registren su actividad diaria en las tiendas objetivo (visitas planificadas y no planificadas), completando checklists operativos, reportando incidencias u oportunidades, y documentando la visita con fotografías. Un segundo componente (backoffice web) permite a supervisores y dirección consultar esa información en tiempo real y generar informes.

**Objetivo de negocio:** tener visibilidad y trazabilidad de la actividad comercial en punto de venta, estandarizar lo que cada comercial debe hacer en cada visita, y detectar incidencias/oportunidades de forma ágil.

## 2. Alcance

**Incluido en la v1 (MVP):**

- App para comerciales (login, ruta del día, visitas, checklist, incidencias, fotos).
- Backoffice web para gestión de tiendas, comerciales, rutas, categorías, y consulta/exportación de informes.
- Sincronización offline básica.
- **Multi-idioma**, tanto de interfaz como de contenido configurable (checklists, categorías, tipos de tienda).
- Justificación de visitas planificadas no realizadas.

**Fuera de alcance en v1** (se documentan como fases futuras en la sección 10):

- **Integración con ERP** para el catálogo de tiendas. En v1 el catálogo se gestiona manualmente desde el backoffice, pero el modelo de datos se diseña desde ya para admitir la sincronización posterior (ver sección 7).
- Optimización automática de rutas (routing).
- Firma digital del encargado.
- App nativa (se recomienda empezar con web responsive/PWA, ver sección 4).
- Portal con login propio para encargados de tienda.

## 3. Actores y roles

| Rol | Descripción | Acceso |
|---|---|---|
| **Comercial / Representante** | Usuario de campo que visita tiendas | App móvil (login con nº de trabajador + contraseña) |
| **Supervisor de zona** | Gestiona un grupo de comerciales, revisa su actividad y sus justificaciones | Backoffice web (lectura de su equipo/zona + gestión de incidencias) |
| **Administrador** | Gestiona catálogo de tiendas, usuarios, checklists, categorías, traducciones e informes globales | Backoffice web (acceso total) |
| **Encargado de tienda** | Interlocutor del comercial durante la visita. **No es usuario del sistema** y no tiene login en v1. | Sin acceso |

> **Decidido:** el encargado de tienda no tendrá acceso propio. Es el interlocutor del comercial en la visita, no un usuario del sistema. El "front desde el que recibir la información" es el **backoffice para supervisores y administradores**. Un eventual portal para encargados queda en fase 3 (sección 10).

## 4. Arquitectura y plataforma recomendadas

**Recomendación: Progressive Web App (PWA) con enfoque offline-first**, en lugar de apps nativas separadas para iOS/Android.

Motivos:
- Un solo código para todos los dispositivos, actualizaciones instantáneas (sin esperar revisión de App Store/Google Play), menor coste de mantenimiento.
- Se puede "instalar" en el móvil del comercial como un icono más, con acceso a cámara y geolocalización (suficiente para este caso de uso).
- Permite trabajar sin conexión y sincronizar después (ver más abajo), que es clave dado que las tiendas objetivo suelen tener cobertura irregular (sótanos, centros comerciales, zonas rurales).

Cuándo pasarse a nativo: si en el futuro necesitas notificaciones push muy fiables, acceso más profundo al hardware, o el equipo crece mucho y el rendimiento offline de la PWA no es suficiente, se puede migrar la app de comerciales a React Native/Flutter reutilizando gran parte de la lógica y el backend.

**Componentes del sistema:**

1. **App comercial (frontend field):** PWA responsive, offline-first, con cola de sincronización local (IndexedDB) que envía los cambios al backend cuando hay conexión.
2. **Backoffice (frontend admin/supervisión):** aplicación web estándar (no necesita ser offline).
3. **Backend / API:** API REST o GraphQL centralizada que sirve a ambos frontends, con autenticación por token (JWT).
4. **Base de datos:** relacional (PostgreSQL recomendado) por la naturaleza estructurada de tiendas/visitas/checklist/incidencias.
5. **Almacenamiento de ficheros:** servicio de almacenamiento de objetos (tipo S3) para las fotografías, con URLs firmadas.
6. **Notificaciones:** push notifications (vía service worker en la PWA) para avisos al comercial y a los supervisores.

### Modo offline (requisito, no opcional)

Dado que la fiabilidad de conexión en tienda es incierta, la app comercial debe:
- Cargar la ruta del día, el catálogo de tiendas y **los textos del idioma activo** al iniciar sesión (caché local).
- Permitir completar checklist, incidencias y fotos sin conexión.
- Guardar todo en una cola local y sincronizar automáticamente en segundo plano al recuperar señal, con reintentos.
- Mostrar al comercial un indicador claro de "pendiente de sincronizar" / "sincronizado", para que sepa que su trabajo no se ha perdido.
- Resolver conflictos de forma simple: la visita pertenece a un único comercial, así que no debería haber conflictos de edición concurrente sobre la misma visita.

### Internacionalización

**Idiomas soportados en v1 (5):**

| Idioma | Código | Notas |
|---|---|---|
| Castellano | `es` | Idioma por defecto y último *fallback* del sistema |
| Euskera | `eu` | Co-oficial; expansión de texto notable respecto al castellano |
| Catalán | `ca` | Co-oficial |
| Francés | `fr` | Expansión de texto ~15–20% |
| Inglés | `en-GB` | Formatos de fecha `DD/MM/YYYY` y convenciones europeas de número |

**Los cinco son idiomas de interfaz, no países de operación.** La operación es exclusivamente española: francés e inglés existen para usuarios que los prefieren, no porque haya comerciales de campo fuera de España. Esto mantiene una jurisdicción única y un único calendario nacional (con festivos autonómicos y locales, que sí difieren).

Ninguno es RTL, así que el maquetado no requiere versión espejada. La consecuencia real no es de dirección sino de **longitud**: euskera y francés producen cadenas sensiblemente más largas que el castellano, y la interfaz de campo está llena de botones y cards en pantalla de móvil. Los componentes deben diseñarse para texto variable, y la revisión visual en los cinco idiomas es parte del alcance, no un remate.

Al ser multi-idioma desde el MVP, hay dos capas distintas que no conviene mezclar:

- **Textos de interfaz** (botones, etiquetas, mensajes de error): ficheros de traducción versionados con la aplicación. Se cachean junto al resto del bundle de la PWA.
- **Contenido configurable** (ítems de checklist, categorías de incidencia, tipos de tienda, nombres de zona): lo introduce el administrador desde el backoffice y viaja como dato, no como código. Requiere soporte en el modelo (sección 7) y un editor de traducciones en el backoffice (sección 6.1).

**Resolución de idioma y *fallback*:** el idioma se toma de la preferencia del usuario. Cuando falta una traducción se aplica una cadena de respaldo, nunca cadena vacía ni la clave técnica:

```
eu → es → (nada)
ca → es
fr → en → es
en → es
```

El respaldo de euskera y catalán es el castellano porque el comercial que los usa lo entiende. Para francés se respalda antes en inglés que en castellano por la misma razón.

**Caché offline por idioma:** se descarga el idioma preferido del usuario. Cambiar de idioma sin conexión solo funciona si ese idioma ya estaba descargado; la interfaz debe advertirlo en vez de fallar en silencio.

### Husos horarios y calendario laboral

Al ser operación exclusivamente española, esto es más simple de lo que el set de idiomas sugería:

- **Husos:** la Península comparte huso. Solo hay un segundo huso si existen comerciales en **Canarias** (una hora menos), lo que está pendiente de confirmar. En todo caso las marcas de tiempo se almacenan en **UTC** y se presentan en la zona del usuario — no cuesta nada y evita el problema de forma permanente. El proceso de cierre de jornada se ejecuta por zona, no una sola vez global.
- **Los festivos sí son regionales, y esto sigue importando.** Dentro de España los festivos autonómicos y locales difieren mucho, y con País Vasco y Cataluña entre las zonas de operación el problema es real. Si se planifica ruta en un festivo local, las tiendas están cerradas y el sistema genera una avalancha de visitas no realizadas que ensucia las métricas de cobertura. El planificador de rutas debería conocer el calendario laboral de la zona, o como mínimo avisar al supervisor al asignar ruta en un festivo.

## 5. Módulo 1 — App del comercial

### 5.1 Login

- Autenticación con **número de trabajador + contraseña**.
- Token de sesión persistente (para no requerir login constante en campo).
- Bloqueo temporal tras varios intentos fallidos (protección básica).
- **Recuperación de contraseña:** no hay auto-servicio por email. El administrador o el supervisor **regenera la contraseña desde el backoffice** y se la comunica al comercial. La contraseña regenerada debe ser temporal y forzar cambio en el siguiente inicio de sesión.
- Selector de idioma disponible desde la propia pantalla de login (antes de tener sesión).

### 5.2 Vista del día

Pantalla principal tras el login. Muestra:

- Listado de tiendas asignadas para la fecha actual (ruta planificada), en forma de **cards**.
- Cada card muestra: nombre de la tienda, número de referencia, dirección/zona, y **estado de la visita**: `Pendiente` / `En curso` / `Finalizada` / `No realizada`.
- **No hay franja horaria obligatoria.** El orden de la ruta es orientativo y el comercial organiza su día como quiera; solo importa que las visitas se realicen dentro de la jornada. La ruta puede llevar un orden sugerido, pero no se valida ni se penaliza el incumplimiento del orden.
- Resumen rápido arriba (ej. "3 de 6 visitas completadas hoy").
- Botón **"Añadir visita"** siempre visible, para registrar visitas no planificadas (extras) fuera de la ruta del día.

### 5.3 Botón "Añadir visita"

- Al pulsar, despliega un buscador con lista de tiendas del catálogo general, mostrando **nombre + número de referencia** (búsqueda por nombre o por referencia).
- Al seleccionar una tienda, se crea una nueva visita para el día actual y aparece como una card más en la vista del día, con una etiqueta discreta **"no planificada"**, para que el backoffice pueda diferenciar cobertura planificada de oportunista.

### 5.4 Detalle de la visita

Al pulsar sobre una card se accede al detalle, con:

**Cabecera:** datos de la tienda (nombre, referencia, dirección) y estado actual.

**Botón de acción según estado:**
- Si `Pendiente` → botón **"Comenzar visita"** (registra hora de inicio y geolocalización del check-in).
- Si `En curso` → botón **"Finalizar visita"** (registra hora de fin y geolocalización). Si quedan ítems obligatorios del checklist sin completar, se avisa pero **no se bloquea** el cierre: la visita queda marcada como *incompleta*.
- Si `Finalizada` → se sustituye el botón por la leyenda **"FINALIZADA"** y la vista pasa a modo solo-lectura (no se pueden editar checklist/incidencias/fotos ya enviadas, para preservar la integridad del registro).
- Si `Pendiente` y se acerca el cierre de jornada → botón secundario **"No he podido visitarla"**, que abre el flujo de justificación (sección 5.5).

**Secciones dentro del detalle:**

1. **Checklist** — lista de tareas estándar que todo comercial debe realizar en la visita (ej. "Hablar con el encargado", "Fotografiar el lineal", "Revisar stock de producto X", "Comprobar precio en tienda"). Cada ítem se marca como completado; los que requieren foto obligan a adjuntarla antes de poder marcarse. El checklist es **configurable desde el backoffice** (no fijo en el código), **asignable por tipo de tienda**, y sus textos son **traducibles**.

2. **Incidencias / Oportunidades** — formulario para reportar eventos durante la visita: tipo (`Incidencia` / `Oportunidad`), categoría (tomada de un catálogo configurable, ver sección 6.1), descripción libre, prioridad, y fotos adjuntas. Se pueden añadir varias por visita.

3. **Fotografías** — captura directa desde cámara (no solo subida de galería, para garantizar que la foto es del momento de la visita), con metadatos automáticos de fecha/hora y geolocalización. Las fotos deben poder asociarse tanto a ítems del checklist como a incidencias, o quedar como fotos generales de la visita.

4. **Notas libres** — campo de texto para observaciones que no encajan en checklist ni incidencias.

5. **Contexto de la visita anterior** — resumen de la última visita a esa tienda (incidencias abiertas, notas previas), para dar continuidad y evitar repetir incidencias ya conocidas sin seguimiento.

### 5.5 Visitas planificadas no realizadas

Si al final de la jornada una visita planificada sigue en estado `Pendiente`, **no se reprograma automáticamente**: pasa a estado **`No realizada`** y **requiere justificación obligatoria** del comercial.

- El comercial puede justificarla en cualquier momento del día con el botón "No he podido visitarla", o al cierre de jornada mediante un aviso.
- La justificación consta de: **motivo** (de un catálogo cerrado y configurable — ej. tienda cerrada, falta de tiempo, incidencia de transporte, cita cancelada por el encargado, otro) y **comentario libre** obligatorio cuando el motivo es "otro".
- La visita `No realizada` es visible para el supervisor en su bandeja (sección 6.2) y computa en los informes de cobertura como planificada-no-cubierta.
- Una visita `No realizada` es inmutable igual que una finalizada: la justificación no se puede editar a posteriori.

**Ventana de justificación — el mismo día.** La justificación se hace **cada día, antes de terminar la jornada**. No se puede justificar el viernes una visita del martes. Consecuencias:

- Hay dos desenlaces distintos para una visita no realizada: **justificada** y **no justificada**. La segunda ocurre cuando el comercial deja pasar la ventana, es un estado terminal, y el backoffice debe distinguirla visualmente de la primera — no es lo mismo "no fui porque la tienda estaba cerrada" que "no fui y no dije por qué".
- El aviso de cierre de jornada debe llegar **con antelación suficiente**, no en el último minuto. Un recordatorio a las 19:55 para justificar seis visitas empuja a elegir el primer motivo del desplegable, que es exactamente lo que destruye el valor del dato.

> ⚠️ **Requisito crítico de implementación:** la ventana debe validarse contra la **marca de tiempo de captura en el dispositivo**, nunca contra la hora de llegada al servidor. El comercial puede justificar a las 19:55 sin cobertura y que la cola no sincronice hasta las 21:30; rechazar esa justificación por ventana cerrada sería castigarle por el problema de red que el modo offline existe precisamente para resolver. La operación encolada lleva su propio *timestamp* y ese es el que manda.

> **Pendiente de definir:** el catálogo concreto de motivos (propuesta traducida en [ANEXO.md](ANEXO.md) sección 4) y la hora exacta de cierre de jornada.

## 6. Módulo 2 — Backoffice (panel de gestión)

Aplicación web para supervisores y administradores.

### 6.1 Gestión maestra

- **Tiendas:** alta/baja/edición, número de referencia, dirección, geolocalización, zona/región, tipo de tienda (para checklist específico). En v1 la gestión es **manual**; el modelo incluye ya los campos necesarios para una futura sincronización con ERP (`id_externo`, `origen`, `sincronizado_en`) y el backoffice debe marcar visualmente el origen de cada ficha. Se incluye **importación por CSV** como paso intermedio antes de la integración real.
- **Usuarios/comerciales:** alta/baja, asignación de zona, nº de trabajador, **regeneración de contraseña** (genera una temporal que fuerza cambio en el siguiente login), idioma preferido.
- **Checklists:** creación y edición de plantillas de checklist, asignables por tipo de tienda o globalmente, con textos traducibles.
- **Categorías de incidencia/oportunidad:** catálogo configurable (no fijo en código), con tipo asociado (incidencia u oportunidad), prioridad por defecto y textos traducibles. El catálogo definitivo está pendiente de cerrar con el cliente, por lo que la pantalla de gestión es un requisito, no un lujo.
- **Motivos de no realización:** catálogo configurable de motivos para justificar visitas no realizadas.
- **Rutas/planificación:** asignar qué tiendas debe visitar cada comercial cada día (manual en v1; posible optimización automática en fases futuras). Sin franjas horarias.
- **Traducciones:** editor para mantener las versiones idiomáticas del contenido configurable, con indicación visible de qué traducciones faltan.

### 6.2 Supervisión en tiempo real

- Dashboard con estado del día: visitas completadas vs. planificadas, comerciales activos, incidencias abiertas, **visitas no realizadas pendientes de justificar**.
- Vista de detalle de cualquier visita (igual información que ve el comercial: checklist, fotos, incidencias, horarios, duración).
- **Bandeja de justificaciones:** listado de visitas `No realizada`, separando visualmente las **justificadas** (con su motivo) de las **no justificadas** (el comercial dejó pasar la ventana diaria). Permite marcar la justificación como aceptada o cuestionada.
- Gestión de incidencias: poder marcarlas como revisadas/resueltas, asignarlas a alguien, y notificar automáticamente cuando se reporta una incidencia crítica.

### 6.3 Informes y reportes

- Filtros por fecha, comercial, zona, tienda, tipo de incidencia, planificada/no planificada.
- Métricas clave: nº de visitas realizadas vs. planificadas, **tasa de no realización y desglose por motivo**, tasa de cumplimiento de checklist, duración media de visita, incidencias por tipo/tienda/periodo, ranking de cobertura por zona.
- Exportación a PDF/Excel, respetando el idioma seleccionado.
- Informes automáticos periódicos por email a supervisores (ej. resumen semanal), en el idioma preferido del destinatario.

## 7. Modelo de datos (entidades principales)

Los campos marcados con 🌐 son **traducibles**: se almacenan como JSONB con una clave por idioma (`{"es": "...", "en": "..."}`), con *fallback* al idioma por defecto del sistema cuando falta una traducción. Se elige JSONB sobre tablas de traducción separadas por simplicidad — el volumen de contenido traducible es bajo y siempre se lee junto a su entidad.

- **Usuario** (id, nº_trabajador, nombre, rol, zona_id, password_hash, `requiere_cambio_password`, `idioma_preferido`, activo)
- **Tienda** (id, nombre, nº_referencia, dirección, geolocalización, zona_id, tipo_tienda_id, **`id_externo`**, **`origen`** [manual/csv/erp], **`sincronizado_en`**, activo)
- **TipoTienda** (id, 🌐 nombre)
- **Zona** (id, 🌐 nombre, región)
- **Ruta_Diaria** (id, usuario_id, fecha, tienda_id, orden_sugerido, planificada: bool)
- **Visita** (id, ruta_diaria_id o tienda_id + usuario_id + fecha, **estado** [`pendiente`/`en_curso`/`finalizada`/`no_realizada`], hora_inicio, geolocalización_inicio, hora_fin, geolocalización_fin, planificada: bool, `incompleta`: bool, **`justificada`: bool**, notas_libres)
- **JustificacionNoRealizada** (id, visita_id, motivo_id, comentario, **`capturada_en`** [hora del dispositivo — la que valida la ventana], **`recibida_en`** [hora de servidor, solo auditoría], `revisada_por`, `estado_revision`)
- **MotivoNoRealizacion** (id, 🌐 texto, requiere_comentario: bool, activo)
- **ChecklistTemplate** (id, 🌐 nombre, tipo_tienda_aplicable)
- **ChecklistItem** (id, template_id, 🌐 texto, requiere_foto: bool, obligatorio: bool, orden)
- **VisitaChecklistResultado** (id, visita_id, checklist_item_id, completado, foto_id opcional, timestamp)
- **CategoriaIncidencia** (id, 🌐 nombre, tipo [incidencia/oportunidad], prioridad_defecto, activo)
- **Incidencia** (id, visita_id, categoria_id, descripción, prioridad, estado, asignado_a, fotos[])
- **Foto** (id, url, visita_id, checklist_item_id opcional, incidencia_id opcional, timestamp, geolocalización)

**Notas de diseño:**
- El `nº_referencia` de tienda **no debe ser la clave primaria**. Cuando llegue el ERP, la clave de correspondencia será `id_externo`, y el número de referencia puede cambiar o duplicarse durante la transición.
- Los catálogos (categorías, motivos, tipos de tienda) se **desactivan, no se borran**, para no romper el histórico de visitas que los referencian.
- Las descripciones libres escritas por el comercial (`Incidencia.descripción`, `Visita.notas_libres`, `JustificacionNoRealizada.comentario`) **no se traducen**: son datos de campo en el idioma en que los escribió su autor.

## 8. Requisitos no funcionales

- **Seguridad:** contraseñas con hash seguro (bcrypt/argon2), comunicación HTTPS, tokens con expiración, control de acceso por rol. Las contraseñas regeneradas desde backoffice deben ser de un solo uso y forzar cambio.
- **Privacidad / RGPD:** las fotos de tienda pueden captar personas (empleados, clientes) de forma incidental — hace falta una política de retención de fotos y, si aplica, informar a las tiendas sobre el uso de estas imágenes. *(Plazo de retención pendiente de definir — ver ANEXO.)*
- **Internacionalización:** interfaz y contenido configurable en castellano, euskera, catalán, francés e inglés desde v1. Formatos de fecha, hora y número localizados. La arquitectura no debe asumir un único idioma en ningún punto (informes, emails, exportaciones incluidos). Los componentes de interfaz deben tolerar expansión de texto sin romper el maquetado.
- **Husos horarios:** todas las marcas de tiempo se almacenan en UTC y se presentan en la zona del usuario. Los procesos programados con semántica de jornada (cierre del día) se ejecutan por zona, no globalmente.
- **Cumplimiento laboral de la geolocalización:** jurisdicción única española. El art. 90 LOPDGDD exige informar a la plantilla y a su representación legal sobre el sistema de geolocalización antes de su implantación. El diseño ayuda — se captura solo en check-in/check-out, no en seguimiento continuo, y no bloquea la visita — pero la obligación de informar es previa al despliegue.
- **Rendimiento:** la app debe ser usable en móviles de gama media y con conexión lenta; comprimir/redimensionar fotos antes de subir para no saturar datos móviles.
- **Disponibilidad offline:** ver sección 4.
- **Escalabilidad:** dimensionado para escala media (50–300 comerciales, con margen de crecimiento); arquitectura backend stateless para poder escalar horizontalmente si se supera esa escala.
- **Auditoría:** registro de quién hizo qué y cuándo (especialmente relevante en checklist, incidencias y justificaciones, para evitar disputas).
- **Copias de seguridad:** backup periódico de base de datos y fotos.

## 9. Notificaciones

- Al comercial: recordatorio de visitas pendientes del día, **aviso de cierre de jornada con visitas sin justificar**, confirmación de sincronización.
- Al supervisor: incidencia crítica reportada, visita no realizada al cierre del día.

## 10. Roadmap propuesto

**MVP (v1):**
Login con regeneración de contraseña desde backoffice, vista del día, añadir visita, detalle de visita con checklist/incidencias/fotos/notas, estado `No realizada` con justificación, offline básico, multi-idioma (interfaz y contenido), backoffice con gestión maestra + catálogos configurables + consulta + exportación simple.

**Fase 2:**
Notificaciones push completas, informes automáticos por email, dashboard avanzado con gráficas, contexto histórico enriquecido, marca de agua en fotos, alertas de desviación de geolocalización.

**Fase 3 (posible, según necesidad futura):**
Integración con ERP para el catálogo de tiendas, app nativa si hace falta, optimización de rutas, portal para encargados de tienda, firma digital del encargado.

---

## 11. Consejos, mejoras y aspectos a tener en cuenta

Puntos que suelen marcar la diferencia entre una app que funciona en la demo y una que aguanta el uso real en campo:

**Sobre la fiabilidad de los datos (evitar "trampas"):**
Sin ningún control, nada impide que un comercial marque una visita como realizada sin haber ido. Conviene capturar geolocalización al iniciar y finalizar la visita (comparándola con la ubicación registrada de la tienda) y añadir marca de agua con fecha/hora/geolocalización a las fotos. No hace falta bloquear la visita si la ubicación no coincide, pero sí registrarlo para que el supervisor lo vea como una señal de alerta.

**La justificación obligatoria es un arma de doble filo:**
Ahora que una visita no realizada exige justificación, el riesgo es que el comercial elija siempre el motivo más cómodo del desplegable para quitárselo de encima. Conviene revisar en el piloto la distribución de motivos: si el 90% son "falta de tiempo", el catálogo no está midiendo nada. Mantener el catálogo corto y específico ayuda más que uno exhaustivo.

**Diferenciar visitas planificadas de no planificadas:**
Guardar `planificada: true/false` permite a los informes distinguir cobertura planificada de oportunista, y detectar patrones (ej. un comercial que casi nunca sigue la ruta asignada).

**Checklist por tipo de tienda:**
No todas las tiendas necesitan el mismo checklist (un hipermercado no es igual que una tienda de barrio). Definir tipos de tienda y checklists asociados evita un checklist genérico poco útil.

**Contexto histórico en la visita:**
Que el comercial pueda ver, al entrar en una tienda, un resumen de la última visita (incidencias abiertas, notas previas) ayuda mucho a dar continuidad y evita que se repitan incidencias ya conocidas sin seguimiento.

**Duración de la visita como métrica:**
Registrar automáticamente la duración (fin - inicio) es casi gratis una vez tienes las marcas de tiempo, y es una métrica de gestión muy pedida por dirección comercial.

**Cierre de visita con validaciones:**
Se permite finalizar con ítems obligatorios sin completar, marcando la visita como "incompleta" en vez de bloquear al comercial, para no generar frustración por problemas reales (ej. no se puede hacer una foto porque el producto ya no está).

**Compresión de fotos:**
Las fotos sin comprimir consumen datos móviles y espacio de almacenamiento rápidamente con cientos de visitas/día. Redimensionar y comprimir en el propio dispositivo antes de subir.

**El catálogo de categorías va a cambiar:**
Está aún en negociación con el cliente. Por eso debe ser configurable desde el backoffice desde el primer día, y por eso las incidencias deben referenciar la categoría por `id` y no guardar su texto — si no, cambiar un nombre reescribiría el histórico.

**Piloto antes de rollout completo:**
Antes de desplegar a los 50-300 comerciales, conviene una prueba piloto con un grupo reducido (5-10 comerciales, 2-4 semanas) para detectar problemas de checklist mal diseñado, cobertura real en tienda, o fricciones de uso, antes de escalar.

**Adopción y resistencia al cambio:**
Este tipo de apps a veces se perciben como "control/vigilancia" por parte de los comerciales. Vale la pena pensar en la comunicación interna del lanzamiento y, si es posible, dar algo de valor directo al comercial (p. ej. ver su propio histórico, su ranking, o simplificarle tareas administrativas) para mejorar la adopción. La justificación obligatoria refuerza esa percepción, así que el tono de esa pantalla importa.

**Exportación e informes programados:**
Además de exportar bajo demanda, un informe semanal automático por email a cada supervisor con el resumen de su zona suele generar mucho más engagement que un dashboard que hay que ir a consultar activamente.

---

## 12. Preguntas abiertas

Las preguntas de la v0.1, el set de idiomas y la ventana de justificación quedaron resueltos; el registro completo de respuestas y sus consecuencias está en [ANEXO.md](ANEXO.md). Quedan pendientes:

- **¿Cuál es el catálogo definitivo de categorías de incidencia/oportunidad?** En negociación con el cliente. Se arranca con placeholders configurables ya traducidos.
- **¿Cuál es el catálogo de motivos de no realización?** Propuesta inicial traducida en el ANEXO, pendiente de validar.
- **¿A qué hora cierra la jornada** a efectos de la ventana de justificación? ¿Es la misma para todas las zonas?
- **¿Quién traduce el contenido configurable creado después del rollout?** Las traducciones iniciales están hechas, pero el administrador seguirá creando categorías; sin un circuito definido, los idiomas minoritarios se degradan por acumulación.
- **¿Hay comerciales en Canarias?** Si no, el cierre de jornada es de huso único.
- **¿Se ha informado ya a la plantilla y a su representación legal sobre la geolocalización** (art. 90 LOPDGDD)? Es requisito previo al despliegue.
- **¿Cuánto tiempo se conservan las fotos?** Pospuesta por decisión de negocio. Hasta cerrarla, el sistema conserva indefinidamente, lo que implica que habrá que ejecutar un borrado retroactivo cuando se decida.
