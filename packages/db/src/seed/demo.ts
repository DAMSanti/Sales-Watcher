import type { Idioma, TextoI18n } from "@sw/shared";

/**
 * Datos de demostración: zonas, usuarios y tiendas.
 *
 * ⚠️ Todo esto es PLACEHOLDER hasta que llegue el catálogo real. La gestión de
 * tiendas es manual en v1 y se espera migrar a ERP más adelante, así que las
 * fichas se marcan con `origen: "manual"` y sin `idExterno`: cuando llegue la
 * sincronización, distinguir lo cargado a mano de lo que viene del ERP será
 * justo lo que haga falta (ANEXO, decisión que cierra P2).
 *
 * ⚠️ Las contraseñas de este fichero son de DESARROLLO. El seed se niega a
 * ejecutarse contra NODE_ENV=production precisamente por esto.
 */

export const PASSWORD_DEMO = "SalesWatcher2026!";

type SemillaZona = {
  codigo: string;
  nombre: TextoI18n;
  region: string;
  zonaHoraria: string;
};

/**
 * Zona comercial de esta versión inicial.
 *
 * **Una sola zona que cubre Granada y Almería**, porque una zona es el
 * territorio de un FSM y el FSM del cliente gestiona ambas provincias. Modelar
 * una zona por provincia obligaba a partir en dos a un responsable que es uno
 * solo, o a inventar un alcance multi-zona que nada más necesita.
 *
 * Consecuencia que conviene tener presente: **la provincia deja de ser un eje
 * de agrupación propio**. Para segmentar informes por provincia se usa la
 * localidad o el código postal de la tienda (18xxx Granada, 04xxx Almería), que
 * es un dato que ya existe y no hay que mantener aparte. Si algún día hicieran
 * falta dos FSM, se parte la zona en dos y las tiendas se reasignan.
 *
 * Peninsular, así que el cierre de jornada es de huso único; el mecanismo por
 * zona sigue construido y no estorba.
 *
 * ⚠️ Otra consecuencia: al quedar la operación en dos provincias andaluzas,
 * **el euskera y el catalán se quedan sin hablantes en esta versión**. La
 * infraestructura de cinco idiomas sigue siendo correcta y la operación puede
 * crecer, pero la revisión nativa del euskera deja de ser urgente.
 */
export const ZONAS: SemillaZona[] = [
  {
    codigo: "gra-alm",
    region: "Andalucía Oriental",
    zonaHoraria: "Europe/Madrid",
    nombre: {
      es: "Granada y Almería",
      eu: "Granada eta Almeria",
      ca: "Granada i Almeria",
      fr: "Grenade et Almería",
      en: "Granada and Almeria",
    },
  },
];

type SemillaUsuario = {
  numeroTrabajador: string;
  nombre: string;
  rol: "comercial" | "supervisor" | "administrador";
  zonaCodigo: string | null;
  idiomaPreferido: Idioma;
  email?: string;
};

/**
 * Usuarios de demostración.
 *
 * Los idiomas preferidos están repartidos a conciencia: si todos los usuarios
 * de prueba fueran castellanohablantes, el desbordamiento de texto en euskera
 * y francés no se vería hasta el rollout (ANEXO §3).
 */
export const USUARIOS: SemillaUsuario[] = [
  {
    numeroTrabajador: "10000",
    nombre: "Administración Sales Watcher",
    rol: "administrador",
    zonaCodigo: null,
    idiomaPreferido: "es",
    email: "admin@example.invalid",
  },

  // ── FSM (supervisor) ─────────────────────────────────────────────────
  //
  // Uno solo, como describe el cliente: gestiona Granada y Almería, que son una
  // única zona precisamente por eso.
  {
    numeroTrabajador: "20001",
    nombre: "FSM Granada y Almería",
    rol: "supervisor",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "es",
  },

  // ── GPVs, repartidos entre los dos canales ───────────────────────────
  //
  // Los idiomas preferidos se mantienen variados a propósito. No es que haya
  // GPVs catalanohablantes en Granada: es que el idioma es una preferencia de
  // interfaz por usuario, independiente de la zona (decisión que cierra P13), y
  // el juego de datos tiene que seguir ejercitando los cinco idiomas.
  {
    numeroTrabajador: "30001",
    nombre: "GPV Granada Modern",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "es",
  },
  {
    numeroTrabajador: "30002",
    nombre: "GPV Granada Proximity",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "ca",
  },
  {
    numeroTrabajador: "30003",
    nombre: "GPV Granada Costa",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "es",
  },
  {
    numeroTrabajador: "30004",
    nombre: "GPV Almería Modern",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "en",
  },
  {
    numeroTrabajador: "30005",
    nombre: "GPV Almería Proximity",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "fr",
  },
  {
    numeroTrabajador: "30006",
    nombre: "GPV Almería Poniente",
    rol: "comercial",
    zonaCodigo: "gra-alm",
    idiomaPreferido: "eu",
  },
];

type SemillaTienda = {
  /** Código Danone del punto de venta. Empieza por 350 y es lo que teclea el GPV. */
  numeroReferencia: string;
  nombre: string;
  direccion: string;
  localidad: string;
  codigoPostal: string;
  zonaCodigo: string;
  tipoTiendaCodigo: string;
  /** Modern (gran superficie) o Proximity (proximidad). Solo dato: no bifurca flujos. */
  canal: "modern" | "proximity";
  lat: number;
  lon: number;
};

/**
 * Tiendas de Granada y Almería con coordenadas reales aproximadas.
 *
 * Los códigos siguen el formato del cliente: **empiezan por `350…`**, que es lo
 * que el GPV teclea para iniciar la visita (SPECS §5.3). Los nombres son
 * ficticios; las coordenadas no, porque sin ellas no se puede probar la
 * comparación entre el check-in del GPV y la ubicación registrada, que es la
 * señal de alerta al FSM.
 */
export const TIENDAS: SemillaTienda[] = [
  // ── Granada ──────────────────────────────────────────────────────────
  { numeroReferencia: "350100101", nombre: "Hiper Granada Nevada", direccion: "Av. de Europa 12", localidad: "Armilla", codigoPostal: "18100", zonaCodigo: "gra-alm", tipoTiendaCodigo: "hipermercado", canal: "modern", lat: 37.1440, lon: -3.6270 },
  { numeroReferencia: "350100102", nombre: "Super Camino de Ronda", direccion: "Camino de Ronda 110", localidad: "Granada", codigoPostal: "18003", zonaCodigo: "gra-alm", tipoTiendaCodigo: "supermercado", canal: "modern", lat: 37.1760, lon: -3.6050 },
  { numeroReferencia: "350100103", nombre: "Proximidad Realejo", direccion: "Calle Molinos 25", localidad: "Granada", codigoPostal: "18009", zonaCodigo: "gra-alm", tipoTiendaCodigo: "proximidad", canal: "proximity", lat: 37.1710, lon: -3.5920 },
  { numeroReferencia: "350100104", nombre: "Autoservicio Albaicín", direccion: "Calle Elvira 88", localidad: "Granada", codigoPostal: "18010", zonaCodigo: "gra-alm", tipoTiendaCodigo: "autoservicio", canal: "proximity", lat: 37.1795, lon: -3.5975 },
  { numeroReferencia: "350100105", nombre: "Super Motril Costa", direccion: "Av. Salobreña 30", localidad: "Motril", codigoPostal: "18600", zonaCodigo: "gra-alm", tipoTiendaCodigo: "supermercado", canal: "modern", lat: 36.7500, lon: -3.5200 },
  { numeroReferencia: "350100106", nombre: "Tienda Baza Centro", direccion: "Calle Mayor 4", localidad: "Baza", codigoPostal: "18800", zonaCodigo: "gra-alm", tipoTiendaCodigo: "tradicional", canal: "proximity", lat: 37.4900, lon: -2.7700 },

  // ── Almería ──────────────────────────────────────────────────────────
  { numeroReferencia: "350200201", nombre: "Hiper Almería Mediterráneo", direccion: "Av. del Mediterráneo 200", localidad: "Almería", codigoPostal: "04007", zonaCodigo: "gra-alm", tipoTiendaCodigo: "hipermercado", canal: "modern", lat: 36.8390, lon: -2.4530 },
  { numeroReferencia: "350200202", nombre: "Super Zapillo", direccion: "Calle Poeta Paco Aquino 15", localidad: "Almería", codigoPostal: "04007", zonaCodigo: "gra-alm", tipoTiendaCodigo: "supermercado", canal: "modern", lat: 36.8340, lon: -2.4470 },
  { numeroReferencia: "350200203", nombre: "Proximidad Cabo de Gata", direccion: "Carretera de Cabo de Gata 40", localidad: "Almería", codigoPostal: "04007", zonaCodigo: "gra-alm", tipoTiendaCodigo: "proximidad", canal: "proximity", lat: 36.8180, lon: -2.4300 },
  { numeroReferencia: "350200204", nombre: "Super El Ejido", direccion: "Av. Oasis 60", localidad: "El Ejido", codigoPostal: "04700", zonaCodigo: "gra-alm", tipoTiendaCodigo: "supermercado", canal: "modern", lat: 36.7760, lon: -2.8150 },
  { numeroReferencia: "350200205", nombre: "Tienda Roquetas Centro", direccion: "Calle Juan Bonachera 8", localidad: "Roquetas de Mar", codigoPostal: "04740", zonaCodigo: "gra-alm", tipoTiendaCodigo: "tradicional", canal: "proximity", lat: 36.7640, lon: -2.6150 },
  { numeroReferencia: "350200206", nombre: "Autoservicio Adra", direccion: "Calle Natalio Rivas 22", localidad: "Adra", codigoPostal: "04770", zonaCodigo: "gra-alm", tipoTiendaCodigo: "autoservicio", canal: "proximity", lat: 36.7480, lon: -3.0200 },
];
