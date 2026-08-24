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
 * Zonas comerciales.
 *
 * Incluyen País Vasco y Cataluña a propósito: son las que justifican el
 * euskera y el catalán, y las que hacen que el calendario de festivos
 * regionales sea un problema real y no teórico (ANEXO §3).
 */
export const ZONAS: SemillaZona[] = [
  {
    codigo: "cat",
    region: "Cataluña",
    zonaHoraria: "Europe/Madrid",
    nombre: {
      es: "Cataluña",
      eu: "Katalunia",
      ca: "Catalunya",
      fr: "Catalogne",
      en: "Catalonia",
    },
  },
  {
    codigo: "pv",
    region: "País Vasco",
    zonaHoraria: "Europe/Madrid",
    nombre: {
      es: "País Vasco",
      eu: "Euskadi",
      ca: "País Basc",
      fr: "Pays basque",
      en: "Basque Country",
    },
  },
  {
    codigo: "mad",
    region: "Madrid",
    zonaHoraria: "Europe/Madrid",
    nombre: {
      es: "Madrid",
      eu: "Madril",
      ca: "Madrid",
      fr: "Madrid",
      en: "Madrid",
    },
  },
  {
    codigo: "lev",
    region: "Levante",
    zonaHoraria: "Europe/Madrid",
    nombre: {
      es: "Levante",
      eu: "Levante",
      ca: "Llevant",
      fr: "Levant",
      en: "Levante",
    },
  },
  {
    /**
     * Canarias está aquí para que el segundo huso horario exista en desarrollo.
     * Si no hay comerciales reales en Canarias (P17, sin confirmar), sobra;
     * pero teniéndola, el proceso de cierre de jornada se prueba de verdad en
     * lugar de asumir huso único y descubrir el fallo en producción.
     */
    codigo: "can",
    region: "Canarias",
    zonaHoraria: "Atlantic/Canary",
    nombre: {
      es: "Canarias",
      eu: "Kanariak",
      ca: "Canàries",
      fr: "Canaries",
      en: "Canary Islands",
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
  {
    numeroTrabajador: "20001",
    nombre: "Supervisora Cataluña",
    rol: "supervisor",
    zonaCodigo: "cat",
    idiomaPreferido: "ca",
  },
  {
    numeroTrabajador: "20002",
    nombre: "Supervisor País Vasco",
    rol: "supervisor",
    zonaCodigo: "pv",
    idiomaPreferido: "eu",
  },
  {
    numeroTrabajador: "30001",
    nombre: "Comercial Barcelona Nord",
    rol: "comercial",
    zonaCodigo: "cat",
    idiomaPreferido: "ca",
  },
  {
    numeroTrabajador: "30002",
    nombre: "Comercial Bilbao",
    rol: "comercial",
    zonaCodigo: "pv",
    idiomaPreferido: "eu",
  },
  {
    numeroTrabajador: "30003",
    nombre: "Comercial Madrid Centro",
    rol: "comercial",
    zonaCodigo: "mad",
    idiomaPreferido: "es",
  },
  {
    numeroTrabajador: "30004",
    nombre: "Comercial Valencia",
    rol: "comercial",
    zonaCodigo: "lev",
    idiomaPreferido: "es",
  },
  {
    // Idioma minoritario en la operación, pero presente: fuerza a que la
    // interfaz en francés se pruebe con un usuario real y no solo en QA.
    numeroTrabajador: "30005",
    nombre: "Comercial Las Palmas",
    rol: "comercial",
    zonaCodigo: "can",
    idiomaPreferido: "fr",
  },
];

type SemillaTienda = {
  numeroReferencia: string;
  nombre: string;
  direccion: string;
  localidad: string;
  codigoPostal: string;
  zonaCodigo: string;
  tipoTiendaCodigo: string;
  lat: number;
  lon: number;
};

/**
 * Tiendas placeholder con coordenadas reales aproximadas de cada localidad.
 *
 * Las coordenadas importan aunque las tiendas sean ficticias: sin ellas no se
 * puede probar la comparación entre el check-in del comercial y la ubicación
 * registrada, que es la señal de alerta al supervisor (SPECS §11).
 */
export const TIENDAS: SemillaTienda[] = [
  // Cataluña
  { numeroReferencia: "CAT-0101", nombre: "Hiper Diagonal", direccion: "Av. Diagonal 555", localidad: "Barcelona", codigoPostal: "08029", zonaCodigo: "cat", tipoTiendaCodigo: "hipermercado", lat: 41.3915, lon: 2.1385 },
  { numeroReferencia: "CAT-0102", nombre: "Super Gràcia", direccion: "Carrer Gran de Gràcia 120", localidad: "Barcelona", codigoPostal: "08012", zonaCodigo: "cat", tipoTiendaCodigo: "supermercado", lat: 41.4045, lon: 2.1540 },
  { numeroReferencia: "CAT-0103", nombre: "Proximitat Sants", direccion: "Carrer de Sants 200", localidad: "Barcelona", codigoPostal: "08028", zonaCodigo: "cat", tipoTiendaCodigo: "proximidad", lat: 41.3752, lon: 2.1320 },
  { numeroReferencia: "CAT-0104", nombre: "Botiga Sabadell Centre", direccion: "Rambla 45", localidad: "Sabadell", codigoPostal: "08201", zonaCodigo: "cat", tipoTiendaCodigo: "tradicional", lat: 41.5463, lon: 2.1086 },

  // País Vasco
  { numeroReferencia: "PV-0201", nombre: "Hiper Bilbao Abando", direccion: "Gran Vía 40", localidad: "Bilbao", codigoPostal: "48009", zonaCodigo: "pv", tipoTiendaCodigo: "hipermercado", lat: 43.2620, lon: -2.9350 },
  { numeroReferencia: "PV-0202", nombre: "Super Deusto", direccion: "Avenida Lehendakari Aguirre 15", localidad: "Bilbao", codigoPostal: "48014", zonaCodigo: "pv", tipoTiendaCodigo: "supermercado", lat: 43.2710, lon: -2.9480 },
  { numeroReferencia: "PV-0203", nombre: "Denda Donostia Gros", direccion: "Zabaleta kalea 30", localidad: "Donostia", codigoPostal: "20002", zonaCodigo: "pv", tipoTiendaCodigo: "proximidad", lat: 43.3220, lon: -1.9760 },
  { numeroReferencia: "PV-0204", nombre: "Autoservicio Vitoria Sur", direccion: "Calle Portal de Castilla 22", localidad: "Vitoria-Gasteiz", codigoPostal: "01007", zonaCodigo: "pv", tipoTiendaCodigo: "autoservicio", lat: 42.8420, lon: -2.6840 },

  // Madrid
  { numeroReferencia: "MAD-0301", nombre: "Hiper Chamartín", direccion: "Calle Mauricio Legendre 8", localidad: "Madrid", codigoPostal: "28046", zonaCodigo: "mad", tipoTiendaCodigo: "hipermercado", lat: 40.4700, lon: -3.6870 },
  { numeroReferencia: "MAD-0302", nombre: "Super Malasaña", direccion: "Calle Fuencarral 90", localidad: "Madrid", codigoPostal: "28004", zonaCodigo: "mad", tipoTiendaCodigo: "supermercado", lat: 40.4270, lon: -3.7020 },
  { numeroReferencia: "MAD-0303", nombre: "Proximidad Chueca", direccion: "Calle Hortaleza 55", localidad: "Madrid", codigoPostal: "28004", zonaCodigo: "mad", tipoTiendaCodigo: "proximidad", lat: 40.4235, lon: -3.6990 },

  // Levante
  { numeroReferencia: "LEV-0401", nombre: "Hiper València Nord", direccion: "Avinguda de les Corts Valencianes 50", localidad: "València", codigoPostal: "46015", zonaCodigo: "lev", tipoTiendaCodigo: "hipermercado", lat: 39.4880, lon: -0.3960 },
  { numeroReferencia: "LEV-0402", nombre: "Super Ruzafa", direccion: "Carrer de Cuba 30", localidad: "València", codigoPostal: "46006", zonaCodigo: "lev", tipoTiendaCodigo: "supermercado", lat: 39.4610, lon: -0.3760 },
  { numeroReferencia: "LEV-0403", nombre: "Tienda Alicante Centro", direccion: "Calle Mayor 12", localidad: "Alicante", codigoPostal: "03002", zonaCodigo: "lev", tipoTiendaCodigo: "tradicional", lat: 38.3450, lon: -0.4810 },

  // Canarias
  { numeroReferencia: "CAN-0501", nombre: "Hiper Las Palmas Puerto", direccion: "Calle Albareda 40", localidad: "Las Palmas de Gran Canaria", codigoPostal: "35008", zonaCodigo: "can", tipoTiendaCodigo: "hipermercado", lat: 28.1360, lon: -15.4300 },
  { numeroReferencia: "CAN-0502", nombre: "Super Triana", direccion: "Calle Triana 80", localidad: "Las Palmas de Gran Canaria", codigoPostal: "35002", zonaCodigo: "can", tipoTiendaCodigo: "supermercado", lat: 28.1010, lon: -15.4160 },
];
