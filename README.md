# Sales Watcher

**Gestión y rentabilidad de visitas en punto de venta.**

Sales Watcher es un sistema de dos piezas: una **app de campo** para que el GPV convierta cada visita en acciones concretas, y un **backoffice web** para que el FSM priorice esas acciones, les haga seguimiento y mida el resultado.

El ciclo que soporta es:

```
VISITA  →  DETECCIÓN  →  ACCIÓN  →  SEGUIMIENTO  →  RESULTADO
```

**Lo que no es:** un cuestionario. El cliente ya dispone de una herramienta de auditoría de ejecución en punto de venta, y esta aplicación **no la duplica**. El GPV no responde decenas de preguntas cuando no hay nada que reportar; registra lo relevante y actúa.

**Cliente:** DANONE — fabricante de gran consumo. Los GPVs visitan tiendas de terceros donde la marca no controla el punto de venta, así que el trabajo real es negociar espacio y visibilidad con el encargado, no vender en mostrador. Eso condiciona buena parte del diseño.

> **Estado (2026-08-25):** fases 0 a 4 implementadas sobre la especificación v0.4. El cliente ha entregado un **boceto funcional que reencuadra el producto** y ha respondido a las doce preguntas que abría, así que **el reencuadre está cerrado y nada bloquea el arranque**: la infraestructura sobrevive, la pantalla de visita se rehace y el backoffice se amplía. El balance de impacto está en [ANEXO.md](ANEXO.md) §1-bis, las tareas en [ROADMAP.md](ROADMAP.md) marcadas con 🆕, y el detalle funcional en [SPECS.md](SPECS.md) v0.6.

---

## El problema

Lo que se detecta en una tienda se pierde. Un hueco en el lineal, una referencia prioritaria que falta, una nevera desaprovechada: alguien lo ve, quizá lo anota, y ahí muere. Nadie comprueba después si se resolvió, y nadie puede decir qué resultado tuvo la visita más allá de que ocurrió.

El objetivo es pasar de

> «el GPV ha estado en la tienda»

a

> «el GPV ha detectado problemas y oportunidades, ha actuado sobre lo que podía resolver, ha generado acciones para quien debía intervenir, y la compañía puede comprobar qué resultado ha tenido cada actuación».

Cada elemento del sistema debe superar una prueba explícita del cliente: **¿esto ayuda realmente a vender más, resolver un problema o aprovechar mejor el tiempo del GPV?** Si no, sobra.

La regla que gobierna el diseño es igual de simple:

> **Si el GPV puede solucionarlo, la aplicación le pide que actúe.
> Si no puede, genera una acción para quien sí puede.**

En Dairy hay un reponedor de Danone, así que casi todo escala al FSM. En Waters y PBB no lo hay, y el GPV actúa o negocia con el encargado. De ahí salen dos flujos distintos para el mismo problema, y por eso el responsable de actuar se calcula por reglas en lugar de preguntárselo al usuario.

## Qué hace

### App del comercial

- **Login** con número de trabajador y contraseña, con sesión persistente para no reautenticar constantemente en campo. Si la olvida, se le regenera desde el backoffice — en tienda no siempre hay acceso al email corporativo.
- **Vista del día**: la ruta planificada como listado de cards, cada una con nombre de tienda, referencia, zona y estado, más un resumen de progreso. Sin franjas horarias: el comercial organiza su jornada.
- **Añadir visita**: buscador del catálogo completo de tiendas para registrar visitas no planificadas, que quedan etiquetadas como tales para los informes.
- **Inicio por código de punto de venta**: el GPV teclea el código `350…`, la aplicación resuelve el nombre y él confirma que es la tienda correcta. No escribe nada más.
- **Detalle de visita** con ciclo de vida explícito — *Comenzar visita* registra hora y geolocalización de inicio, *Finalizar visita* la de cierre, y a partir de ahí la visita queda en solo lectura.
- **Tres categorías** — Dairy, Waters y PBB — cada una con incidencias, oportunidades y extraespacios. Más una sección transversal de **responsable de tienda**, que se registra una sola vez por visita porque en cada tienda hay un único encargado.
- **Flujos tipificados y cortos**: falta de stock, fechas, huecos en el lineal, Top Picos que faltan, ganancia de facings, visibilidad, reorganización, extraespacios y neveras. Cada uno pregunta lo justo y deriva solo el responsable que corresponde. Qué flujos aparecen, en qué orden y con qué opciones **se configura desde el backoffice**, no está cableado en el código.
- **Lo pendiente reaparece**: al volver a una tienda, la aplicación trae lo que quedó abierto y pide al GPV que se pronuncie. Es la pieza que convierte el registro en seguimiento.
- **Justificar lo que no se hizo**: una visita planificada que no se realiza no desaparece ni se reprograma sola. Pasa a *No realizada* y exige un motivo del GPV, el mismo día, antes de cerrar la jornada.
- **Evidencia** en foto y vídeo, capturada desde cámara, con fecha, hora y geolocalización, comprimida en el dispositivo antes de subir.
- **Resumen antes de cerrar**, agrupado por categoría. En el MVP no hay mínimos obligatorios para finalizar una visita: es una decisión consciente del cliente mientras define qué exigir.

### Backoffice

- **Panel de acciones pendientes** — la pantalla principal del FSM: qué está abierto, en qué tienda, de qué tipo y **desde cuándo**. La antigüedad importa: una de las preguntas del cliente es qué lleva demasiado tiempo sin resolverse.
- **Gestión maestra** de tiendas, usuarios, catálogos y planificación de rutas.
- **Supervisión**: dashboard del día, detalle de cualquier visita, bandeja de justificaciones.
- **Dashboard de resultados**, no de actividad: oportunidades detectadas → trabajadas → solucionadas, facings ganados, Top Picos incorporados, tiendas con problemas recurrentes.
- **Informes** con filtros por fecha, GPV, zona y tienda; exportación a PDF/Excel.
- **Traducciones**: editor del contenido configurable con aviso de qué falta por traducir.

> **La duración de la visita no se muestra.** Se registra inicio y fin, pero el cliente ha decidido no exponer el tiempo de permanencia como métrica ni usarlo como control mientras no se complete la revisión legal correspondiente.

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

En el MVP una visita se puede finalizar sin requisitos mínimos. Hay motivos legítimos para no poder completar algo, y bloquear al GPV por un problema que no es suyo destruye la adopción — el cliente prefiere observar cómo se usa antes de exigir comportamientos.

## Ciclo de vida de una acción

Es lo que distingue este sistema de un registro de actividad. **Lo detectado no pertenece a la visita, pertenece a la tienda**, y sobrevive al cierre de la visita que lo originó:

```
25/08  DETECCIÓN    Falta la referencia X (Top Pico)
                    Responsable de actuar: FSM → Reponedor
                              │
                              ▼
02/09  COMPROBACIÓN  La app la muestra al GPV en su siguiente visita
                     ¿Está incorporada?
                        Sí → cerrada
                        No → sigue abierta
                              │
                              ▼
10/09  RESULTADO     🟢 SOLUCIONADO
```

Cada comprobación se **añade** como un evento con fecha; ninguna sobreescribe a la anterior. Guardar solo el último estado haría imposible responder cuánto tardó en resolverse algo, y esa es justamente una de las preguntas que el sistema existe para contestar.

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

Quince entidades implementadas, con `Visita` en el centro, más las **entidades del ciclo de acciones** que introduce el reencuadre (`Accion`, `ComprobacionAccion` y un detalle tipificado por flujo). El detalle está en la [sección 7 de SPECS.md](SPECS.md). Tres reglas atraviesan el esquema:

- **La acción pertenece a la tienda, no a la visita.** La visita es solo el momento en que algo se detectó o se comprobó. Colgar la acción de la visita —que es lo natural si se piensa en pantallas— haría el seguimiento entre visitas artificialmente difícil.

- **El nº de referencia de tienda no es clave primaria.** El catálogo se gestiona a mano en v1, pero se espera migrar a un ERP; la correspondencia se hará por `id_externo`. Atar el histórico de visitas a un número que el ERP puede cambiar sería una migración dolorosa.
- **Los catálogos se desactivan, no se borran**, y las incidencias los referencian por `id`, nunca por texto. Si se guardara el texto, renombrar una categoría reescribiría retroactivamente lo que reportaron los comerciales.

## Escala objetivo

Dimensionado para **50–300 comerciales** con margen de crecimiento. El backend es stateless para poder escalar horizontalmente si se supera esa cifra.

## Decisiones de diseño que conviene conocer

- **La visita cerrada es inmutable.** Tanto finalizada como no realizada. Si el dato se puede retocar después, deja de servir como evidencia.
- **Se registra geolocalización, pero no se bloquea.** Comparar la ubicación del check-in con la de la tienda genera una señal para el supervisor, no un muro para el comercial — el GPS falla dentro de edificios con demasiada frecuencia.
- **No hay reprogramación automática.** Arrastrar visitas al día siguiente infla la ruta en silencio hasta hacerla imposible. Mejor que el supervisor vea la no realización y decida.
- **El encargado de tienda no tiene login.** Es interlocutor durante la visita, no usuario del sistema. Un portal para encargados reabriría el modelo de permisos entero.
- **El responsable de actuar se calcula, no se elige.** Es una regla de negocio derivada de la categoría y el tipo de situación. Si el GPV pudiera seleccionarlo, la misma situación escalaría distinto según quién la registrase y los agregados dejarían de ser comparables.
- **El GPV no habla con el reponedor.** Las incidencias de Dairy van al FSM, que las traslada. La interfaz debe respetar esa cadena: mostrar «se ha avisado al reponedor» prometería un aviso que el sistema no envía, porque el reponedor no es usuario.

El registro completo, con el porqué de cada una y cuándo convendría reconsiderarla, está en [ANEXO.md](ANEXO.md).

## Documentación del proyecto

| Documento | Contenido |
|---|---|
| [SPECS.md](SPECS.md) | Especificación funcional: alcance, roles, módulos, modelo de datos, requisitos no funcionales |
| [ROADMAP.md](ROADMAP.md) | Checklist de fases y tareas |
| [ANEXO.md](ANEXO.md) | Contexto de cliente, decisiones con su justificación, **impacto del reencuadre sobre lo construido (§1-bis)**, preguntas abiertas, riesgos, datos placeholder y glosario |
| [CONVENTIONS.md](CONVENTIONS.md) | Convenciones de código, invariantes del esquema y reglas del dominio |

> **Vocabulario:** **GPV** es el usuario de campo (rol `comercial`), **FSM** su responsable (rol `supervisor`) y **RSM** el nivel regional. **Dairy**, **Waters** y **PBB** son las tres categorías de producto. El glosario completo, con Top Picos, facings, extraespacios y palomar, está al final del [ANEXO](ANEXO.md).

## Qué sigue abierto

Los catálogos de categorías y de motivos de no realización están en negociación con el cliente — se arranca con placeholders configurables desde el backoffice, ya traducidos a los cinco idiomas, precisamente porque van a cambiar. Las traducciones al euskera necesitan revisión de un hablante nativo antes del rollout.

Queda por decidir la **hora de cierre de jornada**, el **circuito de traducción** del contenido que se cree después del rollout, y la **política de retención de fotos** — esta última pospuesta a conciencia, con el matiz de que conviene construir el mecanismo aunque el plazo se configure más tarde. Antes de desplegar hay que **informar a la plantilla y a su representación legal** sobre el sistema de geolocalización (art. 90 LOPDGDD).

**Las doce preguntas que abrió el boceto están cerradas.** Quedan dos, y ninguna bloquea el diseño:

- **El audio de los vídeos** (P31). El cliente pide que se oigan bien, lo cual es razonable —el GPV narra lo que enseña—, pero grabar la voz de una persona no equivale a fotografiar un lineal, y el caso de uso previsto implica que el encargado puede quedar grabado. Conviene resolverla **antes** de implementar vídeo: aviso de grabación, encuadre sobre el lineal, o audio opcional son salidas baratas ahora y caras con vídeos ya grabados.
- **El origen del catálogo de referencias de producto** (P32). Es un problema de datos, no de diseño. El riesgo real es que envejezca: si el GPV no encuentra la referencia que busca, vuelve al texto libre por la puerta de atrás.

El registro completo de decisiones, con su justificación, está en [ANEXO.md](ANEXO.md) §1.

## Antes del rollout

Está previsto un **piloto con 5–10 comerciales durante 2–4 semanas** antes de desplegar al equipo completo. Sirve para detectar checklists mal diseñados, cobertura real en tienda y fricciones de uso mientras el coste de corregir sigue siendo bajo. Un indicador concreto a vigilar: la distribución de motivos de no realización — si casi todo cae en "falta de tiempo", el catálogo no está midiendo nada.

También hay un frente no técnico: este tipo de app se percibe a veces como vigilancia, y la justificación obligatoria refuerza esa lectura. La comunicación del lanzamiento y dar valor directo al comercial (su histórico, menos tareas administrativas) influye en la adopción tanto como el producto en sí.
