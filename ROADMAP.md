# ROADMAP — Sales Watcher

Checklist de fases del proyecto. Marcar según avance.
Detalle funcional en [SPECS.md](SPECS.md) · Notas y decisiones en [ANEXO.md](ANEXO.md)

**Leyenda:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho

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

## Fase 6 — Rollout v1

- [ ] Carga del catálogo completo de tiendas
- [ ] Catálogos definitivos de categorías y motivos, sustituyendo placeholders
- [ ] Traducciones completas revisadas
- [ ] Alta de todos los comerciales y zonas
- [ ] Formación a supervisores
- [ ] Despliegue a producción
- [ ] Monitorización activa las primeras semanas

---

## Fase 7 — Post-MVP

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
