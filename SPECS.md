# SPECS.md — Aplicación de gestión y rentabilidad de visitas GPV

**Versión:** 0.7
**Fecha:** 2026-08-31
**Cliente:** DANONE
**Estado:** Segunda especificación funcional del cliente (*Especificación funcional MVP GPV v2*) incorporada. Es un ajuste sobre el reencuadre de la v0.6, no un reencuadre nuevo: confirma la mayor parte de lo ya diseñado y corrige el detalle de varios flujos. **Listo para construir**, salvo el catálogo de referencias (P32, sigue sin llegar).

**Cambios respecto a v0.6 — especificación v2 del cliente.** El documento *Especificacion_MVP_GPV_Danone_v2.pdf* recoge nueve ajustes concretos sobre los flujos ya diseñados en v0.5/v0.6:

| Cambio | Resultado |
|---|---|
| **GPS** | El cliente reafirma que no quiere ninguna interacción visible de ubicación. La captura silenciosa ya cumplía esto; se retira además el aviso de desviación que sí era visible para el GPV |
| **Top Pico → Top Picos** | Renombrado de interfaz en los cinco idiomas. Sin cambio de modelo — el identificador interno `top_pico` no cambia |
| **Selección múltiple en Top Picos** | Confirmado como requisito de aceptación: añadir varias referencias sin salir de la pantalla |
| **Reorganizar lineal → Nueva implantación** | Deja de ser texto libre; pasa a categorizarse por marca (o "todo el lineal") |
| **Bloque de marca** | Flujo nuevo, exclusivo de Waters y PBB: pregunta única, sin detalle adicional |
| **Nevera (Dairy/Waters)** | Se simplifica de ocho situaciones a un árbol binario: existe → mantener/recoger → código + foto obligatoria si se recoge; si no existe → oportunidad de añadir |
| **Foto obligatoria en falta de producto (Waters/PBB)** | Deja de ser evidencia opcional; se exige antes de guardar |
| **Preguntas redundantes** | Regla de diseño explícita: ninguna pregunta secundaria debe aparecer si la respuesta principal es "No" |
| **Histórico y seguimiento por PDV** | El cliente lo marca como lo más importante. Ya estaba construido en el modelo de `Acción` de la v0.5 (sección 7.1); no requiere diseño nuevo, solo que los flujos nuevos/modificados cuelguen de él |

El registro completo con su justificación está en [ANEXO.md](ANEXO.md), ronda 6.

**Segunda pasada sobre la v2 (mismo día).** Una relectura completa del documento del cliente, punto por punto y contrastada contra el código real, añade seis hallazgos que la primera pasada no recogió:

| Hallazgo | Dónde |
|---|---|
| **Bledina queda fuera del MVP** — el cliente lo dice explícitamente y no estaba en la lista de exclusiones | §2 Alcance |
| **Hueco en Dairy pasa de dos preguntas a una sola** — la v2 formula una pregunta combinada; el esquema actual tiene dos columnas separadas (`existe_hueco` + `cubierto_con_adyacente`) que hay que colapsar | §5.5.3 |
| **Desajuste de documentación ya existente:** "Nevera" figuraba como tipo de extraespacio genérico en versiones previas de este documento, pero el código la trata como flujo propio — no es un cambio de la v2, es un error de esta documentación que se corrige de paso | §5.5.8 |
| **Vocabulario de estados sin resolver:** la sección 11 del cliente pide distinguir `pendiente`/`resuelta`/`no resuelta`/`corregida en visita`; ni `estado_accion` ni `desenlace_comprobacion` tienen un valor equivalente a los dos últimos. Queda como pendiente técnico, no como decisión de negocio | §7.1 |
| **Vista por PDV en backoffice, a confirmar:** el endpoint ya existe; falta verificar que hay una pantalla de ficha de tienda y no solo un listado plano filtrable | §6.2 |
| **Matriz de responsabilidades, tabla de evidencia y criterios de aceptación**, que el cliente presenta como secciones propias, no estaban reproducidas como referencia consolidada | §5.5.10, §5.5.11 |

**Cambios respecto a v0.5 — se cierra el reencuadre.** Doce decisiones, dos de ellas delegadas por el cliente:

| Decisión | Resultado |
|---|---|
| **Checklist** | Se conserva, pero **deja de ser el centro**: pasa a ser la capa de configuración de los flujos, más una sección opcional y corta. *(delegada)* |
| **Modelo de datos** | **Tabla por flujo**, confirmada la recomendación de la v0.5. *(delegada)* |
| **Vídeo** | 720p · 60 s · MP4 H.264 · audio AAC · 25 MB, con captura nativa y normalización en servidor. *(delegada)* |
| **Cierre de acciones** | GPV y FSM, ambos. Sin caducidad: se marcan como **estancadas**, no se cierran solas. |
| **Top Picos** | **Catálogo** de referencias, no texto libre. |
| **RSM** | Sin acceso en esta versión. **No se añade el rol.** |
| **Canales** | Se guarda `canal` en la tienda; **no se bifurca ningún flujo**. |
| **Ruta** | La visita por código **se incorpora a la ruta**, conservando `planificada = false`. |
| **Código de nevera** | Existe en todas y es un **puente a la aplicación de neveras del FSM**. |
| **Zonas** | Solo **Granada y Almería**. Cierra también la duda de Canarias. |
| **Duración de visita** | Sin acción pendiente: se registra, no se muestra. |
| **Marcas** | Sin catálogo definitivo aún; se arranca con placeholders. |

El registro completo con su justificación está en [ANEXO.md](ANEXO.md), ronda 5.

**Cambios respecto a v0.4 — reencuadre, no incremento.** El boceto funcional del cliente cambia el propósito de la aplicación. No es un registro de actividad con checklist: es una **herramienta de gestión de incidencias y oportunidades comerciales** cuyo ciclo es

> **VISITA → DETECCIÓN → ACCIÓN → SEGUIMIENTO → RESULTADO**

Consecuencias principales:

- El cliente **ya tiene** una aplicación de auditoría de ejecución en punto de venta (presencia, implantaciones, promociones) y pide expresamente **no duplicarla**. El texto es explícito: *«no queremos crear otro cuestionario»*.
- La visita deja de organizarse como una lista de tareas y pasa a organizarse por **tres categorías de producto** — Dairy, Waters y PBB — más una sección transversal de **responsable de tienda**.
- Aparece la **regla de diseño principal**: si el GPV puede resolverlo, la aplicación le pide que actúe; si no puede, genera una acción para quien sí puede. Esto convierte al «responsable de actuar» en un campo derivado por reglas, no en algo que el usuario elige.
- Lo detectado **no se cierra al terminar la visita**: queda abierto hasta que hay un resultado, y reaparece en visitas posteriores a la misma tienda. Este seguimiento entre visitas es nuevo y es, según el propio boceto, la funcionalidad más importante del sistema.
- Se añade **vídeo** como evidencia, junto a la fotografía.
- En el MVP **no hay mínimos obligatorios** para cerrar una visita.
- El tiempo de permanencia se registra pero **no se muestra como métrica**, a la espera de revisión legal.

Ver el detalle del impacto sobre lo ya construido en [ANEXO.md](ANEXO.md) y las tareas derivadas en [ROADMAP.md](ROADMAP.md).

**Cambios respecto a v0.3:** los cinco idiomas son **solo de interfaz** — no hay operación multi-país, lo que reduce el alcance de husos horarios y deja una única jurisdicción (España). Inglés fijado en `en-GB`. La justificación de una visita no realizada tiene **ventana diaria**: se hace antes de terminar la jornada.

**Cambios respecto a v0.2:** se cierra el set de idiomas — castellano, euskera, catalán, francés e inglés. Ninguno es RTL, así que el maquetado no cambia.

**Cambios respecto a v0.1:** multi-idioma pasa a estar dentro del MVP; nuevo estado de visita `No realizada` con justificación obligatoria; catálogo de tiendas manual pero preparado para ERP; catálogo de categorías configurable; franja horaria descartada; recuperación de contraseña desde backoffice. Ver el registro de decisiones en [ANEXO.md](ANEXO.md).

---

## 1. Resumen y objetivo

Aplicación para convertir cada visita del GPV en una **visita comercialmente útil**: que en ella se detecten problemas y oportunidades concretas, que se actúe sobre lo que el GPV puede resolver, que se genere una acción dirigida a quien debe intervenir cuando no puede, y que posteriormente se compruebe el resultado. Un segundo componente (backoffice web) da al FSM la visión de gestión: qué está pendiente, qué se ha resuelto y qué resultado ha producido.

**Objetivo de negocio:** pasar de *«el GPV ha estado en la tienda»* a *«el GPV ha detectado problemas y oportunidades, ha actuado sobre lo que podía resolver, ha generado acciones para quien debía intervenir, y la compañía puede comprobar qué resultado ha tenido cada actuación»*.

**Lo que la aplicación no es.** El cliente dispone ya de una herramienta de auditoría de ejecución en punto de venta. Esta aplicación **no la sustituye ni la duplica**. No es un cuestionario: el GPV no debe responder decenas de preguntas cuando no hay ningún problema que reportar. Cada elemento que se incorpore debe superar una prueba explícita del cliente:

> ¿Esta información nos ayuda realmente a vender más, solucionar un problema o aprovechar mejor el tiempo del GPV?

Si la respuesta es no, no debería formar parte de la aplicación.

> **Reformulación del cliente en la v2, más precisa:** *«si una respuesta no genera una decisión, una acción, un dato de seguimiento o una oportunidad de análisis, no debería formar parte del MVP»*. Añade un caso que la formulación de la ronda 4 no cubría explícitamente — una respuesta puede no "vender más" ni "resolver un problema" de forma directa y aun así merecer registrarse porque **alimenta un análisis posterior** (por ejemplo, un patrón de incidencias repetidas). Es la misma regla, con el caso de la sección 6.4 (preguntas de repetición y patrón) ya incorporado a su propio enunciado.

**El ciclo que hay que soportar:**

```
VISITA  →  DETECCIÓN  →  ACCIÓN  →  SEGUIMIENTO  →  RESULTADO
```

La aplicación no debe limitarse a almacenar lo detectado; debe gestionar el proceso completo desde la detección hasta la comprobación del resultado. El FSM tiene que poder responder, sin esfuerzo, a: qué problemas se están detectando, qué oportunidades aparecen, qué puede resolver el GPV directamente, qué requiere su intervención, qué queda pendiente, qué se ha resuelto en visitas posteriores y qué oportunidades se han convertido en resultados.

## 2. Alcance

**Incluido en la v1 (MVP):**

- App para GPVs: login, visita por código de punto de venta, las tres categorías (Dairy / Waters / PBB), sección de responsable de tienda, resumen y cierre.
- Flujos de detección: incidencias, oportunidades y extraespacios, con la evidencia (foto o vídeo) que cada uno requiera.
- **Seguimiento entre visitas**: lo detectado permanece abierto hasta que hay resultado y reaparece en la siguiente visita a esa tienda.
- Panel del FSM con las acciones pendientes y su priorización.
- Backoffice web para gestión de tiendas, usuarios, rutas y catálogos, y consulta/exportación de informes.
- Dashboard de resultados, no solo de actividad (sección 6.4).
- Sincronización offline.
- **Multi-idioma**, tanto de interfaz como de contenido configurable.
- Justificación de visitas planificadas no realizadas.

**Explícitamente fuera del MVP por decisión del cliente:**

- **Mínimos obligatorios para cerrar una visita.** El GPV podrá iniciar y finalizar visitas libremente mientras el cliente termina de definir qué comportamientos quiere exigir. Es una decisión consciente y temporal.
- **El tiempo de permanencia como métrica.** Se registra técnicamente inicio y fin, pero no se expone como indicador ni se usa como mecanismo de control, a la espera de la revisión legal correspondiente.
- **Duplicar la aplicación de auditoría existente.** La comprobación sistemática de presencia, implantaciones y promociones ya la cubre otra herramienta.
- **La base de datos de Top Picos.** Ya existe en otra aplicación; aquí solo se registran los que faltan y su seguimiento.
- **Bledina.** El cliente lo excluye explícitamente en la especificación v2 (*«Bledina: no forma parte de este MVP»*). Las tres categorías del MVP son Dairy, Waters y PBB; ninguna pantalla, catálogo ni flujo debe contemplar Bledina como cuarta categoría.

**Fuera de alcance en v1** (se documentan como fases futuras en la sección 10):

- **Integración con ERP** para el catálogo de tiendas. En v1 el catálogo se gestiona manualmente desde el backoffice, pero el modelo de datos se diseña desde ya para admitir la sincronización posterior (ver sección 7).
- Optimización automática de rutas (routing).
- Firma digital del encargado.
- App nativa (se recomienda empezar con web responsive/PWA, ver sección 4).
- Portal con login propio para encargados de tienda.

## 3. Actores y roles

La estructura comercial del cliente es jerárquica:

```
RSM  (Regional Sales Manager)
 └── FSM  (Field Sales Manager)
      └── GPV  (Gestor del Punto de Venta)
           └── Puntos de venta
```

Cada GPV tiene **asignadas sus tiendas** y trabaja con un rutero de visitas. La aplicación debe apoyarse en esa asignación existente en lugar de reconstruirla.

| Rol | Nomenclatura del cliente | Descripción | Acceso |
|---|---|---|---|
| **Comercial** | **GPV** | Usuario de campo que visita los puntos de venta asignados | App móvil (nº de trabajador + contraseña) |
| **Supervisor de zona** | **FSM** | Gestiona un equipo de GPVs. **Destinatario de las acciones que el GPV no puede resolver.** Prioriza, hace seguimiento y mide resultados | Backoffice web (su equipo y zona) |
| **Dirección regional** | **RSM** | Nivel por encima del FSM | **Sin acceso en esta versión.** El sistema es para el FSM; el rol `rsm` **no se implementa** — un rol que no da acceso a nada es código muerto. Las zonas ya tienen `region`, que es el eje que necesitaría una vista de RSM, así que añadirla más adelante es aditivo |
| **Administrador** | — | Gestiona catálogos, usuarios, tiendas, traducciones e informes globales | Backoffice web (acceso total) |
| **Encargado de tienda** | Responsable / encargado | Interlocutor del GPV durante la visita. **No es usuario del sistema** y no tiene login en v1. Es, además, el destinatario de las gestiones en Waters y PBB | Sin acceso |
| **Reponedor** | — | Repone en Dairy. **No es usuario del sistema**: recibe las instrucciones a través del FSM | Sin acceso |

> El GPV y el reponedor no se comunican directamente en el modelo del cliente. Una incidencia de Dairy va del GPV al FSM, y es el FSM quien habla con el reponedor. Respetar esa cadena importa: saltársela en la interfaz crearía expectativas de aviso que el sistema no puede cumplir.

### Ámbito inicial

- **Geografía:** **Granada y Almería**, y solo esas dos en esta versión inicial. Ambas peninsulares, así que el cierre de jornada es de huso único.
- **Zonas:** las dos provincias forman **una única zona**, porque una zona es el territorio de un FSM y el FSM del cliente gestiona ambas. La provincia se segmenta por localidad o código postal, no como zona propia.
- **Canales:** los GPVs se reparten entre **Modern** y **Proximity**. La función es la misma en ambos: **se guarda el canal de cada tienda, pero ningún flujo se bifurca por él**. El campo habilita segmentar informes desde el primer día y deja preparada cualquier diferencia futura, que además podría resolverse por configuración sin tocar código.
- **Códigos de punto de venta:** cada tienda tiene un código de Danone que **comienza por `350…`** y va asociado a un nombre de tienda. Es el identificador que el GPV teclea al empezar la visita.

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

## 5. Módulo 1 — App del GPV

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

### 5.3 Inicio de la visita por código de punto de venta

El boceto describe una entrada **extremadamente sencilla**: el GPV teclea el código del punto de venta y la aplicación resuelve el resto.

```
CÓDIGO DEL PUNTO DE VENTA
┌─────────────────┐
│  350123456      │
└─────────────────┘
        ↓
   350123456
   Carrefour Granada Nevada

   [  INICIAR VISITA  ]
```

- La búsqueda se hace **entre las tiendas asignadas al GPV**, no sobre el catálogo completo.
- El GPV **nunca teclea el nombre**: lo resuelve la aplicación a partir del código, y lo muestra para que confirme visualmente que es la tienda correcta antes de iniciar.
- **Buscar por nombre está al mismo nivel que buscar por código**, no es una alternativa de respaldo. El cliente lo confirma: se entra *«por número de punto de venta o nombre de la tienda»*. El código es más rápido cuando se conoce; el nombre no debe presentarse como el camino de segunda.
- La visita puede corresponder a una tienda del rutero del día o no. **En ambos casos se incorpora a la ruta del día** y aparece como una más, para que el GPV vea una lista coherente de su jornada.

> ⚠️ **La visita incorporada conserva `planificada = false`.** Si toda visita entrase en la ruta sin distinguirse, la cobertura planificada saldría siempre al 100 % y la métrica dejaría de medir nada. El campo ya existe en el modelo, así que no cuesta nada: el GPV ve su día completo, y el FSM sigue distinguiendo cobertura planificada de oportunista. Son dos preguntas distintas y ambas conservan respuesta.

> **Nota de implementación.** El código `350…` es el `numero_referencia` de la tienda. Sigue **sin ser clave primaria** por las razones de la sección 7: cuando llegue el ERP, la correspondencia se hará por `id_externo`.

### 5.4 Detalle de la visita

Al pulsar sobre una card se accede al detalle, con:

**Cabecera:** datos de la tienda (nombre, referencia, dirección) y estado actual.

**Botón de acción según estado:**
- Si `Pendiente` → botón **"Comenzar visita"** (registra hora de inicio y geolocalización del check-in).
- Si `En curso` → botón **"Finalizar visita"** (registra hora de fin y geolocalización). Si quedan ítems obligatorios del checklist sin completar, se avisa pero **no se bloquea** el cierre: la visita queda marcada como *incompleta*.

> **GPS — sin interacción visible (v0.7).** El cliente reafirma que el GPV no debe gestionar nada de ubicación: ni pulsar "mostrar ubicación" ni ver un aviso que le pida actuar. La captura ya era silenciosa (sección 8, cumplimiento laboral), pero el aviso de **desviación** que hoy se muestra al propio GPV al comenzar la visita deja de ser visible para él — pasa a ser una señal solo para el FSM/backoffice. *«No me importa tanto ver si ha estado en la tienda, porque tengo otra aplicación que ya me lo dice»* — el cliente no pide dejar de calcular la desviación, pide dejar de enseñársela a quien la genera.
- Si `Finalizada` → se sustituye el botón por la leyenda **"FINALIZADA"** y la vista pasa a modo solo-lectura (no se pueden editar checklist/incidencias/fotos ya enviadas, para preservar la integridad del registro).
- Si `Pendiente` y se acerca el cierre de jornada → botón secundario **"No he podido visitarla"**, que abre el flujo de justificación (sección 5.9).

**Estructura de la pantalla principal.** Arriba, el código y el nombre de la tienda. Debajo, **tres categorías de producto** y una **sección transversal**:

```
350123456
Carrefour Granada Nevada

  🥛 DAIRY
  💧 WATERS
  🍦 PBB

  👤 RESPONSABLE DE TIENDA
```

El responsable queda **fuera** de las categorías a propósito: en cada punto de venta hay un único encargado, y la información sobre la relación con él se registra **una sola vez por visita**, no una vez por categoría.

**Al entrar en una categoría no aparece un cuestionario**, sino un menú de posibles situaciones:

| | Sección | Qué recoge |
|---|---|---|
| 🔴 | **Incidencias** | Problemas detectados que requieren una actuación |
| 🟢 | **Oportunidades** | Situaciones con potencial de mejorar venta, espacio, surtido o ejecución |
| 🧊 | **Extraespacios** | Espacios adicionales: cabeceras, islas, pilas y neveras |

El contenido concreto de cada apartado **varía según la categoría** — el detalle está en la sección 5.5. La diferencia principal es quién puede actuar, y de ahí sale la regla de diseño que gobierna toda la aplicación:

> **Si el GPV puede solucionarlo, la aplicación le pide que actúe.
> Si el GPV no puede solucionarlo, la aplicación genera una acción para la persona responsable.**

**Reparto de responsabilidad por situación** (tabla del boceto):

| Situación | Responsable de actuar |
|---|---|
| Hueco en Dairy provocado por rotura | FSM → Reponedor |
| Falta de stock en Dairy | FSM → Reponedor |
| Problema de fechas en Dairy | FSM → Reponedor |
| Top Pico de Dairy no implantado | FSM → Reponedor |
| Hueco en Waters/PBB | GPV |
| Falta de stock en Waters/PBB | GPV → Encargado |
| Top Pico de Waters/PBB no implantado | GPV → Encargado |
| Gestión de una nevera | FSM |
| Oportunidad de ganar facings | GPV / seguimiento |
| Nueva implantación *(antes "Reorganización del lineal", v0.7)* | GPV detecta → FSM decide |
| Bloque de marca — solo Waters/PBB *(nuevo en v0.7)* | — *(se registra automáticamente, sin escalado)* |
| Relación con el responsable | GPV |

El patrón es consistente: **en Dairy hay un reponedor de Danone** y el GPV no le da instrucciones directamente, así que casi todo escala al FSM; **en Waters y PBB no lo hay**, y el propio GPV actúa o negocia con el encargado. El responsable de actuar es por tanto un **campo derivado por reglas**, no una elección del usuario: pedirle al GPV que lo seleccione sería trasladarle una decisión que ya está tomada.

**Otras secciones del detalle:**

- **Evidencia (foto y vídeo)** — captura directa desde cámara, no subida de galería, para garantizar que corresponde al momento de la visita. Metadatos automáticos de fecha/hora y geolocalización. La evidencia queda asociada automáticamente a **tienda, categoría, GPV, fecha y hora**. El vídeo es nuevo respecto a la v0.4 y tiene implicaciones de almacenamiento que la sección 8 detalla.
- **Notas libres** — observaciones que no encajan en ninguna situación tipificada.
- **Pendientes de visitas anteriores** — lo que quedó abierto en esta tienda y sigue sin resultado (sección 5.8). No es un resumen informativo: es una lista sobre la que el GPV debe pronunciarse.

**El checklist se conserva, con otro papel.** El cliente confirma que le interesan los checklists editables desde el backoffice, y el boceto rechaza el cuestionario. No es contradictorio: lo que el boceto rechaza es un interrogatorio **obligatorio y exhaustivo**, no que haya contenido configurable. El checklist pasa por tanto a tener dos funciones, ninguna de ellas la de antes:

1. **Capa de configuración de los flujos.** Las plantillas definen **qué flujos aparecen en cada categoría, en qué orden, con qué opciones y para qué tipo de tienda o canal**. Sin esto, los nueve flujos de la sección 5.5 quedarían cableados en el código y cambiar una opción sería un despliegue.
2. **Sección opcional y corta dentro de la visita**, para lo que los flujos no cubren: una comprobación de campaña estacional, una acción puntual del trimestre. **Nunca obligatoria** para cerrar la visita.

> ⚠️ **Guardarraíles, no opcionales.** Un checklist editable sin freno crece hasta convertirse en el cuestionario que el boceto rechaza — y crecerá, porque añadir una pregunta siempre parece barato para quien no la responde en una tienda con una mano ocupada. Por eso: la sección opcional **se desactiva por defecto**, el editor del backoffice **avisa al superar unos pocos ítems**, y el piloto **mide el tiempo real de una visita sin incidencias**. Si ese tiempo sube, el checklist es el primer sospechoso.

### 5.5 Flujos de detección por categoría

Principio común a todos: **registrar únicamente lo relevante**. El GPV no comprueba sistemáticamente todas las referencias; detecta visualmente durante la visita y registra rápido lo que ve.

> ⚠️ **Regla de preguntas, sin redundancia (v0.7).** La pregunta principal de cada flujo debe bastar para detectar la oportunidad/incidencia; las preguntas secundarias solo aparecen si ayudan a concretarla. Si la respuesta a la pregunta principal es "No", no debe mostrarse ninguna pregunta adicional. Ejemplo del propio cliente: responder "No" a *«¿existe oportunidad de ganar facings?»* no debe abrir ni marca ni resultado; solo si la respuesta es "Sí" tiene sentido pedirlos. Cada flujo de esta sección debe auditarse contra esta regla antes de darlo por cerrado.

#### 5.5.1 Falta de stock / producto insuficiente

La comprobación principal es una sola pregunta:

> **¿Hay suficiente producto para cubrir la jornada?**

| Respuesta | Disponible en |
|---|---|
| Sí | Las tres categorías |
| No | Las tres categorías |
| El reponedor todavía no ha pasado | **Solo Dairy** |

La tercera opción existe únicamente en Dairy porque es la única categoría con reponedor de Danone. En Waters y PBB **no debe aparecer**: ofrecerla sería ofrecer una excusa que no existe.

- **Dairy** → si el producto es insuficiente, la incidencia va al **FSM**, que actúa con el reponedor.
- **Waters / PBB** → incidencia para el **encargado del establecimiento**. **Foto del lineal obligatoria antes de guardar** *(v0.7 — deja de ser opcional)*.

> ⚠️ **Cambio v0.7:** la pregunta *«¿se ha comunicado al responsable?»* se retira, por la regla de preguntas sin redundancia de arriba: el cliente no la pidió en la v2, y la incidencia para el encargado más la foto ya son suficientes para actuar. El vídeo sigue admitido como evidencia adicional, pero la **foto pasa a ser el mínimo obligatorio**, no una alternativa equivalente.

La evidencia importa especialmente aquí: una falta de producto **repetida** en Waters o PBB es la munición para una conversación posterior con el responsable del establecimiento, o para escalar el problema. Sin registro acumulado, esa conversación no se puede tener.

#### 5.5.2 Fechas — exclusivamente Dairy

Solo se comprueba en Dairy, y de forma **visual y puntual**: el GPV no revisa todas las referencias.

> **¿Has detectado algún problema con las fechas?** No / Sí

Si responde **Sí**, tipo de problema:

- FIFO incorrecto
- Producto próximo a caducar
- Producto mal colocado
- Otro

**No requiere foto ni vídeo.** La incidencia va al FSM, que se la comunica al reponedor.

#### 5.5.3 Huecos en el lineal

El tratamiento **difiere por categoría**, y es el ejemplo más claro de la regla de diseño. Las tres categorías comparten la misma pregunta base; lo que cambia es qué pasa después de un "Sí".

> ⚠️ **Cambio v0.7: la comprobación de Dairy pasa de dos preguntas a una.** La v0.5/v0.6 la partía en dos pasos — *"¿existe un hueco de nuestro producto?"* y, solo si existía, *"¿está cubierto con una referencia Danone adyacente?"* —, con incidencia solo si no estaba cubierto. La v2 la formula como **una sola pregunta** que ya incorpora el criterio de cobertura, y así debe implementarse: el GPV resuelve mentalmente en un solo paso si el hueco "cuenta" o no, en vez de que la aplicación se lo pregunte en dos tandas. **Afecta al esquema:** la tabla `detecciones_hueco` tiene hoy dos columnas para Dairy (`existe_hueco` + `cubierto_con_adyacente`); pasan a colapsarse en una sola.

**Pregunta base (las tres categorías):**

> **¿Hay algún hueco en el lineal que debería estar cubierto por alguna referencia de Danone y no lo está?** No / Sí

- **Dairy** — Si Sí → **incidencia para el FSM**, que la traslada al reponedor. No requiere foto ni identificar la referencia concreta.

- **Waters / PBB** — aquí el GPV **sí puede actuar**: la aplicación le pide que intente corregirlo en el momento, colocando correctamente las referencias adyacentes. Se registra el resultado de su propia actuación:

> **¿Se ha corregido el hueco?** Sí / No — no ha sido posible

Esto separa tres cosas que conviene no mezclar: **problema detectado → actuación del GPV → resultado**.

#### 5.5.4 Top Picos

> **Nombre (v0.7):** el cliente escribe "Top Pico" en singular en su propio boceto y corrige en la v2: el nombre correcto, en todas partes donde se muestre al usuario, es **"Top Picos"**, con "S". Es un cambio de etiqueta en los cinco idiomas, no de identificador interno.

Los **Top Picos** son referencias que Danone considera prioritarias y que deberían estar en el surtido de determinados puntos de venta. El GPV ya consulta en otra aplicación cuáles corresponden a cada tienda: **esta aplicación no duplica esa base de datos**, solo registra las que faltan.

El GPV indica las referencias Top Pico **no incorporadas** al lineal o al surtido, **eligiéndolas de un catálogo de referencias de producto**, no escribiéndolas a mano.

> ⚠️ **Requisito de aceptación (v0.7): selección múltiple sin salir de la pantalla.** El GPV debe poder buscar y añadir Referencia A + Referencia B + Referencia C en la misma pantalla, sin pulsar atrás y volver a entrar al buscador. Al terminar, todas las referencias añadidas quedan asociadas a la misma detección — no se crea una `Acción` por referencia y una visita distinta para cada una.

> **El catálogo es lo que hace posible el seguimiento.** Con texto libre, «Activia Natural 4×125» y «activia natural 4x125» son dos referencias distintas, y comprobar en la visita siguiente si *la misma* referencia se incorporó deja de funcionar. Como el seguimiento es, según el propio boceto, la funcionalidad más importante del sistema, la elección es catálogo.
>
> **Esto no duplica la base de datos de Top Picos.** Qué referencias son Top Pico en qué tienda sigue viviendo en la otra aplicación del cliente y no se replica. Aquí solo hace falta que las referencias tengan un nombre estable para poder reconocerlas entre visitas. De dónde sale y cómo se mantiene ese catálogo está abierto (P32), pero no bloquea el diseño del flujo.

- **Dairy** → la incidencia va al **FSM**, que habla con el reponedor para que las incorpore.
- **Waters / PBB** → el GPV habla **directamente con el encargado**.

**Seguimiento — este punto es fundamental.** Una referencia Top Pico detectada como ausente **no desaparece al cerrar la visita**. En la siguiente visita a ese punto de venta, la aplicación muestra:

```
TOP PICOS PENDIENTES
  · Referencia X     🟢 Incorporada   🔴 Sigue sin incorporar
  · Referencia Y     🟢 Incorporada   🔴 Sigue sin incorporar
```

El GPV se pronuncia sobre cada una, y así se genera seguimiento real hasta el resultado final.

#### 5.5.5 Ganancia de facings

Es una **oportunidad**, no una incidencia.

> **¿Existe oportunidad de ganar facings?** No / Sí

Si existe:

1. **Marca / segmento** — de catálogo. El definitivo aún no existe; se arranca con placeholders (ANEXO §4)
2. **¿Se ha conseguido ganar espacio?** No / Sí
3. Si se ha conseguido: **¿cuántos facings se han ganado?** +1 / +2 / +3 …

> **Deliberadamente no se pregunta cuántos facings había antes ni cuántos hay después.** El GPV no debe perder tiempo contando el lineal. Lo que interesa medir es **el incremento conseguido**.

Es la métrica de resultado más tangible del sistema: si a lo largo del mes se consiguen pequeños incrementos en 30 tiendas, el dato agregado es **+30 facings ganados**. La aplicación debe poder acumular ese resultado por **GPV, tienda, categoría, marca/segmento y mes**.

#### 5.5.6 Visibilidad

> **¿Existe oportunidad de mejorar la visibilidad?** No / Sí

Si existe:

- **Marca / segmento** — Activia, Alpro, Actimel, etc.
- **Ubicación actual:** Palomar / parte superior · Zona intermedia · Altura de ojos · Foso / parte inferior · Otra
- **Propuesta:** Subir producto · Bajar producto · Ganar espacio · Cambiar ubicación · Reorganizar lineal · Otra

Fotografía del lineal **opcional**.

La filosofía es priorizar ubicaciones que favorezcan visibilidad y capacidad de stock, evitando especialmente posiciones desfavorables como el *palomar*.

#### 5.5.7 Nueva implantación *(antes "Reorganizar lineal" — renombrado y rediseñado en v0.7)*

> **¿Existe alguna oportunidad de realizar una nueva implantación?** No / Sí

Si existe: **categorizar por marca**. Mostrar las marcas relevantes del catálogo (Activia, Actimel, etc.) y permitir seleccionar una o varias, más la opción **"Todo el lineal"** cuando la propuesta afecta al conjunto. Fotografía del estado actual del lineal, opcional.

> ⚠️ **Cambio v0.7: deja de ser texto libre.** La v0.5/v0.6 lo modelaba como el único flujo abierto, con un campo de texto para que el GPV describiera su propuesta. El cliente lo revierte: quiere el mismo patrón que el resto de oportunidades — selección de marca(s) de catálogo, no redacción. Es una simplificación deliberada a costa de perder detalle libre; si hace falta matizar la propuesta, está la nota libre general de la visita (sección 5.4).

La oportunidad llega al **FSM, que decide** si se lleva a cabo. Mismo guion en Dairy, Waters y PBB.

#### 5.5.7-bis Bloque de marca — exclusivo de Waters y PBB *(nuevo en v0.7)*

> **¿Existe alguna oportunidad de hacer un bloque de marca de Danone?** No / Sí

**Pregunta única, sin detalle adicional.** Si la respuesta es Sí, se registra la oportunidad automáticamente — no hay marca, ubicación ni ningún otro campo que rellenar. Es el flujo más simple del sistema, y así debe quedarse: el propio boceto es explícito en que no hay que añadir preguntas dentro de este bloque.

**No existe en Dairy.** Aparece únicamente en Waters y PBB, junto al resto de oportunidades de esas dos categorías (facings, visibilidad, nueva implantación, extraespacio).

#### 5.5.8 Extraespacios

Apartado independiente dentro de cada categoría. Secuencia:

1. **Categoría:** Dairy · Waters · PBB
2. **Tipo de extraespacio:** Cabecera · Isla · Pila · Otro
3. **Motivo:** Alta rotación · Promoción · Potencial de venta · Falta de espacio en lineal · Oportunidad estacional · Otro

Fotografía **no obligatoria**. La idea es detectar los casos en los que el producto tiene rotación o potencial suficiente para justificar un punto adicional de carga.

> **Corrección de esta ronda: "Nevera" no es un tipo de este desplegable.** Versiones anteriores de este documento la listaban aquí, pero el código ya la trata como un **flujo propio** con su árbol de preguntas (sección siguiente), no como una opción más de extraespacio genérico. Era un desajuste entre documentación y código anterior a la v2; se corrige aquí de paso.

#### 5.5.9 Neveras — exclusivo de Dairy y Waters

> ⚠️ **Rediseño completo en v0.7.** La v0.5/v0.6 modelaba ocho situaciones posibles (uso correcto/parcial/incorrecto, retirada, vacía, necesita nueva, necesita recogida, otro). El cliente lo simplifica a un árbol binario. Se sustituye entero, no se añade encima.

**No existe en PBB.** No mostrar este apartado en esa categoría.

Flujo:

> **¿Hay alguna nevera de Danone en el PDV?** Sí / No

- **Si Sí → ¿qué hacemos con ella?** Mantener / Recoger
  - **Si Recoger** → pedir **código de la nevera** + **foto obligatoria del código**. La foto sirve como evidencia de identificación, no es opcional en este caso.
  - **Si Mantener** → no se pide nada más; no genera acción.
- **Si No → ofrecer la oportunidad de añadir una nevera Danone.** No / Sí. Si Sí, se registra como oportunidad (mismo patrón que el resto: sin detalle adicional).

Toda gestión de nevera (recogida u oportunidad de añadir) genera una **acción para el FSM**.

**El código de nevera es un puente a otro sistema, no un dato interno** *(decisión de la ronda 5, sin cambios en v0.7)*. El cliente lo explica así: *«todas las neveras tienen que tener un código visible que está dentro de la nevera. Es un código que me permite saber cuál es la que está mal para yo informarlo en mi propia aplicación de neveras»*. El FSM tiene su propia aplicación de neveras, y nuestro papel es que allí llegue el código correcto. De ahí cinco consecuencias de diseño:

- El código se guarda **tal cual se escribe**. Normalizarlo agresivamente podría romper la correspondencia con la otra aplicación, y el objetivo declarado es evitar que se retire la unidad equivocada.
- En el panel del FSM el código debe ser **prominente y copiable**: es el dato que va a teclear en otro sistema.
- Conviene **foto del código**, no solo el código transcrito, para poder verificar una lectura dudosa sin volver a la tienda.
- Está **dentro** de la nevera, así que leerlo exige abrirla. La interfaz no debe dar a entender que se ve de lejos.
- **Cerrar una acción de nevera significa «informado en la aplicación de neveras»**, no «nevera recogida». Redactarlo de otro modo haría creer que el problema físico está resuelto cuando solo se ha trasladado.

#### 5.5.10 Resumen consolidado (v2) — matriz de responsabilidades y evidencia

El documento del cliente presenta esta información como dos tablas independientes. Se reproducen aquí en forma compacta porque son las que sirven de referencia rápida en QA — el detalle completo de cada flujo está en las subsecciones anteriores.

**Matriz de responsabilidades por elemento y categoría:**

| Elemento | Dairy | Waters | PBB |
|---|---|---|---|
| Falta de producto | Reponedor (vía FSM) | Encargado + foto obligatoria | Encargado + foto obligatoria |
| Hueco | Reponedor (vía FSM) | GPV corrige en el momento | GPV corrige en el momento |
| Fechas/rotación | Reponedor (vía FSM) | — *(no existe)* | — *(no existe)* |
| Top Picos | Reponedor (vía FSM) | Encargado (directo) | Encargado (directo) |
| Nueva implantación | GPV detecta → FSM decide | GPV detecta → FSM decide | GPV detecta → FSM decide |
| Bloque de marca | — *(no existe)* | Se registra, sin escalado | Se registra, sin escalado |
| Nevera | FSM | FSM | — *(no existe)* |

**Evidencia fotográfica — cuándo es obligatoria:**

| Situación | Evidencia |
|---|---|
| Waters — Falta de producto | 📷 Foto obligatoria del lineal |
| PBB — Falta de producto | 📷 Foto obligatoria del lineal |
| Dairy — Recoger nevera | 📷 Foto obligatoria del código |
| Waters — Recoger nevera | 📷 Foto obligatoria del código |
| Dairy — Falta de producto | Sin evidencia obligatoria |
| Fechas/rotación, Huecos (todas las categorías) | Sin evidencia obligatoria |
| Visibilidad, Nueva implantación | Foto opcional del lineal |
| Resto de oportunidades/incidencias | Foto opcional, salvo que se decida lo contrario más adelante |

#### 5.5.11 Criterios de aceptación del MVP (v2, literales del cliente)

Lista de comprobación para dar por cerrada la implementación de esta ronda:

- [ ] El GPV puede completar una visita sin introducir datos innecesarios
- [ ] Dairy, Waters y PBB mantienen un guion reconocible y consistente
- [ ] Top Picos permite seleccionar múltiples referencias sin volver atrás
- [ ] Nueva implantación sustituye a Reorganizar lineal y se categoriza por marca
- [ ] Bloque de marca aparece exclusivamente en Waters y PBB
- [ ] Nevera aparece exclusivamente en Dairy y Waters
- [ ] Recoger nevera exige código + foto
- [ ] Falta de producto en Waters/PBB exige foto y se asigna al encargado
- [ ] Hueco en Waters/PBB genera una acción inmediata para que el GPV intente corregirlo
- [ ] No aparece ninguna interacción visible de ubicación/GPS durante la visita, incluido el aviso de desviación
- [ ] Las incidencias y oportunidades quedan automáticamente registradas
- [ ] El sistema permite recuperar el histórico y pendientes del PDV
- [ ] Las respuestas generan automáticamente las acciones y responsables correspondientes

### 5.6 Responsable de tienda

Sección **transversal**: se registra **una sola vez por visita**, no por categoría.

> **¿Has hablado con el responsable?** Sí / No

Si ha hablado con él:

> **¿Cómo valorarías actualmente la relación con el responsable?**
> Muy buena · Buena · Correcta · Mejorable · Mala · No he podido hablar con él

**Esta valoración representa la relación general con el responsable, no cómo fue la conversación de ese día concreto.** La distinción no es cosmética: determina cómo se lee el histórico. Una relación «mala» no debe ser el eco de un mal día puntual, y la interfaz tiene que dejarlo claro en el propio enunciado.

Pregunta opcional adicional:

> **¿Existe alguna cuestión pendiente?** Sí / No → comentario en texto libre

El conjunto permite construir un **histórico de la relación** entre GPV y responsable del establecimiento.

### 5.7 Finalización de la visita

Botón **FINALIZAR VISITA**.

**En el MVP no hay requisitos mínimos obligatorios para cerrar.** El GPV puede iniciar y finalizar visitas libremente mientras el cliente define qué comportamientos mínimos quiere exigir. Es una decisión consciente y temporal del cliente, no un olvido.

Antes de cerrar, la aplicación muestra un **resumen de lo registrado**:

```
RESUMEN DE VISITA

DAIRY
  🔴 1 incidencia de stock
  🔴 1 hueco pendiente de reponedor
  🟢 2 oportunidades

WATERS
  🔴 1 falta de stock
  🟢 1 Top Pico pendiente
  📐 +1 facing

PBB
  Sin incidencias
  🟢 1 oportunidad

EXTRAESPACIOS
  🧊 1 nevera pendiente

RESPONSABLE
  🟢 Relación buena
```

El resumen no es decorativo: es la última oportunidad del GPV para ver qué ha generado y corregir un error antes de que la visita quede inmutable.

### 5.8 Seguimiento de acciones — entre visitas

Según el propio boceto, **la funcionalidad más importante de toda la aplicación**.

> Una incidencia u oportunidad **no debe desaparecer** después de ser registrada. Debe quedar **abierta hasta que exista un resultado**.

Ejemplo del ciclo completo:

```
TIENDA X — TOP PICO

25/08  Detectado: falta la referencia X
       Responsable de actuar: Reponedor
         ↓
02/09  La aplicación vuelve a mostrar la incidencia al GPV
       ¿Está incorporada?
         Sí → incidencia cerrada
         No → continúa pendiente
         ↓
10/09  Incorporada
       RESULTADO: 🟢 SOLUCIONADO
```

Implicaciones de diseño:

- Lo detectado tiene **ciclo de vida propio, independiente de la visita** que lo originó. Una acción abierta pertenece a la **tienda**, y la visita solo es el momento en que se detectó o se comprobó.
- Al iniciar una visita, la aplicación debe **traer lo que quedó pendiente** en esa tienda y pedir al GPV que se pronuncie.
- Cada comprobación es un **evento con fecha**, no una sobreescritura: el valor está en poder reconstruir cuánto tardó en resolverse algo, y eso se pierde si solo se guarda el último estado.
- El cliente indica que el seguimiento **se aplicará progresivamente** a los distintos tipos de acción. No todos tienen que soportarlo desde el primer día, pero el modelo de datos sí debe admitirlo desde el principio: añadirlo después obliga a migrar histórico.

**Quién cierra una acción: los dos.** Tanto el GPV, al comprobarlo en la siguiente visita, como el FSM desde su panel. Se registra siempre **quién la cerró y cuándo**: con dos actores capaces de cerrar, sin traza no hay forma de saber si una acción de Dairy la cerró el FSM tras hablar con el reponedor o el GPV al ver el hueco ya cubierto. Y el panel del FSM debe **señalar cuando un GPV ha cerrado una acción que le estaba asignada**, para que no se entere por casualidad.

**Las acciones no caducan.** Cerrarlas automáticamente destruiría en silencio el seguimiento que da sentido al sistema. En su lugar, al superar un umbral configurable de antigüedad una acción se marca como **estancada**: sigue abierta, pero sube en el panel del FSM. Así se responde a *«¿qué acciones llevan demasiado tiempo abiertas?»* sin falsear el dato.

> **Directriz de producto del cliente: «la idea es que los GPVs generen más oportunidades».** No es un comentario al margen, orienta decisiones concretas:
>
> - Lo pendiente se presenta como **contexto útil, no como lista de deberes**. Si detectar cosas hace que la próxima visita empiece con una lista de reproches, el GPV deja de detectar — y entonces el sistema se queda sin materia prima.
> - Los resultados del propio GPV —facings ganados, Top Picos incorporados— deben ser **visibles para él**, no solo para el FSM.
> - **Detección y resultado se miden por separado.** Premiar solo el resultado desincentiva registrar lo que uno no puede resolver, que es justamente lo que debe escalar al FSM.

### 5.9 Visitas planificadas no realizadas

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
- **Configuración de flujos (antes «checklists»):** qué flujos aparecen en cada categoría, en qué orden, con qué opciones y para qué tipo de tienda o canal. Reutiliza la maquinaria de plantillas traducibles ya construida. Incluye además la **sección opcional de checklist**, desactivada por defecto y **con aviso al superar unos pocos ítems** — el guardarraíl que evita que vuelva a crecer hasta ser un cuestionario.
- **Marcas / segmentos:** catálogo para los flujos de facings y visibilidad. **Las marcas no se traducen**: son nombres propios, y es la primera entrada de contenido configurable sin `textoI18n`.
- **Referencias de producto:** catálogo del que el GPV elige las referencias Top Pico ausentes. Con importación CSV, como el de tiendas *(origen y mantenimiento abiertos, P32)*.
- **Acciones:** el FSM gestiona el estado de las acciones abiertas desde su panel (sección 6.2), no desde la gestión maestra.
- **Categorías de incidencia/oportunidad:** catálogo configurable (no fijo en código), con tipo asociado (incidencia u oportunidad), prioridad por defecto y textos traducibles. El catálogo definitivo está pendiente de cerrar con el cliente, por lo que la pantalla de gestión es un requisito, no un lujo.
- **Motivos de no realización:** catálogo configurable de motivos para justificar visitas no realizadas.
- **Rutas/planificación:** asignar qué tiendas debe visitar cada comercial cada día (manual en v1; posible optimización automática en fases futuras). Sin franjas horarias.
- **Traducciones:** editor para mantener las versiones idiomáticas del contenido configurable, con indicación visible de qué traducciones faltan.

### 6.2 Supervisión en tiempo real

**El FSM necesita una herramienta distinta a la del GPV.** El GPV necesita rapidez en tienda; el FSM necesita **detectar problemas, priorizar acciones, hacer seguimiento, medir resultados y gestionar a su equipo**. Son dos productos con la misma base de datos, y confundirlos produce un panel que no sirve para ninguno de los dos.

**🔥 Acciones pendientes** — la pantalla principal del FSM. Listado de todo lo abierto que espera actuación, agrupado y priorizable:

```
Waters — Carrefour X     🔴 Falta de stock comunicada al responsable
Dairy  — Tienda Y        🔴 Hueco pendiente de reponedor
PBB    — Tienda Z        🟢 Top Pico pendiente
Waters — Tienda A        🧊 Necesita nueva nevera
Dairy  — Tienda B        📐 Oportunidad de ganar facings
```

Cada línea debe permitir distinguir de un vistazo **categoría, tienda, tipo de situación y antigüedad**. La antigüedad no es decorativa: una de las preguntas que el cliente quiere responder es *qué acciones llevan demasiado tiempo abiertas*.

- Dashboard con estado del día: visitas completadas vs. planificadas, GPVs activos, acciones abiertas, **visitas no realizadas pendientes de justificar**.
- Vista de detalle de cualquier visita: lo detectado por categoría, evidencias, responsable de tienda y horarios.
- **Ficha de tienda con histórico completo de acciones** — el endpoint `GET /tiendas/:id/acciones` ya existe (ROADMAP fase 2), pero conviene verificar que el backoffice lo expone como una **pantalla propia por PDV** (qué se detectó, quién debe solucionarlo, si se solucionó), y no solo como filtro sobre el listado plano de "Acciones pendientes". El cliente lo pide explícitamente por tienda: *«que todas las oportunidades e incidencias queden guardadas automáticamente por PDV […] para ver qué se detectó, quién tiene que solucionarlo y si finalmente se solucionó o no»* — el dato ya está, falta confirmar que la pantalla lo presenta así.

> ⚠️ **La duración de la visita no se muestra.** Se registra técnicamente inicio y fin, pero el cliente ha decidido **no exponer el tiempo de permanencia** como métrica ni usarlo como mecanismo de control mientras no se complete la revisión legal. Esto es un cambio respecto a la v0.4, que la incluía explícitamente en el detalle de visita y en los informes.
- **Bandeja de justificaciones:** listado de visitas `No realizada`, separando visualmente las **justificadas** (con su motivo) de las **no justificadas** (el comercial dejó pasar la ventana diaria). Permite marcar la justificación como aceptada o cuestionada.
- Gestión de incidencias: poder marcarlas como revisadas/resueltas, asignarlas a alguien, y notificar automáticamente cuando se reporta una incidencia crítica.

### 6.3 Informes y reportes

- Filtros por fecha, comercial, zona, tienda, tipo de incidencia, planificada/no planificada.
- Métricas clave: nº de visitas realizadas vs. planificadas, **tasa de no realización y desglose por motivo**, acciones por tipo/categoría/tienda/periodo, ranking de cobertura por zona.
- Métricas de **resultado**, que son las que dan sentido al sistema: facings ganados, Top Picos incorporados, acciones resueltas y tiempo hasta la resolución (sección 6.4).

> La **duración media de visita** desaparece de los informes por la razón explicada en 6.2, y no hay acción pendiente al respecto: el dato se registra, no se muestra, y solo volvería a plantearse si el cliente pidiera exponerlo. La tasa de cumplimiento de checklist deja de ser una métrica principal: el checklist ya no es el núcleo de la visita.

Los informes pueden **segmentarse por canal** (Modern / Proximity) desde el primer día, aunque los flujos sean idénticos en ambos.
- Exportación a PDF/Excel, respetando el idioma seleccionado.
- Informes automáticos periódicos por email a supervisores (ej. resumen semanal), en el idioma preferido del destinatario.

### 6.4 Dashboard de resultados

El cliente es explícito en que el objetivo **no** es saber cuántas visitas ha hecho cada GPV. Ese dato es de actividad, y la actividad sin resultado es exactamente lo que la aplicación quiere dejar atrás.

Las preguntas que el dashboard debe responder:

| # | Pregunta | Naturaleza |
|---|---|---|
| 1 | ¿Cuántas oportunidades se han detectado? | Detección |
| 2 | ¿Cuántas se han trabajado? | Acción |
| 3 | ¿Cuántas se han solucionado? | Resultado |
| 4 | ¿Cuántos facings hemos ganado? | Resultado |
| 5 | ¿Cuántos Top Picos hemos conseguido incorporar? | Resultado |
| 6 | ¿Cuántas incidencias de falta de stock se repiten? | Patrón |
| 7 | ¿Qué tiendas tienen problemas recurrentes? | Patrón |
| 8 | ¿Qué acciones llevan demasiado tiempo abiertas? | Seguimiento |
| 9 | ¿Qué GPVs están detectando más oportunidades? | Equipo |
| 10 | ¿Qué GPVs están consiguiendo mejores resultados? | Equipo |
| 11 | ¿Dónde estamos perdiendo oportunidades de venta? | Estratégica |

Tres observaciones sobre lo que estas preguntas exigen del modelo de datos:

- **Las preguntas 1-3 son un embudo.** Detectado, trabajado y solucionado son tres estados del mismo objeto, no tres contadores independientes. El modelo tiene que permitir seguir un mismo elemento a lo largo del embudo.
- **Las preguntas 6 y 7 son de repetición.** Requieren comparar detecciones de la misma tienda a lo largo del tiempo, lo que solo funciona si lo detectado está tipificado y no enterrado en texto libre.
- **Las preguntas 9 y 10 son distintas entre sí, y conviene que se lean juntas.** Un GPV puede detectar mucho y resolver poco, o al revés. Presentar solo una de las dos crea un incentivo torcido: premiar la detección sin resultado invita a inflar el registro.

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
- **Evidencia** (id, **tipo** [`foto`/`vídeo`], url, visita_id, accion_id opcional, deteccion_id opcional, timestamp, geolocalización, ancho_px, alto_px, **duración_s** [solo vídeo])

### 7.1 Entidades del ciclo detección → acción → resultado *(nuevas en v0.5)*

El núcleo del reencuadre. La pieza central es **Acción**, que existe **por encima de la visita**: la visita es el momento en que algo se detecta o se comprueba, pero lo detectado pertenece a la **tienda** y sobrevive al cierre de la visita.

- **Acción** (id, **tienda_id**, visita_origen_id, **categoria_producto** [`dairy`/`waters`/`pbb`/`transversal`], **tipo_situacion**, **responsable_actuar** [`gpv`/`fsm`], **estado** [`abierta`/`en_curso`/`resuelta`/`descartada`], **`estancada`** [derivado de la antigüedad, no un estado], prioridad, detectada_en, resuelta_en, **`cerrada_por`** + **`cerrada_por_rol`**, 🚫 resultado)
- **ComprobacionAccion** (id, accion_id, **visita_id**, comprobada_en, **desenlace** [`sigue_pendiente`/`resuelta`/`no_procede`], comentario)
- **MarcaSegmento** (id, nombre, categoria_producto, activo) — **el nombre no es traducible**: las marcas son nombres propios *(catálogo definitivo pendiente; placeholders en el ANEXO)*
- **ReferenciaProducto** (id, nombre, marca_id, categoria_producto, activo) — para que el GPV elija en lugar de teclear *(origen abierto, P32)*

**Detalles tipificados por flujo.** Cada uno cuelga de una `Acción` y guarda solo lo suyo:

| Entidad | Campos propios |
|---|---|
| **DeteccionStock** | suficiente [`si`/`no`/`reponedor_no_ha_pasado`], comunicado_al_responsable |
| **DeteccionFechas** | problema [`fifo`/`proximo_caducar`/`mal_colocado`/`otro`] — solo Dairy |
| **DeteccionHueco** | existe_hueco, cubierto_con_adyacente *(Dairy)*, corregido [`si`/`no_posible`] *(Waters/PBB)* |
| **TopPicoPendiente** | **referencia_id** *(del catálogo, no texto libre)*, incorporada, fecha_incorporacion |
| **GananciaFacings** | marca_segmento_id, conseguido, **facings_ganados** (entero) |
| **OportunidadVisibilidad** | marca_segmento_id, ubicacion_actual, propuesta |
| **NuevaImplantacion** *(antes `OportunidadReorganizacion`, v0.7)* | **marca_ids[]** *(del catálogo)*, **todo_lineal**: bool — sustituye a `propuesta` (texto libre) |
| **BloqueMarca** *(nuevo, v0.7 — solo Waters/PBB)* | *(sin campos propios)* — la `Acción` sola basta: `tipo_situacion = 'bloque_marca'`, sin detalle que tipificar |
| **Extraespacio** | tipo [`cabecera`/`isla`/`pila`/`nevera`/`otro`], motivo |
| **Nevera** *(rediseñada en v0.7 — solo Dairy/Waters)* | **hay_nevera**: bool, **decision** [`mantener`/`recoger`] *(si hay_nevera)*, **codigo_nevera** *(obligatorio si `recoger`)*, **oportunidad_anadir**: bool *(si no hay_nevera)* — sustituye al campo `situacion` de 8 valores |
| **RelacionResponsable** | visita_id, ha_hablado, **valoracion**, cuestion_pendiente, comentario |

> **Top Picos — la selección múltiple no cambia el modelo.** El requisito de la sección 5.5.4 (añadir varias referencias sin salir de pantalla) es de interfaz: cada referencia sigue generando su propia `Acción` + `TopPicoPendiente`, porque cada una necesita seguimiento independiente (una puede incorporarse y otra seguir pendiente). Lo que cambia es que el formulario permite crearlas todas en una sola sesión, no una por una.

**Decidido: tabla por flujo, no JSONB genérico.** Los flujos comparten ciclo de vida pero no campos, y las dos opciones eran una tabla por flujo o una `Acción` con `detalle` en JSONB.

El motivo decisivo es el dashboard: `facings_ganados` hay que **sumarlo**, y las preguntas de repetición («¿qué tiendas tienen problemas recurrentes?») exigen comparar campos concretos entre visitas. Con JSONB eso depende de consultas sobre estructuras sin garantías de forma, y el primer flujo guardado con una clave mal escrita rompe un agregado en silencio. La flexibilidad compensaría si los flujos fueran imprevisibles; el boceto los tipifica con precisión, así que no lo son.

**Coste asumido, explícito:** añadir un flujo nuevo es una migración. A cambio, la base de datos garantiza la forma de lo que guarda.

**Cambios en entidades existentes:**

- **Tienda** — añadir **`canal`** [`modern`/`proximity`]. El `numero_referencia` pasa a ser el **código Danone** (`350…`), con la búsqueda por código como vía principal de entrada a la visita.
- **Usuario** — **sin cambios.** El rol `rsm` **no se añade**: no tendría acceso a nada en esta versión, y las zonas ya tienen `region`, que es el eje de agregación que necesitaría una vista de RSM más adelante.
- **Visita** — el flag `incompleta` **queda sin uso en el MVP**: no hay mínimos obligatorios para cerrar (sección 5.7). No se elimina el campo, porque el propio cliente anticipa definir esos mínimos más adelante.

**Notas de diseño del ciclo:**

- **`ComprobacionAccion` es un registro de eventos, no un campo de estado.** Guardar solo el último estado de una acción haría imposible responder cuánto tardó en resolverse, que es la pregunta 8 del dashboard. Cada comprobación se añade; ninguna sobreescribe.
- **`responsable_actuar` se deriva por reglas**, no lo elige el GPV. Se calcula en el servidor a partir de categoría y tipo de situación, según la tabla de la sección 5.4. Dejarlo a elección del usuario permitiría que la misma situación escalara de forma distinta según quién la registrase, y rompería los agregados.
- **`facings_ganados` es un entero acumulable.** Es la única cifra del sistema que se suma directamente para producir un resultado de negocio, y debe poder agregarse por GPV, tienda, categoría, marca y mes.
- **`codigo_nevera` es texto libre** y debe conservarse tal cual se escribe: es la clave de correspondencia con la **aplicación de neveras del FSM**, y normalizarlo agresivamente podría destruir esa correspondencia.
- **`estancada` se deriva de la antigüedad, no es un estado más.** Una acción estancada sigue abierta; solo sube en el panel. Convertirlo en estado permitiría que algo estuviera «estancado» y «resuelto» a la vez, o que dejara de estarlo sin que nadie hiciera nada.

> ⚠️ **Pendiente de verificar (v0.7): el vocabulario de estados no coincide literalmente con el de la especificación v2.** La sección 11 del documento del cliente pide poder distinguir `pendiente` / `resuelta` / `no resuelta` / `corregida en visita`. El `estado_accion` real en base de datos es `abierta` / `en_curso` / `resuelta` / `descartada`, y el desenlace de una comprobación es `sigue_pendiente` / `resuelta` / `no_procede`. Ninguno de los dos tiene un valor equivalente a **"corregida en visita"** — hoy ese matiz vive solo en el campo `correccion` de `DeteccionHueco` (Waters/PBB), no en el estado de la `Acción` — ni a **"no resuelta"** como desenlace distinto de `descartada` (que es administrativo: alguien decide que no procede actuar, no que se intentó y no se consiguió). Antes de dar por cerrado el ciclo de seguimiento conviene decidir si esto se resuelve con **texto derivado** en el panel del FSM (leyendo el detalle del flujo, sin tocar el esquema) o si hace falta ampliar alguno de los dos enums. No es una decisión de negocio — es una de las mías pendiente de validar con el desarrollo antes de construir el panel de resultados.
>
> **Corrección tras implementar: el campo `tipo` (incidencia/oportunidad) ya estaba resuelto, no pendiente.** `grupoSituacion()` en `@sw/shared` clasifica en **tres** grupos deliberadamente, no dos: incidencia, oportunidad y **extraespacio como grupo propio** — con su propio comentario en el código explicando por qué no colapsarlo dentro de oportunidad (haría que "nos han retirado la nevera" contase como oportunidad detectada y ensuciaría el embudo del dashboard, SPECS §6.4). La nota de la ronda 6 que daba esto por abierto pasó por alto revisar `@sw/shared` antes de escribirlo. Queda como referencia rápida, no como decisión pendiente.

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

### Vídeo como evidencia *(nuevo en v0.5)*

El boceto añade el vídeo junto a la fotografía. No es una extensión trivial del mismo mecanismo:

- **Volumen.** Una foto comprimida en dispositivo ronda los 250 KB; un vídeo corto de móvil son decenas de megabytes. El límite actual de 5 MB por evidencia no sirve, y el coste de almacenamiento cambia de escala.
- **Subida.** El mecanismo de URL firmada con subida directa desde el dispositivo sigue valiendo, pero una subida larga sobre red móvil tiene muchas más probabilidades de cortarse a la mitad. La caducidad de la URL de subida debe revisarse.
- **Offline.** Un vídeo en la cola de sincronización ocupa en el dispositivo un espacio que la cola actual no está dimensionada para asumir.
- **Retención.** La política de retención sin decidir (P7) pesa mucho más con vídeo que con foto.

**Límites fijados.** El cliente define el requisito por su resultado —*«se tienen que ver y oír bien»*— y delega lo técnico:

| Parámetro | Valor | Por qué |
|---|---|---|
| Duración máxima | **60 s** | Suficiente para recorrer un lineal y narrarlo; el tope acota el almacenamiento |
| Resolución | **720p** (1280×720) | Permite leer etiquetas de producto. 1080p multiplica por 2,25 los píxeles para muy poca ganancia real en una toma de lineal |
| Fotogramas | **30 fps** | Estándar de captura de móvil |
| Vídeo | **H.264, ~2,5 Mbps** | Contenido de poco movimiento; reproducción universal |
| Audio | **AAC 128 kbps** | *«Oír bien»* es requisito explícito: el audio **no se elimina** para ahorrar espacio |
| Contenedor | **MP4** | Se reproduce en todas partes, incluido Safari/iOS |
| Tamaño máximo | **25 MB** | 60 s a esos bitrates son ~20 MB; el resto es margen |

**La captura de vídeo en una PWA no funciona como la de foto**, y conviene no diseñar como si sí. Una foto se redimensiona en un `canvas` con tres líneas. Para vídeo no hay equivalente barato: `MediaRecorder` produce WebM/VP9 en Chrome y MP4/H.264 en Safari, y **Safari no reproduce WebM con fiabilidad** — un FSM con iPhone no podría ver el vídeo grabado por un GPV con Android.

Camino elegido:

1. **Captura con la cámara nativa** (`<input type="file" accept="video/*" capture>`), que produce MP4/H.264 con codificación por hardware en ambas plataformas y no castiga la batería.
2. **Validación de duración y tamaño en el dispositivo** antes de encolar, con mensaje claro si se pasa.
3. **Normalización a 720p en el servidor**, que uniforma la reproducción y acota el almacenamiento.

> **Implementado.** La normalización corre en una cola cada diez minutos, no en la petición de confirmación: transcodificar dentro de ella dejaría al GPV esperando en la tienda. Si ffmpeg no está disponible, el vídeo se conserva **servible y sin normalizar** en lugar de perderse, y el campo `normalizada_en` delata cuáles quedaron pendientes.

> ⚠️ **El vídeo lleva audio, y eso abre una cuestión que la fotografía no planteaba (P31).** El caso de uso previsto por el boceto —documentar una falta de stock repetida para *«hablar con el responsable del establecimiento o escalar el problema»*— implica que el encargado puede quedar grabado, y que la grabación puede usarse en una conversación sobre él. Grabar la voz de una persona no equivale a fotografiar un lineal. No es motivo para descartar el vídeo ni bloquea diseñar el flujo, pero las salidas baratas —aviso visible de grabación, encuadre sobre el lineal y no sobre personas, o audio opcional— solo son baratas si se deciden antes de tener vídeos grabados.

## 9. Notificaciones

- Al comercial: recordatorio de visitas pendientes del día, **aviso de cierre de jornada con visitas sin justificar**, confirmación de sincronización.
- Al supervisor: incidencia crítica reportada, visita no realizada al cierre del día.

## 10. Roadmap propuesto

> El plan de fases operativo y su estado real están en [ROADMAP.md](ROADMAP.md). Esta sección resume el reparto por versiones.

**MVP (v1):**
Login con regeneración de contraseña desde backoffice, inicio de visita por código de punto de venta, las tres categorías con sus flujos tipificados, responsable de tienda, resumen y cierre sin mínimos obligatorios, **seguimiento de acciones entre visitas**, evidencia en foto y vídeo, estado `No realizada` con justificación, offline, multi-idioma (interfaz y contenido), backoffice con gestión maestra + **panel de acciones pendientes del FSM** + **dashboard de resultados** + exportación.

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

**Abiertas tras la ronda 5.** Las doce que abrió el boceto (P19–P30) quedaron cerradas; sus respuestas están en [ANEXO.md](ANEXO.md). Estas dos surgen de ellas, y **ninguna bloquea el diseño**:

- **P31 — El vídeo lleva audio: ¿se ha valorado grabar la voz de terceros?** El encargado de tienda puede quedar grabado, y la grabación puede acabar usándose en una conversación sobre él. Conviene resolverla **antes** de implementar vídeo: las salidas son baratas ahora y caras con vídeos ya grabados.
- **P32 — ¿De dónde sale el catálogo de referencias de producto, y cómo se mantiene?** Es un problema de datos, no de diseño: el flujo es idéntico se llene como se llene. El camino está ensayado con la importación CSV de tiendas. El riesgo real es que envejezca: si el GPV no encuentra la referencia que busca, vuelve al texto libre por la puerta de atrás.
