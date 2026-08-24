# Sales Watcher

**Registro y supervisión de visitas comerciales en punto de venta.**

Sales Watcher es un sistema de dos piezas: una **app de campo** para que los representantes comerciales registren su actividad diaria en tienda (visitas, checklists, incidencias, fotografías) y un **backoffice web** para que supervisores y dirección consulten esa información en tiempo real y generen informes.

**Cliente:** DANONE — fabricante de gran consumo. Los comerciales visitan tiendas de terceros donde la marca no controla el punto de venta, así que el trabajo real es negociar espacio y visibilidad con el encargado, no vender en mostrador. Eso condiciona buena parte del diseño.

> **Estado:** especificación cerrada (v0.2), sin implementación todavía. Ver [SPECS.md](SPECS.md) para el detalle funcional, [ROADMAP.md](ROADMAP.md) para el plan de fases y [ANEXO.md](ANEXO.md) para el registro de decisiones.

---

## El problema

Hoy la actividad comercial en punto de venta no deja rastro estructurado. No hay forma fiable de saber qué tiendas se visitaron, qué se hizo en cada visita, ni de detectar a tiempo una rotura de stock o un hueco donde cabría una nevera de producto. Cada comercial trabaja con su propio criterio.

Sales Watcher busca tres cosas:

1. **Visibilidad y trazabilidad** de la actividad comercial en campo.
2. **Estandarizar** lo que cada comercial debe hacer en cada visita.
3. **Detectar incidencias y oportunidades** de forma ágil, con foto y contexto.

## Qué hace

### App del comercial

- **Login** con número de trabajador y contraseña, con sesión persistente para no reautenticar constantemente en campo. Si la olvida, se le regenera desde el backoffice — en tienda no siempre hay acceso al email corporativo.
- **Vista del día**: la ruta planificada como listado de cards, cada una con nombre de tienda, referencia, zona y estado, más un resumen de progreso. Sin franjas horarias: el comercial organiza su jornada.
- **Añadir visita**: buscador del catálogo completo de tiendas para registrar visitas no planificadas, que quedan etiquetadas como tales para los informes.
- **Detalle de visita** con ciclo de vida explícito — *Comenzar visita* registra hora y geolocalización de inicio, *Finalizar visita* la de cierre, y a partir de ahí la visita queda en solo lectura.
- **Justificar lo que no se hizo**: una visita planificada que no se realiza no desaparece ni se reprograma sola. Pasa a *No realizada* y exige un motivo del comercial, el mismo día, antes de cerrar la jornada.
- **Checklist** configurable desde el backoffice y asignable por tipo de tienda, con ítems que pueden exigir fotografía.
- **Incidencias y oportunidades**: categoría de un catálogo configurable, descripción, prioridad y fotos adjuntas.
- **Fotografías** capturadas desde cámara, con fecha, hora y geolocalización, comprimidas en el dispositivo antes de subir.
- **Notas libres** y **contexto de la visita anterior**, para dar continuidad.

### Backoffice

- **Gestión maestra** de tiendas, comerciales, plantillas de checklist, catálogos y planificación de rutas.
- **Supervisión en tiempo real**: dashboard del día, detalle de cualquier visita, bandeja de incidencias y bandeja de justificaciones.
- **Informes** con filtros por fecha, comercial, zona y tienda; métricas de cumplimiento, no realización por motivo, duración media y cobertura; exportación a PDF/Excel.
- **Traducciones**: editor del contenido configurable con aviso de qué falta por traducir.

## Ciclo de vida de una visita

```
                    ┌──────────────┐
                    │  PENDIENTE   │
                    └──────┬───────┘
              ┌────────────┴────────────┐
   "Comenzar visita"          "No he podido visitarla"
              │                         │  (o cierre de jornada)
              ▼                         ▼
       ┌──────────────┐         ┌────────────────┐
       │   EN CURSO   │         │  NO REALIZADA  │
       └──────┬───────┘         │  justificada / │
     "Finalizar visita"         │ no justificada │
              ▼                 └────────────────┘
       ┌──────────────┐            (inmutable)
       │  FINALIZADA  │
       └──────────────┘
          (inmutable)
```

Una visita se puede finalizar con ítems obligatorios sin completar: queda marcada como *incompleta* en vez de bloquearse. Hay motivos legítimos para no poder completar un ítem, y bloquear al comercial por un problema que no es suyo destruye la adopción.

La justificación tiene **ventana diaria**: se hace antes de terminar la jornada. Si el comercial la deja pasar, la visita queda *no justificada*, que es un desenlace distinto y peor — el backoffice los separa, porque no es lo mismo "no fui porque la tienda estaba cerrada" que "no fui y no dije por qué". La ventana se valida contra la hora de captura en el dispositivo, nunca contra la de llegada al servidor: si no, una justificación hecha a las 19:55 sin cobertura se rechazaría al sincronizar a las 21:30, castigando al comercial por el fallo de red que el modo offline existe para absorber.

## Arquitectura

La decisión de partida es **PWA offline-first** en lugar de apps nativas: un solo código para todos los dispositivos, actualizaciones instantáneas sin pasar por las tiendas de aplicaciones, y acceso suficiente a cámara y geolocalización para este caso de uso.

```
┌─────────────────────┐     ┌─────────────────────┐
│   App comercial     │     │     Backoffice      │
│   PWA offline-first │     │   Web (online)      │
│   IndexedDB + cola  │     │                     │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └────────────┬──────────────┘
                        │  API REST (JWT)
              ┌─────────┴─────────┐
              │   Backend API     │
              │   stateless       │
              └─────────┬─────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
   ┌─────┴─────┐  ┌─────┴─────┐  ┌────┴──────┐
   │ PostgreSQL│  │ Object    │  │ Push      │
   │           │  │ storage   │  │ (SW)      │
   │           │  │ (fotos)   │  │           │
   └───────────┘  └───────────┘  └───────────┘
```

### El modo offline no es opcional

Las tiendas objetivo tienen cobertura irregular — sótanos, centros comerciales, zonas rurales. La app debe cachear la ruta del día, el catálogo y los textos del idioma activo al iniciar sesión, permitir completar toda la visita sin conexión, encolar los cambios localmente y sincronizarlos en segundo plano con reintentos. El comercial debe ver siempre si su trabajo está **pendiente de sincronizar** o ya **sincronizado**.

Los conflictos de edición no son un problema real: cada visita pertenece a un único comercial.

### Cinco idiomas desde el primer día

**Castellano, euskera, catalán, francés e inglés**, dentro del MVP y no como fase posterior. Ninguno es RTL, así que el maquetado no necesita versión espejada. Se separan dos capas:

- **Interfaz** — ficheros de traducción versionados con el código.
- **Contenido configurable** — ítems de checklist, categorías, tipos de tienda y zonas viajan como dato traducible (JSONB con clave por idioma), editable desde el backoffice.

El texto libre que escribe el comercial en campo no se traduce: es un dato, en el idioma de quien lo escribió.

Cuando falta una traducción se aplica una cadena de respaldo (`eu → es`, `ca → es`, `fr → en → es`), nunca cadena vacía ni la clave técnica.

Se hace ahora porque retrofitear i18n sobre un esquema con `texto VARCHAR` en producción es una de las migraciones más ingratas que existen. Dos cosas que suelen pillar por sorpresa: los bordes del alcance — informes, exportaciones a Excel, emails automáticos y formatos de fecha — y la **expansión de texto**, porque euskera y francés generan cadenas bastante más largas que el castellano, justo en una interfaz de campo llena de botones en pantalla de móvil.

Son cinco **idiomas de interfaz**, no cinco países: la operación es exclusivamente española. Eso mantiene una jurisdicción única y un calendario nacional, aunque los **festivos autonómicos y locales sí difieren** — planificar ruta en un festivo local produce tiendas cerradas y una avalancha de no realizadas que ensucia la cobertura, así que el planificador debería avisar.

## Stack propuesto

| Capa | Elección | Motivo |
|---|---|---|
| App de campo | PWA (service worker + IndexedDB) | Offline-first, instalable, un solo código |
| Backoffice | Web SPA estándar | No necesita offline |
| API | REST con autenticación JWT | Stateless, escalable horizontalmente |
| Base de datos | PostgreSQL | Datos estructurados; JSONB para contenido traducible |
| Ficheros | Object storage tipo S3 con URLs firmadas | Volumen alto de fotografías |
| Notificaciones | Push vía service worker | Avisos a comercial y supervisor |

## Modelo de datos

Quince entidades, con `Visita` en el centro. El detalle está en la [sección 7 de SPECS.md](SPECS.md). Dos reglas que atraviesan el esquema:

- **El nº de referencia de tienda no es clave primaria.** El catálogo se gestiona a mano en v1, pero se espera migrar a un ERP; la correspondencia se hará por `id_externo`. Atar el histórico de visitas a un número que el ERP puede cambiar sería una migración dolorosa.
- **Los catálogos se desactivan, no se borran**, y las incidencias los referencian por `id`, nunca por texto. Si se guardara el texto, renombrar una categoría reescribiría retroactivamente lo que reportaron los comerciales.

## Escala objetivo

Dimensionado para **50–300 comerciales** con margen de crecimiento. El backend es stateless para poder escalar horizontalmente si se supera esa cifra.

## Decisiones de diseño que conviene conocer

- **La visita cerrada es inmutable.** Tanto finalizada como no realizada. Si el dato se puede retocar después, deja de servir como evidencia.
- **Se registra geolocalización, pero no se bloquea.** Comparar la ubicación del check-in con la de la tienda genera una señal para el supervisor, no un muro para el comercial — el GPS falla dentro de edificios con demasiada frecuencia.
- **No hay reprogramación automática.** Arrastrar visitas al día siguiente infla la ruta en silencio hasta hacerla imposible. Mejor que el supervisor vea la no realización y decida.
- **El encargado de tienda no tiene login.** Es interlocutor durante la visita, no usuario del sistema. Un portal para encargados queda en fase 3 y reabriría el modelo de permisos entero.

El registro completo, con el porqué de cada una y cuándo convendría reconsiderarla, está en [ANEXO.md](ANEXO.md).

## Documentación del proyecto

| Documento | Contenido |
|---|---|
| [SPECS.md](SPECS.md) | Especificación funcional: alcance, roles, módulos, modelo de datos, requisitos no funcionales |
| [ROADMAP.md](ROADMAP.md) | Checklist de fases y tareas |
| [ANEXO.md](ANEXO.md) | Contexto de cliente, decisiones con su justificación, preguntas abiertas, riesgos, datos placeholder y glosario |

## Qué sigue abierto

Los catálogos de categorías y de motivos de no realización están en negociación con el cliente — se arranca con placeholders configurables desde el backoffice, ya traducidos a los cinco idiomas, precisamente porque van a cambiar. Las traducciones al euskera necesitan revisión de un hablante nativo antes del rollout.

Queda por decidir la **hora de cierre de jornada**, el **circuito de traducción** del contenido que se cree después del rollout, y la **política de retención de fotos** — esta última pospuesta a conciencia, con el matiz de que conviene construir el mecanismo aunque el plazo se configure más tarde. Antes de desplegar hay que **informar a la plantilla y a su representación legal** sobre el sistema de geolocalización (art. 90 LOPDGDD).

## Antes del rollout

Está previsto un **piloto con 5–10 comerciales durante 2–4 semanas** antes de desplegar al equipo completo. Sirve para detectar checklists mal diseñados, cobertura real en tienda y fricciones de uso mientras el coste de corregir sigue siendo bajo. Un indicador concreto a vigilar: la distribución de motivos de no realización — si casi todo cae en "falta de tiempo", el catálogo no está midiendo nada.

También hay un frente no técnico: este tipo de app se percibe a veces como vigilancia, y la justificación obligatoria refuerza esa lectura. La comunicación del lanzamiento y dar valor directo al comercial (su histórico, menos tareas administrativas) influye en la adopción tanto como el producto en sí.
