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

### Boceto funcional del cliente — ronda 4

> Documento recibido: *«Primer boceto funcional — Aplicación de gestión y rentabilidad de visitas GPV»*, 17 páginas, en la raíz del repositorio. Incorporado a [SPECS.md](SPECS.md) v0.5 el 2026-08-25.

### 2026-08-25 — El producto se reencuadra: de registro de actividad a gestión de acciones

El boceto **no es un incremento sobre la v0.4; cambia el propósito**. La v0.4 construía un sistema para saber *qué hizo el comercial*. El boceto pide un sistema para saber *qué se detectó, quién actuó y qué resultado hubo*.

El ciclo que hay que soportar es **VISITA → DETECCIÓN → ACCIÓN → SEGUIMIENTO → RESULTADO**, y la frase que mejor resume la diferencia es del propio cliente: el objetivo es pasar de *«el GPV ha estado en la tienda»* a *«el GPV ha detectado, ha actuado, ha generado acciones para quien debía intervenir, y la compañía puede comprobar el resultado»*.

**Por qué importa reconocerlo como reencuadre y no como lista de funcionalidades nuevas:** si se tratara como una tanda de pantallas adicionales, acabaríamos con las dos aplicaciones a la vez — el checklist de la v0.4 conviviendo con los flujos del boceto — y el resultado sería exactamente el cuestionario largo que el cliente pide evitar.

### 2026-08-25 — La aplicación no duplica la herramienta de auditoría existente

El cliente ya tiene una aplicación que comprueba presencia de producto, implantaciones y promociones. El boceto es explícito: *«no queremos duplicar esa funcionalidad»* y *«no queremos crear otro cuestionario»*.

**Consecuencia directa sobre lo construido:** el checklist configurable es hoy el núcleo de la visita en la app de campo, y ese enfoque queda desautorizado. No se retira nada todavía —la decisión es del cliente (P19)—, pero deja de ser el centro del diseño.

También afecta a Top Picos: la base de datos de qué referencias son Top Pico en cada tienda **ya existe en otra aplicación**. Aquí solo se registran las que faltan y su seguimiento. Replicar ese catálogo sería crear una segunda fuente de verdad que se desincronizaría en semanas.

### 2026-08-25 — La regla de diseño principal: quién puede resolverlo

> Si el GPV puede solucionarlo, la aplicación le pide que actúe.
> Si el GPV no puede solucionarlo, la aplicación genera una acción para la persona responsable.

El reparto no es arbitrario: **en Dairy hay un reponedor de Danone** y el GPV no le da instrucciones directamente, así que las incidencias escalan al FSM, que habla con el reponedor. **En Waters y PBB no hay reponedor propio**, y el GPV actúa por sí mismo o negocia con el encargado del establecimiento.

**Decisión técnica derivada: `responsable_actuar` se calcula en el servidor**, no lo elige el GPV. Si fuera una elección del usuario, la misma situación escalaría de forma distinta según quién la registrase, y los agregados del dashboard dejarían de ser comparables. Es una regla de negocio, y las reglas de negocio no se ponen en un desplegable.

**Consecuencia de interfaz:** la cadena GPV → FSM → reponedor debe respetarse también visualmente. Mostrar al GPV que «se ha avisado al reponedor» crearía una expectativa de notificación que el sistema no cumple, porque el reponedor no es usuario del sistema.

### 2026-08-25 — Lo detectado sobrevive a la visita

La que el propio boceto llama la funcionalidad más importante: una incidencia u oportunidad **no desaparece al cerrar la visita**; queda abierta hasta que hay resultado, y reaparece en la siguiente visita a esa tienda para que el GPV se pronuncie.

**Consecuencias sobre el modelo:**

- La **acción pertenece a la tienda**, no a la visita. La visita es solo el momento en que se detectó o se comprobó. Colgar la acción de la visita —que es lo natural si se piensa en pantallas— haría el seguimiento entre visitas artificialmente difícil.
- Cada comprobación es un **evento con fecha**, no una sobreescritura del estado. Guardar solo el último estado impediría responder *cuánto tardó en resolverse*, que es una de las preguntas explícitas del dashboard.
- El cliente dice que el seguimiento se aplicará **progresivamente** a los distintos tipos de acción. El modelo de datos, sin embargo, conviene que lo admita desde el principio: incorporarlo después obliga a migrar histórico.

### 2026-08-25 — Sin mínimos obligatorios para cerrar una visita

En el MVP el GPV puede iniciar y finalizar visitas libremente. El cliente todavía está definiendo qué comportamientos mínimos quiere exigir.

Es una decisión consciente y temporal, y merece la pena registrarla como tal: el flag `incompleta` que ya existe en el modelo **queda sin uso**, pero no se elimina, precisamente porque el cliente anticipa que habrá mínimos más adelante.

Lo que sí se exige antes de cerrar es un **resumen de lo registrado**. No es decorativo: es la última oportunidad de corregir un error antes de que la visita quede inmutable.

### 2026-08-25 — El tiempo de permanencia se registra pero no se muestra · ⚠️ revierte parte de la v0.4

El boceto es cuidadoso aquí: la aplicación *podrá* registrar inicio y cierre, pero *«en esta primera fase no se plantea utilizar el tiempo de permanencia como una métrica visible o como mecanismo de control del GPV»*, y condiciona su uso futuro a una **revisión previa de los aspectos legales**.

**Esto revierte decisiones de la v0.4**, que incluía la duración en el detalle de visita del backoffice y la duración media en los informes. Ambas deben ocultarse.

Encaja además con el riesgo de percepción de vigilancia que ya estaba registrado, y con P18 (art. 90 LOPDGDD): el cliente está siendo prudente en la misma dirección que ya apuntaba el análisis.

### 2026-08-25 — El vídeo entra como evidencia

Nuevo respecto a la v0.4, que solo contemplaba fotografía. **No es una extensión trivial**: una foto comprimida ronda los 250 KB y un vídeo de móvil son decenas de megabytes. Afecta al límite por evidencia (hoy 5 MB), al coste de almacenamiento, a la caducidad de la URL de subida, al espacio que la cola offline ocupa en el dispositivo, y multiplica el peso de la retención sin decidir (P7).

Los límites concretos están sin definir (P20), y sin ellos no se puede dimensionar nada.

### 2026-08-25 — Contexto real de operación

El boceto aporta los primeros datos reales, que hasta ahora eran placeholder:

- **Jerarquía:** RSM → FSM → GPV → puntos de venta.
- **Geografía:** el FSM de referencia gestiona **Granada y Almería**.
- **Canales:** **Modern** y **Proximity**.
- **Código de punto de venta:** empieza por **`350…`**, asociado a un nombre de tienda. Es lo que el GPV teclea para iniciar la visita, y corresponde al `numero_referencia` que ya existe en el modelo.
- **Categorías de producto:** Dairy, Waters y PBB.
- **Marcas citadas:** Activia, Alpro, Actimel — como ejemplos, no como catálogo cerrado (P22).

---

## 1-bis. Impacto sobre lo ya construido

Balance honesto tras leer el boceto. Es la información más útil para decidir qué hacer a continuación, y conviene tenerla escrita antes de tocar código.

### Sobrevive intacto — toda la infraestructura

Nada de esto depende del reencuadre, porque es fontanería y no producto:

- Autenticación, roles, JWT, política de contraseñas, bloqueo por intentos.
- Cola offline, idempotencia por `opId`, sincronización por lotes.
- Infraestructura de i18n: cinco locales, cadena de respaldo, negociación de idioma.
- Almacenamiento de objetos con URLs firmadas, y el mecanismo de retención y purga.
- Catálogo de tiendas, importación CSV, preparación para ERP.
- Marcas de tiempo en UTC, cierre de jornada por zona, auditoría.
- Estructura del monorepo, CI, esqueleto PWA y del backoffice.

### Sobrevive con cambios

| Pieza | Qué cambia |
|---|---|
| Ciclo de vida de la visita | Los cuatro estados siguen valiendo; `incompleta` queda sin uso (sin mínimos en MVP) |
| Rutas diarias | Siguen siendo la referencia de cobertura, pero la entrada a la visita pasa a ser por código de tienda (P28) |
| Incidencias | El modelo genérico *categoría + descripción* se queda corto: los flujos del boceto están tipificados y el dashboard agrega por campos concretos |
| Detalle de visita en backoffice | Debe **ocultar la duración**; el contenido pasa a organizarse por categoría de producto |
| Informes | Desaparece la duración media; entran las métricas de resultado |
| Roles | Se añade `rsm` (alcance pendiente, P21) |
| Tienda | Se añade `canal` (Modern / Proximity) |

### Queda desautorizado como núcleo

- **El checklist configurable.** La maquinaria funciona y está probada, pero el enfoque de cuestionario es justo lo que el cliente pide evitar. Decisión pendiente (P19): retirarlo, o reutilizar las plantillas como mecanismo de configuración de los flujos.
- **La duración como métrica**, por la razón legal de arriba.

### Es enteramente nuevo

Acciones con ciclo de vida propio · comprobaciones entre visitas · Top Picos pendientes · facings ganados como resultado acumulable · extraespacios · neveras con código · visibilidad · reorganización · relación con el responsable · panel de acciones pendientes del FSM · dashboard de resultados · vídeo.

### Lectura del balance

**La fase 1 y la fase 2 aguantan bien**: lo construido ahí es infraestructura y sigue siendo válido. **La fase 3 es la más afectada**, porque la pantalla de visita se rehace casi entera. **La fase 4 se amplía** más que se rehace: el backoffice existente sigue sirviendo para la gestión maestra, y lo nuevo —panel del FSM y dashboard de resultados— se añade al lado.

Dicho de otro modo: se conserva casi todo lo que costó tiempo construir bien (offline, i18n, auth, almacenamiento) y se rehace la capa que siempre iba a depender de lo que el cliente decidiera. Es el reparto afortunado, no el contrario.

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

**Derivadas del boceto funcional (ronda 4).** Ordenadas por lo que bloquean:

| # | Pregunta | Bloquea | Estado |
|---|---|---|---|
| 19 | ¿Qué se hace con el checklist ya construido: se retira o se reutiliza para configurar los flujos? | **Alcance de la fase 3** — es la pieza más afectada | **Abierta — la más urgente** |
| 20 | ¿Qué límites tiene el vídeo (duración, formato, resolución, compresión en dispositivo)? | Dimensionado de almacenamiento y comportamiento de la cola offline | **Abierta** |
| 22 | ¿Cuál es el catálogo de marcas/segmentos? | Flujos de facings y visibilidad | **Abierta** — el boceto solo da ejemplos |
| 23 | ¿Quién cierra una acción (GPV en la siguiente visita, FSM desde el panel, ambos), y caduca? | Ciclo de vida de la acción | **Abierta** |
| 25 | ¿La referencia de Top Pico es texto libre o catálogo? | Seguimiento entre visitas | **Abierta** — ver nota |
| 21 | ¿El RSM es un rol con acceso propio o solo un nivel organizativo? | Si hay una cuarta vista de backoffice | **Abierta** |
| 24 | ¿Se confirma el modelo de tabla por flujo frente a JSONB genérico? | Migraciones | **Abierta** — hay recomendación en SPECS 7.1 |
| 27 | ¿Modern y Proximity cambian los flujos o solo segmentan informes? | Diseño de los flujos | **Abierta** |
| 28 | ¿Se mantiene la ruta planificada si el GPV entra por código de tienda? | Métrica de cobertura | **Abierta** |
| 26 | ¿Todas las neveras tienen código visible? | Flujo de retirada | **Abierta** — menor |
| 29 | ¿Las zonas reales son solo Granada y Almería? | Datos de prueba y alta de zonas | **Abierta** — menor |
| 30 | ¿Cuándo se cierra la revisión legal del tiempo de permanencia? | Si la duración puede mostrarse alguna vez | **Abierta** — extensión de P18 |

**Nota sobre P25 (referencia de Top Pico).** El boceto la trata como texto que el GPV introduce («Referencia 1, Referencia 2…»), y eso encaja con no duplicar la base de datos de Top Picos que ya existe en otra aplicación. Pero el seguimiento entre visitas exige comparar *la misma referencia* a lo largo del tiempo, y con texto libre «Activia Natural 4x125» y «activia natural 4x125» son dos referencias distintas. Sin resolverlo, la funcionalidad que el cliente considera más importante se degrada sola. Las salidas razonables son un catálogo mínimo de referencias, o normalizar el texto y aceptar el margen de error — pero conviene elegir a conciencia, no por omisión.

**Nota sobre P19 (el checklist).** Es la pregunta que más trabajo desbloquea o desperdicia, y conviene plantearla al cliente en esos términos: la maquinaria de plantillas configurables está construida, probada y funcionando. Retirarla es perder trabajo hecho; mantenerla junto a los nuevos flujos es arriesgarse al cuestionario largo que el boceto quiere evitar. La tercera vía —usar las plantillas como mecanismo de configuración de los flujos tipificados, en lugar de como lista de tareas para el GPV— aprovecha lo construido sin contradecir el boceto, y es la que merece la pena explorar primero.

**Nota sobre P16.** Las traducciones iniciales están hechas (sección 4), pero el contenido configurable es *vivo*: el administrador añadirá categorías nuevas en producción. Sin un circuito definido, esas categorías saldrán solo en castellano y el resto de idiomas irá degradándose por acumulación. Conviene decidirlo antes del rollout, no después. La opción más barata es que el editor de traducciones del backoffice marque lo que falta y alguien lo revise periódicamente.

**Nota sobre la retención de fotos (P7):** posponerla es razonable, pero tiene un coste que conviene tener presente. Mientras no haya política, el sistema conserva indefinidamente, así que cuando se decida habrá que ejecutar un **borrado retroactivo** sobre fotos ya acumuladas — y si para entonces hay un año de operación, eso es mucho volumen y una conversación con legal. Lo barato es implementar el mecanismo de retención (un campo de fecha de expiración y un proceso de purga) aunque el plazo se configure más tarde. El mecanismo es el trabajo; el número es un parámetro.

### Preguntas cerradas

P1 (encargado), P2 (catálogo de tiendas), P3 (franja horaria), P4 (visita no realizada), P5 (multi-idioma), P6 (categorías → reconvertida en P10), P8 (contraseñas), P9 (set de idiomas), P12 (ventana de justificación), P13 (solo idioma de interfaz), P14 (`en-GB`), P15 (traducción inicial → deja abierta P16). Sus respuestas están en la sección 1.

---

## 3. Riesgos identificados

**Derivados del boceto funcional (2026-08-25):**

| Riesgo | Impacto | Mitigación prevista |
|---|---|---|
| **Las dos aplicaciones conviviendo** | **Alto — produce justo el cuestionario largo que el cliente quiere evitar** | Resolver P19 *antes* de construir los flujos nuevos. Si el checklist y los flujos tipificados se lanzan juntos «por si acaso», el GPV acaba respondiendo a ambos |
| **El panel del FSM se convierte en un cementerio de acciones** | Alto — si todo queda abierto para siempre, la lista deja de leerse y el seguimiento muere | Definir caducidad o escalado de acciones antiguas (P23); ordenar por antigüedad desde el primer día; el propio cliente pregunta *qué acciones llevan demasiado tiempo abiertas* |
| **El seguimiento se percibe como deuda acumulada del GPV** | Alto — reaparecer cada visita lo pendiente puede leerse como reproche, y el GPV deja de detectar para no acumular | Presentar lo pendiente como contexto útil, no como lista de deberes; medir y comunicar **detección** y **resultado** por separado, nunca solo lo segundo |
| **Facings autodeclarados sin verificación** | Medio — es la métrica más visible y la más fácil de inflar | Es una cifra declarada y conviene asumirlo: tratarla como indicador de tendencia, no como dato contable; contrastar en el piloto con revisión sobre el terreno |
| **Top Pico como texto libre rompe el seguimiento** | **Alto — degrada la funcionalidad que el cliente considera más importante** | Resolver P25: catálogo mínimo de referencias, o normalización explícita del texto asumiendo su margen de error |
| **El vídeo desborda almacenamiento y cola offline** | Alto — decenas de MB por evidencia frente a ~250 KB de una foto | Fijar límites antes de implementar (P20); compresión en dispositivo; revisar caducidad de la URL de subida y el espacio que la cola ocupa en el móvil |
| **La regla de responsable queda desactualizada** | Medio — si alguna tienda de Dairy no tiene reponedor, la incidencia escala a quien no puede resolverla | Mantener la regla en servidor y en un solo sitio, para poder corregirla sin tocar la app; revisar los supuestos en el piloto |
| **El registro de tiempo se usa antes de la revisión legal** | Medio — el dato existe en base de datos aunque no se muestre | Mantenerlo fuera de API, informes y exportaciones, no solo oculto en la interfaz; reabrir solo tras cerrar P30 |

**Riesgos previos, vigentes:**

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
| Checklist mal diseñado (genérico o demasiado largo) | Alto — el comercial lo completa mecánicamente y el dato pierde valor | *Condicionado a P19: el boceto sustituye el checklist por flujos tipificados. El riesgo se traslada a que los propios flujos crezcan hasta convertirse en el cuestionario que se quería evitar* |
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
| **Checklist template** | Plantilla de tareas configurable desde backoffice, asignable por tipo de tienda *(su continuidad depende de P19)* |

**Vocabulario del cliente (boceto funcional, 2026-08-25).** Conviene usarlo tal cual en la interfaz y en el código: es el idioma en el que el cliente piensa el problema.

| Término | Significado |
|---|---|
| **GPV** | Gestor del Punto de Venta. El usuario de campo. En el modelo de datos es el rol `comercial` |
| **FSM** | Field Sales Manager. Gestiona un equipo de GPVs y **recibe las acciones que el GPV no puede resolver**. Es el rol `supervisor` |
| **RSM** | Regional Sales Manager. Nivel por encima del FSM *(alcance de acceso pendiente, P21)* |
| **Reponedor** | Repone en Dairy. **No es usuario del sistema**: recibe instrucciones a través del FSM |
| **Responsable / encargado** | Interlocutor del GPV en la tienda. Destinatario de las gestiones de Waters y PBB. No es usuario del sistema |
| **Dairy** | Categoría de lácteos. La única con reponedor de Danone, lo que cambia quién actúa en casi todos sus flujos |
| **Waters** | Categoría de aguas |
| **PBB** | *Plant-Based & Beverages*. Categoría de vegetales y bebidas |
| **Modern** | Canal de gran superficie |
| **Proximity** | Canal de tienda de proximidad |
| **Top Pico** | Referencia que Danone considera prioritaria y que debería estar en el surtido de determinadas tiendas. Su catálogo vive en **otra aplicación**; aquí solo se registran las que faltan |
| **Facing** | Cada unidad de producto visible en el frente del lineal. Ganar facings es ganar presencia |
| **Extraespacio** | Punto de carga adicional fuera del lineal: cabecera, isla, pila o nevera |
| **Cabecera** | Expositor al final de un pasillo |
| **Isla** | Exposición exenta, accesible por todos los lados |
| **Pila** | Apilamiento de producto en el suelo de la sala |
| **Palomar** | Balda superior del lineal, por encima de la altura de los ojos. **Posición desfavorable** que conviene evitar |
| **Foso** | Balda inferior del lineal. También desfavorable |
| **Altura de ojos** | La mejor posición del lineal |
| **FIFO** | *First In, First Out*. Rotación correcta: lo que caduca antes se coloca delante |
| **Acción** | Lo detectado en una visita que **permanece abierto hasta tener resultado**. Pertenece a la tienda, no a la visita |
| **Hueco** | Espacio vacío en el lineal por rotura de stock. En Dairy debe cubrirse con una referencia Danone adyacente para que no lo gane la competencia |
| **Visita incompleta** | Visita finalizada con ítems obligatorios del checklist sin completar |
| **Visita no realizada** | Visita planificada que no se hizo; exige justificación del comercial |
| **Justificación** | Motivo de catálogo + comentario con el que el comercial explica una visita no realizada |
| **Cobertura** | Proporción de tiendas visitadas respecto a las planificadas en un periodo |
| **Facing** | Número de unidades de producto visibles de frente en el lineal |
| **PLV** | Publicidad en el lugar de venta — expositores, carteles, material promocional |
| **Contenido configurable** | Datos que introduce el administrador y que son traducibles (checklists, categorías, tipos de tienda) |
| **PWA** | Progressive Web App — aplicación web instalable con capacidades offline |
| **Backoffice** | Panel web de gestión para supervisores y administradores |
