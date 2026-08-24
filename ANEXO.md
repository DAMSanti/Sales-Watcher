# ANEXO — Sales Watcher

Cuaderno de bitácora del proyecto. Aquí van las notas, decisiones, dudas y aprendizajes que no encajan en [SPECS.md](SPECS.md) (que describe *qué* se construye) ni en [ROADMAP.md](ROADMAP.md) (que lista *cuándo*).

**Cómo usar este documento:** añadir entradas nuevas al final de su sección, con fecha. No borrar entradas antiguas — si algo cambia, escribir una entrada nueva que lo corrija y marcar la anterior como superada. El valor de este archivo está en poder reconstruir *por qué* se decidió algo meses después.

---

## 0. Contexto del proyecto

**Cliente:** DANONE. Es un fabricante de gran consumo, no un retailer — los comerciales visitan tiendas de terceros (supermercados, hipermercados, tienda tradicional) donde DANONE no controla el punto de venta.

Esto condiciona el producto más de lo que parece:

- Las **oportunidades** son de espacio y visibilidad, no de venta directa: sitio para colocar una nevera de producto, ganar espacio en el lineal, cambiar la disposición tras nueva información de producto.
- Las **incidencias** son de ejecución en punto de venta: rotura de stock, producto mal colocado, precio incorrecto, producto caducado, acción de la competencia.
- El comercial **no manda en la tienda**: negocia con el encargado. Por eso el encargado es interlocutor y no usuario del sistema, y por eso el checklist incluye tareas de conversación ("hablar con el encargado") y no solo de comprobación.
- Cadena de frío y caducidad son relevantes para el catálogo de categorías — es producto fresco.

---

## 1. Decisiones tomadas

Registro de decisiones cerradas. Formato: qué se decidió, cuándo, por qué, y qué se descartó.

### 2026-08-24 — PWA en lugar de app nativa

**Decisión:** la app de campo será una Progressive Web App offline-first.

**Por qué:** un solo código para iOS y Android, actualizaciones instantáneas sin revisión de App Store ni Google Play, menor coste de mantenimiento. El acceso a cámara y geolocalización desde el navegador es suficiente para este caso de uso.

**Descartado:** apps nativas separadas, por coste de desarrollo y mantenimiento duplicado en la escala actual.

**Cuándo reconsiderarlo:** si aparece necesidad de notificaciones push muy fiables, acceso profundo al hardware, o si el rendimiento offline de la PWA no aguanta el volumen real. La migración a React Native/Flutter reutilizaría el backend y buena parte de la lógica.

### 2026-08-24 — El modo offline es requisito, no opcional

**Decisión:** la app debe funcionar completa sin conexión y sincronizar después.

**Por qué:** las tiendas objetivo tienen cobertura irregular — sótanos, centros comerciales, zonas rurales. Una app que falle sin red es inútil precisamente donde se usa.

### 2026-08-24 — La visita finalizada es inmutable

**Decisión:** al finalizar, la visita pasa a solo lectura. No se editan checklist, incidencias ni fotos ya enviadas.

**Por qué:** preservar la integridad del registro. Si el dato se puede retocar a posteriori, deja de servir como evidencia en disputas.

**Extensión (misma fecha):** la regla se aplica también a las visitas `No realizada` — la justificación no se edita una vez enviada.

### 2026-08-24 — Geolocalización: se registra, no se bloquea

**Decisión:** capturar ubicación en check-in y check-out y compararla con la de la tienda, pero sin impedir la visita si no coincide.

**Por qué:** el GPS falla dentro de edificios con frecuencia. Bloquear generaría falsos positivos y frustración. La desviación se registra como señal de alerta para el supervisor, que decide.

### 2026-08-24 — Finalizar con checklist incompleto se permite

**Decisión:** se avisa y se marca la visita como incompleta, pero no se bloquea el cierre.

**Por qué:** hay razones legítimas para no completar un ítem (el producto ya no está en tienda, la cámara falla). Bloquear al comercial por un problema que no es suyo destruye la adopción.

---

### Respuestas de negocio — ronda 1

*Las seis decisiones siguientes cierran las preguntas planteadas en la v0.1 de SPECS.*

### 2026-08-24 — El encargado de tienda es interlocutor, no usuario · **[cierra P1]**

**Decisión confirmada por negocio:** el encargado de tienda no tendrá login. Es el interlocutor del comercial durante la visita.

**Consecuencia:** el modelo de permisos se queda con tres roles internos (comercial, supervisor, administrador). No hace falta contemplar acceso de terceros externos a la empresa, que era la parte cara. El "front para recibir la información" es el backoffice.

**Cuándo reconsiderarlo:** si en el futuro se quiere que el encargado valide o firme la visita. Eso reabre el modelo de permisos entero, así que no es un añadido menor.

### 2026-08-24 — Catálogo de tiendas manual ahora, ERP después · **[cierra P2]**

**Decisión:** en v1 el catálogo se gestiona a mano desde el backoffice, con datos placeholder para arrancar. Se espera migrar a sincronización con ERP más adelante, pero no hay fecha ni sistema confirmado.

**Consecuencia técnica — importante:** aunque la integración esté fuera de alcance, el modelo de datos la contempla **desde ya**. La tienda lleva `id_externo`, `origen` (manual/csv/erp) y `sincronizado_en`. Añadir esos tres campos ahora cuesta minutos; añadirlos cuando ya hay 3.000 tiendas y un año de visitas apuntando a ellas es una migración con riesgo.

**Regla derivada:** el `nº_referencia` **no es la clave primaria** de la tienda. Cuando llegue el ERP, la correspondencia se hará por `id_externo`. Si atamos las visitas al número de referencia y el ERP lo cambia, se rompe el histórico.

**Paso intermedio previsto:** importación por CSV. Cubre el 80% del dolor de la carga manual sin construir la integración, y sirve de ensayo del mapeo de campos que necesitará el ERP.

### 2026-08-24 — Hay ruta diaria, pero sin franja horaria · **[cierra P3]**

**Decisión:** el comercial tiene una ruta asignada para el día, pero no hay horarios obligatorios por tienda. Solo importa que las visitas se hagan durante la jornada.

**Consecuencia:** se elimina el campo de franja horaria de la card y del modelo. Se conserva un `orden_sugerido` en la ruta como orientación, sin validación ni penalización por no seguirlo.

**Nota:** esto simplifica bastante los informes — no hay que calcular puntualidad ni desviaciones de horario, solo cobertura.

### 2026-08-24 — Visita no realizada: estado propio + justificación obligatoria · **[cierra P4]**

**Decisión:** una visita planificada que no se hace **no se reprograma automáticamente**. Pasa al estado `No realizada` y exige justificación del comercial (motivo de catálogo + comentario).

**Por qué no reprogramar automáticamente:** arrastrar visitas al día siguiente infla silenciosamente la ruta y acaba generando una bola imposible de cubrir. Que el supervisor vea la no realización y decida es más sano que un automatismo que oculta el problema.

**Consecuencias:** nuevo estado en `Visita`, nueva entidad `JustificacionNoRealizada`, nuevo catálogo `MotivoNoRealizacion`, nueva bandeja de revisión en el backoffice, nueva métrica de tasa de no realización por motivo, y una notificación de cierre de jornada al comercial.

**Riesgo asociado:** ver sección 3 — el desplegable de motivos puede convertirse en un trámite si el catálogo es genérico.

### 2026-08-24 — Multi-idioma dentro del MVP · **[cierra P5]**

**Decisión:** el sistema es multi-idioma desde v1. Sale de "fase 3, si hace falta" y entra en el alcance del MVP.

**Por qué es la decisión de más impacto de esta ronda:** afecta al modelo de datos, no solo a la interfaz. Retrofitear i18n sobre un esquema que guarda `texto VARCHAR` en checklists y categorías obliga a migrar datos con contenido ya en producción — es de las refactorizaciones más ingratas que hay. Hacerlo ahora es barato.

**Cómo:** dos capas separadas.
- *Interfaz* (botones, mensajes): ficheros de traducción versionados con el código.
- *Contenido configurable* (ítems de checklist, categorías, tipos de tienda, zonas): campos JSONB con clave por idioma, editables desde el backoffice.

**Por qué JSONB y no tablas de traducción:** el volumen de contenido traducible es pequeño y siempre se lee junto a su entidad, así que las tablas separadas solo añadirían joins. Si el contenido creciera mucho o hiciera falta buscar por texto traducido de forma intensiva, habría que revisarlo.

**Qué NO se traduce:** el texto libre que escribe el comercial en campo — descripciones de incidencia, notas, comentarios de justificación. Son datos, no contenido, y están en el idioma de quien los escribió.

**Alcance que hay que vigilar:** i18n toca también informes, exportaciones a Excel/PDF, emails automáticos y formatos de fecha/número. Es fácil hacer la interfaz multi-idioma y olvidar que el informe semanal sale siempre en castellano.

**Sigue abierto:** qué idiomas concretos. Si alguno es RTL (árabe, hebreo), el maquetado también cambia y eso es más trabajo que traducir cadenas.

### 2026-08-24 — Contraseñas: regeneración desde backoffice · **[cierra P8]**

**Decisión:** no hay auto-servicio de recuperación por email. El administrador o supervisor regenera la contraseña desde el backoffice y se la comunica al comercial.

**Por qué:** el comercial en tienda no siempre tiene acceso a su email corporativo, así que el flujo clásico de "te mandamos un enlace" falla justo cuando se necesita.

**Requisito derivado:** la contraseña regenerada debe ser temporal y forzar cambio en el siguiente inicio de sesión. Si no, acaba habiendo comerciales usando indefinidamente una contraseña que un tercero conoce y que probablemente viajó por WhatsApp.

---

### Respuestas de negocio — ronda 2

### 2026-08-24 — Cinco idiomas: castellano, euskera, catalán, francés e inglés · **[cierra P9]**

**Decisión:** v1 soporta `es`, `eu`, `ca`, `fr` y `en`. Castellano es el idioma por defecto y el último respaldo del sistema.

**La buena noticia:** ninguno es RTL. El maquetado no necesita versión espejada, que era el escenario caro. Los cinco comparten alfabeto latino y dirección de lectura.

**La consecuencia que sí cuesta — longitud, no dirección:** euskera y francés producen cadenas bastante más largas que el castellano (el francés en torno a un 15–20%; el euskera, por aglutinación, con palabras individuales muy largas que además no parten bien). La app de campo es toda botones y cards en pantalla de móvil, así que el riesgo concreto es texto desbordado o truncado justo en los controles críticos. Los componentes se diseñan para texto variable y la revisión visual en los cinco idiomas entra en el alcance de QA.

**Cadena de respaldo definida:**

```
eu → es → (nada)
ca → es
fr → en → es
en → es
```

El respaldo de euskera y catalán es el castellano porque quien los usa lo entiende. El francés respalda antes en inglés que en castellano por el mismo motivo. Nunca se muestra cadena vacía ni la clave técnica.

**Consecuencia operativa que conviene no subestimar:** cinco idiomas significa que **cada ítem de checklist y cada categoría hay que mantenerlos cinco veces**. Eso no es trabajo de desarrollo, es trabajo recurrente de administración, y recae en quien gestione el backoffice. Por eso el editor de traducciones con aviso de faltantes deja de ser una comodidad y pasa a ser lo que sostiene el sistema.

### 2026-08-24 — Consecuencias derivadas del set de idiomas

*No son decisiones de negocio, sino lo que se deduce del set y que hay que resolver en diseño técnico.*

**Cierre de jornada por zona horaria.** El proceso que convierte visitas `Pendiente` en `No realizada` tiene semántica de "fin del día laboral". Si se ejecuta a hora de servidor y hay comerciales en un huso distinto, se les marcan visitas como no realizadas mientras siguen trabajando — y como la visita no realizada es inmutable, sería un error difícil de deshacer. Marcas de tiempo en UTC, presentación y procesos programados por zona del usuario.

**Calendario laboral regional.** País Vasco, Cataluña y una eventual operación francesa tienen festivos que no coinciden. Planificar ruta en un festivo local produce tiendas cerradas, visitas no realizadas en masa y justificaciones "tienda cerrada" que ensucian la métrica de cobertura. El planificador debería conocer el calendario de la zona o, como mínimo, avisar al asignar ruta en festivo.

**Jurisdicción de la geolocalización.** Ver riesgo específico en la sección 3.

---

### Respuestas de negocio — ronda 3

### 2026-08-24 — Los cinco idiomas son solo de interfaz · **[cierra P13]** · ⚠️ acota la ronda 2

**Decisión:** no hay operación multi-país. Los cinco idiomas son idiomas de interfaz para una operación española; francés e inglés existen para usuarios que los prefieren, no porque haya comerciales trabajando en Francia o en territorio anglófono.

**Esto desactiva buena parte de las consecuencias que deduje en la ronda 2.** Concretamente:

- **Jurisdicción única: España.** Desaparece la exposición a la doctrina de la CNIL francesa, que era el punto legalmente más delicado. Queda el marco español — art. 90 LOPDGDD, que exige informar a la plantilla y a su representación legal sobre el sistema de geolocalización. Sigue siendo obligatorio, pero es un solo marco y bastante más manejable.
- **Husos horarios: casi un no-problema.** Queda el caso de **Canarias** (una hora menos que la Península). Si hay comerciales en Canarias, el cierre de jornada por zona sigue haciendo falta; si no los hay, es un huso único. De todos modos mantengo *almacenar en UTC* como práctica, porque no cuesta nada y evita el problema para siempre.
- **Calendario laboral: sigue siendo relevante.** Esta es la única consecuencia de la ronda 2 que aguanta entera. Dentro de España los festivos autonómicos y locales difieren mucho, y con País Vasco y Cataluña en el mapa el problema es real: ruta planificada en festivo local → tiendas cerradas → avalancha de no realizadas con justificación "tienda cerrada" que ensucia la cobertura.

**Lección de método:** el set de idiomas *sugería* multi-país pero no lo implicaba. Preguntarlo antes de diseñar ahorró meter husos horarios y una revisión legal francesa en un proyecto que no los necesita.

### 2026-08-24 — La justificación se hace el mismo día · **[cierra P12]**

**Decisión:** la justificación de una visita no realizada se hace **cada día, antes de terminar la jornada**. No se puede justificar el viernes una visita del martes.

**Consecuencia:** hay una ventana de justificación que se cierra con la jornada. Pasado ese punto, la visita queda `No realizada` **sin justificar**, y ese es un estado terminal que el backoffice debe mostrar de forma distinta a una no realizada justificada — es información de gestión: no es lo mismo "no fui porque la tienda estaba cerrada" que "no fui y no dije por qué".

**Requisito derivado — importante, y fácil de hacer mal:** la ventana debe validarse contra la **hora de captura en el dispositivo, no contra la hora de llegada al servidor**. El comercial puede justificar a las 19:55 sin cobertura y que la cola no sincronice hasta las 21:30. Si el servidor rechaza por ventana cerrada, se estaría castigando al comercial precisamente por el problema de red que el modo offline existe para resolver. La operación encolada lleva su propia marca de tiempo y esa es la que manda.

**Riesgo asociado:** un plazo duro presiona hacia el trámite. Justificar seis visitas a las 19:50 en el coche empuja a elegir el primer motivo del desplegable. Refuerza lo ya dicho: catálogo corto y revisión de la distribución en el piloto.

### 2026-08-24 — Inglés británico · **[cierra P14]**

**Decisión:** `en-GB`. Formatos de fecha `DD/MM/YYYY` y convenciones europeas de número, coherentes con el resto de idiomas del sistema.

### 2026-08-24 — Traducción del contenido configurable · **[cierra P15 parcialmente]**

**Decisión:** las traducciones iniciales del contenido configurable las produzco yo (Claude). Los catálogos de la sección 4 quedan traducidos a los cinco idiomas.

**Límite que conviene conocer:** mi castellano, catalán, francés e inglés son fiables para terminología de gran consumo. **En euskera mi calidad es menor**, sobre todo en vocabulario específico de retail (*facing*, *lineal*, *cabecera de góndola*), donde conviven préstamos y términos normalizados y la elección correcta depende del uso real del sector. Las traducciones al euskera de la sección 4 deberían pasar por un hablante nativo antes del rollout. No es una formalidad: un catálogo mal traducido se rellena mal, y entonces el dato no sirve.

**Lo que esto NO cierra:** quién traduce el contenido que se cree **después**. Cuando el administrador añada una categoría nueva dentro de seis meses en producción, hará falta un circuito — pedírmelo, tener un traductor, o asumir que sale en el idioma de respaldo. Sigue abierto como P16.

---

## 2. Preguntas abiertas

Dudas que necesitan respuesta antes de avanzar. Al resolverse, mover la respuesta a la sección 1 como decisión.

| # | Pregunta | Bloquea | Estado |
|---|---|---|---|
| 16 | ¿Quién traduce el contenido configurable creado **después** del rollout? | Circuito operativo, no desarrollo | **Abierta** — derivada de P15 |
| 18 | ¿Se ha informado ya a la plantilla y a su representación legal sobre la geolocalización (art. 90 LOPDGDD)? | Requisito legal previo al despliegue | **Abierta** |
| 10 | ¿Cuál es el catálogo definitivo de categorías de incidencia/oportunidad? | Datos, no código: la pantalla de gestión no depende de esto | **En curso** — en negociación con el cliente; se arranca con placeholders traducidos (sección 4) |
| 11 | ¿Cuál es el catálogo de motivos de no realización? | Datos, no código | **Abierta** — propuesta inicial traducida en sección 4 |
| 17 | ¿Hay comerciales en Canarias? | Si no, el cierre de jornada es de huso único | **Abierta** — menor |
| 7 | ¿Cuánto tiempo se conservan las fotos? | Política RGPD, coste de almacenamiento | **Pospuesta** — decisión consciente de negocio (ver nota abajo) |

**Nota sobre P16.** Las traducciones iniciales están hechas (sección 4), pero el contenido configurable es *vivo*: el administrador añadirá categorías nuevas en producción. Sin un circuito definido, esas categorías saldrán solo en castellano y el resto de idiomas irá degradándose por acumulación. Conviene decidirlo antes del rollout, no después. La opción más barata es que el editor de traducciones del backoffice marque lo que falta y alguien lo revise periódicamente.

**Nota sobre la retención de fotos (P7):** posponerla es razonable, pero tiene un coste que conviene tener presente. Mientras no haya política, el sistema conserva indefinidamente, así que cuando se decida habrá que ejecutar un **borrado retroactivo** sobre fotos ya acumuladas — y si para entonces hay un año de operación, eso es mucho volumen y una conversación con legal. Lo barato es implementar el mecanismo de retención (un campo de fecha de expiración y un proceso de purga) aunque el plazo se configure más tarde. El mecanismo es el trabajo; el número es un parámetro.

### Preguntas cerradas

P1 (encargado), P2 (catálogo de tiendas), P3 (franja horaria), P4 (visita no realizada), P5 (multi-idioma), P6 (categorías → reconvertida en P10), P8 (contraseñas), P9 (set de idiomas), P12 (ventana de justificación), P13 (solo idioma de interfaz), P14 (`en-GB`), P15 (traducción inicial → deja abierta P16). Sus respuestas están en la sección 1.

---

## 3. Riesgos identificados

| Riesgo | Impacto | Mitigación prevista |
|---|---|---|
| Percepción de la app como herramienta de vigilancia | Alto — rechazo del equipo comercial | Comunicación interna cuidada; dar valor directo al comercial (histórico propio, menos papeleo) |
| **La justificación obligatoria se convierte en trámite** | Alto — el dato de "por qué no se visitó" deja de valer | Catálogo de motivos corto y específico; revisar la distribución en el piloto — si el 90% cae en un solo motivo, el catálogo no mide nada |
| **Geolocalización de trabajadores (España)** | Medio — legal; podría retrasar el despliegue | *Reducido tras cerrar P13: jurisdicción única española.* El art. 90 LOPDGDD exige informar a la plantilla y a su representación legal sobre el sistema. El diseño ayuda — se captura solo en check-in/check-out, no en seguimiento continuo, y no bloquea la visita — pero la obligación de informar sigue siendo previa al despliegue |
| **Ventana de justificación rechazada por sincronización tardía** | **Alto — castigaría al comercial por un fallo de red** | Validar la ventana contra la marca de tiempo de **captura en dispositivo**, nunca contra la hora de llegada al servidor |
| **Justificación de última hora convertida en trámite** | Medio — el plazo diario presiona hacia el primer motivo del desplegable | Catálogo corto; recordatorio de cierre con antelación suficiente, no a las 19:55; revisar distribución en el piloto |
| **Traducción al euskera sin revisión nativa** | Medio — terminología de retail mal traducida se rellena mal | Revisión por hablante nativo de los catálogos en euskera antes del rollout |
| **Contenido configurable nuevo sin traducir tras el rollout** | Medio — degradación lenta de los idiomas minoritarios | Definir circuito de traducción continua (P16); editor con aviso de faltantes |
| **i18n incompleto en los bordes** | Medio — la interfaz está traducida pero el informe semanal sale en castellano | Tratar informes, exportaciones, emails y formatos de fecha como parte del alcance de i18n desde el principio, no como remate |
| **Desbordamiento de texto en euskera y francés** | Medio — botones y cards rotos justo en los controles críticos de campo | Componentes diseñados para texto variable; revisión visual en los cinco idiomas dentro de QA, no como remate |
| **Carga operativa de mantener 5 idiomas de contenido** | Medio — checklists y categorías salen en el idioma de respaldo porque nadie los tradujo | Editor de traducciones con aviso visible de faltantes; definir quién traduce (P15) antes del rollout |
| **Cierre de jornada ejecutado a hora de servidor** | Bajo tras cerrar P13 — solo aplica si hay comerciales en Canarias | Marcas de tiempo en UTC; proceso de jornada por zona del usuario |
| **Ruta planificada en festivo regional** | Medio — avalancha de no realizadas que ensucia la cobertura | Calendario laboral por zona en el planificador, o aviso al asignar ruta en festivo |
| **El catálogo de categorías cambia después de arrancar** | Medio — se reescribiría el histórico | Las incidencias referencian categoría por `id`, nunca guardan el texto; los catálogos se desactivan, no se borran |
| Checklist mal diseñado (genérico o demasiado largo) | Alto — el comercial lo completa mecánicamente y el dato pierde valor | Checklist por tipo de tienda; validar en el piloto |
| **Migración futura al ERP** | Medio — riesgo alto si no se prepara ahora | `id_externo` y `origen` en el modelo desde v1; el nº de referencia no es clave primaria; CSV como ensayo del mapeo |
| Volumen y coste de almacenamiento de fotos | Medio — crece rápido con cientos de visitas/día | Compresión y redimensionado en dispositivo; mecanismo de retención implementado aunque el plazo esté sin decidir |
| Consumo de datos móviles del comercial | Medio — queja frecuente en apps de campo | Compresión antes de subir; sincronizar por lotes |
| Sincronización offline con pérdida de datos | Alto — el comercial pierde el trabajo de una visita | Cola persistente con reintentos; indicador de estado siempre visible; pruebas específicas del flujo |
| Fotos que captan personas de forma incidental | Medio — cumplimiento RGPD | Política de retención; informar a las tiendas si aplica |
| Registros de visita falseados | Medio — datos no fiables para dirección | Geolocalización en check-in/out; marca de agua en fotos; señales de alerta al supervisor |

---

## 4. Datos placeholder

Catálogos provisionales para poder desarrollar y demostrar mientras se cierran con el cliente. **Todos son configurables desde el backoffice** — están aquí como semilla, no como especificación.

Traducidos a los cinco idiomas del sistema (`es` · `eu` · `ca` · `fr` · `en`), listos para cargar como datos semilla.

> ⚠️ **Las traducciones al euskera necesitan revisión de un hablante nativo antes del rollout.** La terminología de gran consumo en euskera (*facing*, *lineal*, *cabecera de góndola*) admite préstamos y términos normalizados, y la elección correcta depende del uso real del sector. Un catálogo mal traducido se rellena mal, y entonces el dato no sirve.

### Categorías de oportunidad *(placeholder)*

Basadas en lo indicado por el cliente.

| es | eu | ca | fr | en |
|---|---|---|---|---|
| Espacio disponible para nevera de producto | Produktu-hozkailua jartzeko lekua | Espai disponible per a nevera de producte | Emplacement disponible pour un réfrigérateur produit | Space available for product fridge |
| Cambio de visibilidad en el lineal por nueva información de producto | Apalategiko ikusgaitasun-aldaketa produktuaren informazio berriagatik | Canvi de visibilitat al lineal per nova informació de producte | Changement de visibilité en linéaire suite à une nouvelle information produit | Shelf visibility change due to new product information |
| Posibilidad de ampliar facings / metros de lineal | Facing edo apalategi-metro gehiago lortzeko aukera | Possibilitat d'ampliar facings / metres de lineal | Possibilité d'augmenter les facings / mètres linéaires | Opportunity to increase facings / shelf space |
| Espacio para expositor o material promocional (PLV) | Erakusleku edo material promozionalerako lekua | Espai per a expositor o material promocional (PLV) | Emplacement pour présentoir ou PLV | Space for display unit or point-of-sale material |
| Interés del encargado en referencia nueva | Arduradunak erreferentzia berrian interesa | Interès del responsable en una referència nova | Intérêt du responsable pour une nouvelle référence | Store manager interested in new product line |
| Ubicación secundaria disponible (cabecera, isla, zona de caja) | Bigarren mailako kokaleku eskuragarria (buru-apala, uhartea, kutxa-gunea) | Ubicació secundària disponible (capçalera, illa, zona de caixa) | Emplacement secondaire disponible (tête de gondole, îlot, zone caisse) | Secondary placement available (gondola end, island, checkout area) |

### Categorías de incidencia *(placeholder)*

| es | eu | ca | fr | en |
|---|---|---|---|---|
| Rotura de stock | Stock-haustura | Ruptura d'estoc | Rupture de stock | Out of stock |
| Producto mal colocado o fuera de su sitio | Produktua gaizki kokatuta edo bere lekutik kanpo | Producte mal col·locat o fora del seu lloc | Produit mal implanté ou hors de son emplacement | Product misplaced or out of position |
| Precio incorrecto en tienda | Prezio okerra dendan | Preu incorrecte a la botiga | Prix incorrect en magasin | Incorrect price in store |
| Producto próximo a caducar o caducado | Iraungitzear dagoen edo iraungitako produktua | Producte pròxim a caducar o caducat | Produit proche de la date limite ou périmé | Product near expiry or expired |
| Problema de cadena de frío | Hotz-katearen arazoa | Problema de cadena de fred | Problème de chaîne du froid | Cold chain issue |
| Material promocional deteriorado o ausente | Material promozionala hondatuta edo faltan | Material promocional deteriorat o absent | PLV détériorée ou absente | Promotional material damaged or missing |
| Acción destacada de la competencia | Lehiakideen ekintza nabarmena | Acció destacada de la competència | Action notable de la concurrence | Notable competitor activity |
| Pérdida de espacio en lineal | Apalategiko lekua galtzea | Pèrdua d'espai al lineal | Perte d'espace en linéaire | Loss of shelf space |

### Motivos de no realización *(propuesta inicial)*

| es | eu | ca | fr | en |
|---|---|---|---|---|
| Tienda cerrada | Denda itxita | Botiga tancada | Magasin fermé | Store closed |
| Encargado no disponible | Arduraduna ez zegoen eskuragarri | Responsable no disponible | Responsable non disponible | Store manager unavailable |
| Falta de tiempo en la jornada | Lanaldian denbora faltagatik | Falta de temps a la jornada | Manque de temps dans la journée | Not enough time in the working day |
| Incidencia de transporte o desplazamiento | Garraio- edo joan-etorri-intzidentzia | Incidència de transport o desplaçament | Incident de transport ou de déplacement | Travel or transport problem |
| Visita cancelada por la tienda | Dendak bisita bertan behera utzi du | Visita cancel·lada per la botiga | Visite annulée par le magasin | Visit cancelled by the store |
| Otro *(exige comentario)* | Bestelakoa | Altres | Autre | Other |

**Advertencia de diseño:** mantener esta lista corta. Un catálogo de veinte motivos no se lee, se elige el primero. Y "falta de tiempo" es el sumidero natural — si se lleva la mayoría de los casos en el piloto, hay que desglosarlo o el dato no sirve. Esto pesa más ahora que la justificación tiene plazo diario (ver decisión que cierra P12): justificar seis visitas a las 19:50 empuja al primer motivo de la lista.

### Tipos de tienda *(placeholder)*

| es | eu | ca | fr | en |
|---|---|---|---|---|
| Hipermercado | Hipermerkatua | Hipermercat | Hypermarché | Hypermarket |
| Supermercado | Supermerkatua | Supermercat | Supermarché | Supermarket |
| Supermercado de proximidad | Auzoko supermerkatua | Supermercat de proximitat | Supermarché de proximité | Convenience supermarket |
| Tienda tradicional | Denda tradizionala | Botiga tradicional | Commerce traditionnel | Traditional store |
| Autoservicio | Autozerbitzua | Autoservei | Libre-service | Self-service store |

### Nota sobre el formato de carga

Estas tablas se corresponden con los campos JSONB traducibles del modelo (sección 7 de SPECS). Cada fila carga como un objeto por idioma:

```json
{
  "nombre": {
    "es": "Rotura de stock",
    "eu": "Stock-haustura",
    "ca": "Ruptura d'estoc",
    "fr": "Rupture de stock",
    "en": "Out of stock"
  },
  "tipo": "incidencia",
  "activo": true
}
```

---

## 5. Notas técnicas

Detalles de implementación, hallazgos y consideraciones que surjan durante el desarrollo.

### Sincronización offline

- La cola local debe persistir en IndexedDB, no en memoria — el navegador puede descartar la pestaña.
- Cada operación encolada necesita un identificador propio generado en cliente, para que un reintento no cree registros duplicados en servidor (idempotencia).
- No hay conflictos de edición concurrente: cada visita pertenece a un único comercial. Esto simplifica mucho la resolución.
- Las fotos son el elemento pesado de la cola. Conviene subirlas por separado de los datos y referenciarlas por identificador.
- Las **justificaciones también viajan por la cola offline**: es muy probable que el comercial justifique al final del día, camino a casa, con mala cobertura.

### Internacionalización

**Idiomas:** `es` (por defecto), `eu`, `ca`, `fr`, `en`. Ninguno RTL.

- Dos capas separadas: ficheros de traducción para la interfaz, JSONB en base de datos para el contenido configurable.
- Cadena de respaldo: `eu → es`, `ca → es`, `fr → en → es`, `en → es`. Nunca cadena vacía ni la clave técnica.
- Usar códigos de idioma estándar como claves JSONB desde el principio. Si más adelante hiciera falta distinguir variantes (`fr-BE`, `en-GB` frente a `en-US`), el esquema lo admite sin migrar.
- La caché offline se guarda **por idioma**, y se descarga el preferido del usuario. Cambiar de idioma sin conexión solo funciona si ya estaba descargado — la interfaz debe advertirlo, no fallar en silencio.
- El backoffice necesita mostrar qué traducciones faltan; si no, se descubren en producción cuando un comercial ve un ítem en el idioma equivocado.
- Los informes y emails salen en el idioma del **destinatario**, no en el de quien los genera.
- **Presupuestar la expansión de texto.** Al maquetar, probar con las cadenas más largas de euskera y francés, no con las de castellano. Un botón que encaja justo en castellano se rompe en los otros dos.
- Separar el idioma del formato: un usuario puede querer la interfaz en inglés pero fechas en formato europeo. Formatos de fecha, hora y número por *locale*, no por idioma de interfaz.

### Limitación de los navegadores con el euskera

Chromium no incluye `eu-ES` en sus datos de internacionalización:
`Intl.DateTimeFormat.supportedLocalesOf(["eu-ES"])` devuelve una lista vacía y
el navegador cae al idioma por defecto sin avisar. Un comercial vasco ve la
interfaz traducida pero **las fechas en castellano**. Catalán y francés sí
funcionan.

Se acepta la limitación: coincide con la cadena de respaldo declarada
(`eu → es`), y las alternativas —traducir los meses a mano o empaquetar datos
de ICU adicionales— añaden peso y superficie de error para arreglar una línea
de texto. Queda anotado para que nadie lo persiga como un fallo propio.

Conviene mencionarlo al hablante nativo que revise las traducciones al euskera
(P15): puede que para el usuario final sea más molesto de lo que parece desde
fuera.

### Husos horarios

- Todas las marcas de tiempo en **UTC** en base de datos; conversión a zona del usuario solo en presentación.
- El proceso de cierre de jornada (`Pendiente` → `No realizada`) se ejecuta **por zona**, no una vez global. Es el punto donde un error de huso produce daño real, porque la visita no realizada es inmutable.
- La "fecha" de una ruta diaria es una fecha local, no un instante. Conviene almacenarla como fecha sin zona y resolver la jornada contra la zona del comercial.

### Catálogo de tiendas y futuro ERP

- Campos `id_externo`, `origen` y `sincronizado_en` en `Tienda` desde v1, aunque en v1 el origen sea siempre manual o csv.
- El `nº_referencia` es un dato de negocio visible, no una clave técnica.
- El backoffice debe indicar visualmente el origen de cada ficha — cuando llegue el ERP habrá que saber qué se puede editar a mano y qué se sobrescribirá en la siguiente sincronización.
- Al diseñar la importación CSV, documentar el mapeo de columnas. Ese documento es el borrador del contrato de integración con el ERP.

### Catálogos configurables

- Categorías, motivos y tipos de tienda se **desactivan (`activo = false`), no se borran**. Borrar rompe el histórico de visitas que los referencian.
- Las incidencias guardan `categoria_id`, nunca el texto de la categoría. Si se guardara el texto, renombrar una categoría reescribiría retroactivamente lo que reportaron los comerciales.

### Fotografías

- Captura desde cámara, no desde galería, para garantizar que la foto es del momento de la visita.
- Redimensionar y comprimir en el dispositivo antes de subir.
- Metadatos automáticos: fecha, hora, geolocalización.
- Una foto puede asociarse a un ítem de checklist, a una incidencia, o quedar como foto general de la visita.
- Implementar el mecanismo de retención (fecha de expiración + proceso de purga) aunque el plazo esté sin decidir.

### Auditoría

- Registrar quién hizo qué y cuándo, especialmente en checklist, incidencias y justificaciones. Es lo que permite resolver disputas.

---

### Puertos de desarrollo

Todos los servicios locales viven en un bloque contiguo **3900–3907**, no en los
puertos por defecto de cada tecnología:

| Puerto | Servicio            | Variable                    |
|--------|---------------------|-----------------------------|
| 3900   | API                 | `PORT`                      |
| 3901   | App de campo (dev)  | `PUERTO_FIELD`              |
| 3902   | Backoffice (dev)    | `PUERTO_BACKOFFICE`         |
| 3903   | App de campo (preview) | `PUERTO_FIELD_PREVIEW`   |
| 3904   | Backoffice (preview) | `PUERTO_BACKOFFICE_PREVIEW` |
| 3905   | PostgreSQL          | `POSTGRES_PORT`             |
| 3906   | MinIO (API)         | `MINIO_PORT`                |
| 3907   | MinIO (consola)     | `MINIO_CONSOLE_PORT`        |

El motivo es que 3000, 5173, 5432 y 9000 son los puertos por defecto de medio
mundo y chocaban con otro proyecto en la máquina de desarrollo. Los valores
salen del `.env` de la raíz — los `vite.config.ts` los leen con `loadEnv`, así
que una colisión futura se arregla editando una línea y no seis ficheros.

Los servidores de Vite usan `strictPort: true` a propósito. Con el
comportamiento por defecto, Vite salta al siguiente puerto libre cuando el suyo
está ocupado, y eso ya produjo aquí dos servidores sirviendo código distinto sin
que nadie se enterara. Es preferible que falle el arranque.

CI mantiene PostgreSQL en 5432: corre en un contenedor limpio donde no hay nada
con lo que chocar, y `DATABASE_URL` se define allí de forma independiente.

---

## 6. Aprendizajes del piloto

*(Pendiente — rellenar durante la fase 5)*

Espacio reservado para lo que salga de la prueba con 5–10 comerciales durante 2–4 semanas. Cosas concretas a medir:

- Fricciones de uso y tiempo real que lleva completar una visita.
- Ítems de checklist que sobran, faltan o se completan sin mirar.
- **Distribución de motivos de no realización** — si se concentra en uno, el catálogo hay que rehacerlo.
- Cobertura de red real en tienda y frecuencia de uso del modo offline.
- Volumen medio de fotos por visita, para dimensionar almacenamiento.

---

## 7. Glosario

| Término | Significado |
|---|---|
| **Visita planificada** | Visita asignada por el supervisor en la ruta del día |
| **Visita no planificada** | Visita creada por el comercial con el botón "Añadir visita", fuera de ruta |
| **Ruta del día** | Conjunto de tiendas asignadas a un comercial para una fecha, sin franjas horarias |
| **Incidencia** | Evento negativo detectado en tienda (rotura de stock, problema de exposición…) |
| **Oportunidad** | Evento positivo detectable (espacio para nevera, ampliación de lineal…) |
| **Checklist template** | Plantilla de tareas configurable desde backoffice, asignable por tipo de tienda |
| **Visita incompleta** | Visita finalizada con ítems obligatorios del checklist sin completar |
| **Visita no realizada** | Visita planificada que no se hizo; exige justificación del comercial |
| **Justificación** | Motivo de catálogo + comentario con el que el comercial explica una visita no realizada |
| **Cobertura** | Proporción de tiendas visitadas respecto a las planificadas en un periodo |
| **Facing** | Número de unidades de producto visibles de frente en el lineal |
| **PLV** | Publicidad en el lugar de venta — expositores, carteles, material promocional |
| **Contenido configurable** | Datos que introduce el administrador y que son traducibles (checklists, categorías, tipos de tienda) |
| **PWA** | Progressive Web App — aplicación web instalable con capacidades offline |
| **Backoffice** | Panel web de gestión para supervisores y administradores |
