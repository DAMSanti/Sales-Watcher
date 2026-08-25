# ROADMAP — Sales Watcher

Checklist de fases del proyecto. Marcar según avance.
Detalle funcional en [SPECS.md](SPECS.md) · Notas y decisiones en [ANEXO.md](ANEXO.md)

**Leyenda:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho

> **⚠️ Reencuadre funcional (2026-08-25).** El cliente ha entregado el *Primer boceto funcional*, que **cambia el propósito del producto**: de registro de actividad con checklist a **gestión de incidencias y oportunidades con seguimiento hasta el resultado**. Las tareas nuevas van marcadas con **🆕** en la fase que les corresponde.
>
> Reparto del impacto: **fases 1 y 2 aguantan bien** (son infraestructura), **la fase 3 se rehace en su mayor parte** (la pantalla de visita cambia entera) y **la fase 4 se amplía** más que se rehace. El balance completo está en [ANEXO.md](ANEXO.md) sección 1-bis.
>
> **P19 bloquea el arranque de la fase 3**: hasta saber qué se hace con el checklist ya construido, no conviene empezar a sustituirlo.

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
- [ ] Revisión de las traducciones al euskera por hablante nativo
- [ ] Definir circuito de traducción del contenido creado tras el rollout
- [ ] Confirmar si hay comerciales en Canarias (huso único o no)
- [ ] Informar a la plantilla y su representación legal sobre la geolocalización (art. 90 LOPDGDD)
- [ ] Definir la hora de cierre de jornada
- [ ] Cerrar catálogo de categorías de incidencia/oportunidad con el cliente *(en curso)*
- [ ] Cerrar catálogo de motivos de no realización
- [ ] Definir política de retención de fotos (RGPD) *(pospuesta por negocio)*
### 🆕 Derivadas del boceto funcional

Ordenadas por lo que bloquean. Las cinco primeras conviene resolverlas antes de escribir código nuevo.

- [ ] **P19 — ¿Qué se hace con el checklist ya construido?** ¿Se retira, o se reutiliza para configurar los flujos tipificados? *(bloquea el alcance de la fase 3)*
- [ ] **P20 — Límites del vídeo**: duración, formato, resolución, compresión en dispositivo *(bloquea el dimensionado de almacenamiento y la cola offline)*
- [ ] **P22 — Catálogo de marcas/segmentos** *(el boceto solo cita Activia, Alpro y Actimel como ejemplos)*
- [ ] **P23 — ¿Quién cierra una acción y puede caducar?** GPV en la siguiente visita, FSM desde el panel, o ambos según tipo
- [ ] **P25 — ¿La referencia de Top Pico es texto libre o catálogo?** *(con texto libre, el seguimiento entre visitas se degrada solo)*
- [ ] P21 — ¿El RSM es un rol con acceso propio o solo un nivel organizativo?
- [ ] P24 — Confirmar el modelo de tabla por flujo frente a JSONB genérico *(hay recomendación en SPECS 7.1)*
- [ ] P27 — ¿Modern y Proximity cambian los flujos o solo segmentan informes?
- [ ] P28 — ¿Se mantiene la ruta planificada, si el GPV entra por código de tienda?
- [ ] P26 — ¿Todas las neveras tienen código visible?
- [ ] P29 — ¿Las zonas reales son solo Granada y Almería?
- [ ] **P30 — Revisión legal del registro de tiempo de permanencia** *(extensión de P18; hasta cerrarla, la duración no se muestra)*
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

- [ ] Entidad **`Accion`** con ciclo de vida propio, colgada de la **tienda** y no de la visita
- [ ] Entidad **`ComprobacionAccion`** como registro de eventos *(cada comprobación se añade; ninguna sobreescribe, o se pierde el «cuánto tardó»)*
- [ ] Detalles tipificados por flujo: stock, fechas, huecos, Top Picos, facings, visibilidad, reorganización, extraespacios, neveras *(sujeto a P24)*
- [ ] Entidad **`RelacionResponsable`**, una por visita
- [ ] Catálogo **`MarcaSegmento`** por categoría de producto *(depende de P22)*
- [ ] Campo **`canal`** en `Tienda` (Modern / Proximity)
- [ ] Rol **`rsm`** en `Usuario` *(depende de P21)*
- [ ] Categorías de producto Dairy / Waters / PBB como enum del dominio
- [ ] **Motor de reglas del responsable de actuar**, en servidor y en un solo sitio *(no es una elección del usuario: es regla de negocio)*
- [ ] Extender `Foto` a **`Evidencia`** con tipo foto/vídeo y duración
- [ ] Revisar límites de tamaño y caducidad de URL de subida para vídeo *(depende de P20)*
- [ ] Migraciones y datos semilla de los catálogos nuevos
- [ ] Datos de prueba con zonas reales (Granada, Almería) y códigos `350…` *(depende de P29)*

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

- [ ] Búsqueda de tienda **por código `350…` entre las asignadas al GPV**
- [ ] Endpoints de registro por flujo, con el responsable derivado en servidor
- [ ] Endpoint de **acciones abiertas de una tienda**, para traerlas al iniciar la visita
- [ ] Endpoint de **comprobación** de una acción pendiente (sigue pendiente / resuelta)
- [ ] Endpoint de **Top Picos pendientes** por tienda
- [ ] Endpoint de **relación con el responsable**, una por visita
- [ ] Endpoint de **resumen de visita** previo al cierre
- [ ] Cierre de visita **sin mínimos obligatorios** *(revisar que `incompleta` deja de marcarse)*
- [ ] Bandeja de **acciones pendientes del FSM**, con antigüedad y priorización
- [ ] Agregados de resultado: facings por GPV/tienda/categoría/marca/mes, Top Picos incorporados, embudo detectado → trabajado → solucionado
- [ ] Agregados de patrón: incidencias de stock repetidas, tiendas con problemas recurrentes, acciones abiertas demasiado tiempo
- [ ] Subida y confirmación de **vídeo** *(depende de P20)*
- [ ] **Retirar la duración de visita** de respuestas, informes y exportaciones *(no basta con ocultarla en la interfaz — P30)*
- [ ] Incluir los flujos nuevos en el endpoint de sincronización por lotes

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

> **Bloqueado por P19.** El checklist es hoy el núcleo de esta pantalla y el boceto lo desautoriza; empezar antes de esa decisión es arriesgarse a construir dos veces.

- [ ] Inicio de visita **tecleando el código del punto de venta**, con confirmación visual del nombre
- [ ] Pantalla principal con las **tres categorías** (Dairy / Waters / PBB) + **responsable de tienda** transversal
- [ ] Menú por categoría: **Incidencias · Oportunidades · Extraespacios**
- [ ] Flujo de **falta de stock** *(la opción «el reponedor todavía no ha pasado» solo en Dairy)*
- [ ] Flujo de **fechas** *(solo Dairy, sin evidencia)*
- [ ] Flujo de **huecos** *(Dairy: ¿cubierto con adyacente? · Waters/PBB: ¿lo has corregido?)*
- [ ] Flujo de **Top Picos**: registro de referencias que faltan
- [ ] **Top Picos pendientes** al entrar en la tienda, con comprobación 🟢/🔴
- [ ] Flujo de **ganancia de facings** *(sin contar el lineal: solo el incremento)*
- [ ] Flujo de **visibilidad** *(ubicación actual → propuesta)*
- [ ] Flujo de **reorganización** *(texto libre + foto)*
- [ ] Flujo de **extraespacios** *(categoría → tipo → motivo)*
- [ ] Flujo de **neveras**, con **código de nevera** y foto en las retiradas
- [ ] Sección de **responsable de tienda**, con la valoración enunciada como **relación general, no conversación del día**
- [ ] **Acciones pendientes de visitas anteriores**, presentadas como contexto y no como reproche
- [ ] **Resumen de visita** antes de cerrar, agrupado por categoría
- [ ] Cierre **sin mínimos obligatorios**
- [ ] Captura de **vídeo** con los límites que fije P20
- [ ] Todos los flujos nuevos operativos **offline** y en la cola de sincronización
- [ ] Traducción de los flujos nuevos a los cinco idiomas
- [ ] Decidir qué ocurre con la pantalla de checklist actual *(depende de P19)*

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
- [ ] Detalle de visita en solo lectura (checklist, fotos, incidencias, horarios, duración)
- [x] Bandeja de incidencias con cambio de estado
- [x] Informes de cobertura, no realización y ejecución con filtros de periodo
- [x] Métrica de tasa de no realización con desglose por motivo
- [x] Exportación CSV desde el panel *(PDF sigue pendiente)*

### 🆕 Panel del FSM y dashboard de resultados

- [ ] **Panel de acciones pendientes**: categoría · tienda · situación · **antigüedad**, priorizable
- [ ] Cambio de estado y cierre de acciones desde el panel *(depende de P23)*
- [ ] Detalle de visita **organizado por categoría de producto**, con evidencias
- [ ] **Ocultar la duración de visita** en el detalle y en los informes *(P30)*
- [ ] Dashboard de resultados — las once preguntas de SPECS 6.4:
  - [ ] Embudo: oportunidades detectadas → trabajadas → solucionadas
  - [ ] **Facings ganados**, agregables por GPV, tienda, categoría, marca y mes
  - [ ] Top Picos incorporados
  - [ ] Incidencias de stock repetidas y tiendas con problemas recurrentes
  - [ ] Acciones abiertas demasiado tiempo
  - [ ] Detección y resultado **por GPV, presentados juntos** *(mostrar solo uno crea un incentivo torcido)*
- [ ] Histórico de la **relación con el responsable** por tienda
- [ ] Reproducción de **vídeo** en el detalle
- [ ] Vista agregada para el RSM *(depende de P21)*
- [ ] Gestión del catálogo de **marcas/segmentos** *(depende de P22)*

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
- [ ] Traducciones completas revisadas
- [ ] Alta de todos los comerciales y zonas
- [ ] Formación a supervisores
- [ ] Despliegue a producción
- [ ] Monitorización activa las primeras semanas

---

## Fase 7 — Post-MVP

- [ ] 🆕 **Requisitos mínimos para cerrar una visita** *(el cliente los aplazó explícitamente del MVP, no los descartó)*
- [ ] 🆕 **Tiempo de permanencia como métrica**, solo si la revisión legal lo autoriza (P30)
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
