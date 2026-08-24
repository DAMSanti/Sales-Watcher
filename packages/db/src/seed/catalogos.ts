import type { TextoI18n } from "@sw/shared";

/**
 * Datos semilla de los catálogos configurables.
 *
 * ⚠️ Son PLACEHOLDERS. El catálogo definitivo está en negociación con el
 * cliente y va a cambiar (ANEXO §4). Por eso todo esto es dato y no código:
 * el administrador podrá editarlo desde el backoffice sin desplegar.
 *
 * ⚠️ Las traducciones al euskera necesitan revisión de un hablante nativo
 * antes del rollout. La terminología de gran consumo (facing, lineal, cabecera
 * de góndola) admite préstamos y términos normalizados, y la elección correcta
 * depende del uso real del sector. Un catálogo mal traducido se rellena mal.
 */

type SemillaCategoria = {
  codigo: string;
  tipo: "incidencia" | "oportunidad";
  prioridadDefecto: "baja" | "media" | "alta" | "critica";
  nombre: TextoI18n;
};

export const CATEGORIAS: SemillaCategoria[] = [
  // ── Oportunidades ────────────────────────────────────────────────
  {
    codigo: "op_espacio_nevera",
    tipo: "oportunidad",
    prioridadDefecto: "alta",
    nombre: {
      es: "Espacio disponible para nevera de producto",
      eu: "Produktu-hozkailua jartzeko lekua",
      ca: "Espai disponible per a nevera de producte",
      fr: "Emplacement disponible pour un réfrigérateur produit",
      en: "Space available for product fridge",
    },
  },
  {
    codigo: "op_visibilidad_lineal",
    tipo: "oportunidad",
    prioridadDefecto: "media",
    nombre: {
      es: "Cambio de visibilidad en el lineal por nueva información de producto",
      eu: "Apalategiko ikusgaitasun-aldaketa produktuaren informazio berriagatik",
      ca: "Canvi de visibilitat al lineal per nova informació de producte",
      fr: "Changement de visibilité en linéaire suite à une nouvelle information produit",
      en: "Shelf visibility change due to new product information",
    },
  },
  {
    codigo: "op_ampliar_facings",
    tipo: "oportunidad",
    prioridadDefecto: "media",
    nombre: {
      es: "Posibilidad de ampliar facings / metros de lineal",
      eu: "Facing edo apalategi-metro gehiago lortzeko aukera",
      ca: "Possibilitat d'ampliar facings / metres de lineal",
      fr: "Possibilité d'augmenter les facings / mètres linéaires",
      en: "Opportunity to increase facings / shelf space",
    },
  },
  {
    codigo: "op_espacio_plv",
    tipo: "oportunidad",
    prioridadDefecto: "media",
    nombre: {
      es: "Espacio para expositor o material promocional (PLV)",
      eu: "Erakusleku edo material promozionalerako lekua",
      ca: "Espai per a expositor o material promocional (PLV)",
      fr: "Emplacement pour présentoir ou PLV",
      en: "Space for display unit or point-of-sale material",
    },
  },
  {
    codigo: "op_interes_referencia",
    tipo: "oportunidad",
    prioridadDefecto: "media",
    nombre: {
      es: "Interés del encargado en referencia nueva",
      eu: "Arduradunak erreferentzia berrian interesa",
      ca: "Interès del responsable en una referència nova",
      fr: "Intérêt du responsable pour une nouvelle référence",
      en: "Store manager interested in new product line",
    },
  },
  {
    codigo: "op_ubicacion_secundaria",
    tipo: "oportunidad",
    prioridadDefecto: "alta",
    nombre: {
      es: "Ubicación secundaria disponible (cabecera, isla, zona de caja)",
      eu: "Bigarren mailako kokaleku eskuragarria (buru-apala, uhartea, kutxa-gunea)",
      ca: "Ubicació secundària disponible (capçalera, illa, zona de caixa)",
      fr: "Emplacement secondaire disponible (tête de gondole, îlot, zone caisse)",
      en: "Secondary placement available (gondola end, island, checkout area)",
    },
  },

  // ── Incidencias ──────────────────────────────────────────────────
  {
    codigo: "inc_rotura_stock",
    tipo: "incidencia",
    prioridadDefecto: "alta",
    nombre: {
      es: "Rotura de stock",
      eu: "Stock-haustura",
      ca: "Ruptura d'estoc",
      fr: "Rupture de stock",
      en: "Out of stock",
    },
  },
  {
    codigo: "inc_mal_colocado",
    tipo: "incidencia",
    prioridadDefecto: "media",
    nombre: {
      es: "Producto mal colocado o fuera de su sitio",
      eu: "Produktua gaizki kokatuta edo bere lekutik kanpo",
      ca: "Producte mal col·locat o fora del seu lloc",
      fr: "Produit mal implanté ou hors de son emplacement",
      en: "Product misplaced or out of position",
    },
  },
  {
    codigo: "inc_precio_incorrecto",
    tipo: "incidencia",
    prioridadDefecto: "alta",
    nombre: {
      es: "Precio incorrecto en tienda",
      eu: "Prezio okerra dendan",
      ca: "Preu incorrecte a la botiga",
      fr: "Prix incorrect en magasin",
      en: "Incorrect price in store",
    },
  },
  {
    codigo: "inc_caducidad",
    tipo: "incidencia",
    // Producto fresco: la caducidad no admite demora.
    prioridadDefecto: "critica",
    nombre: {
      es: "Producto próximo a caducar o caducado",
      eu: "Iraungitzear dagoen edo iraungitako produktua",
      ca: "Producte pròxim a caducar o caducat",
      fr: "Produit proche de la date limite ou périmé",
      en: "Product near expiry or expired",
    },
  },
  {
    codigo: "inc_cadena_frio",
    tipo: "incidencia",
    prioridadDefecto: "critica",
    nombre: {
      es: "Problema de cadena de frío",
      eu: "Hotz-katearen arazoa",
      ca: "Problema de cadena de fred",
      fr: "Problème de chaîne du froid",
      en: "Cold chain issue",
    },
  },
  {
    codigo: "inc_plv_deteriorado",
    tipo: "incidencia",
    prioridadDefecto: "baja",
    nombre: {
      es: "Material promocional deteriorado o ausente",
      eu: "Material promozionala hondatuta edo faltan",
      ca: "Material promocional deteriorat o absent",
      fr: "PLV détériorée ou absente",
      en: "Promotional material damaged or missing",
    },
  },
  {
    codigo: "inc_competencia",
    tipo: "incidencia",
    prioridadDefecto: "media",
    nombre: {
      es: "Acción destacada de la competencia",
      eu: "Lehiakideen ekintza nabarmena",
      ca: "Acció destacada de la competència",
      fr: "Action notable de la concurrence",
      en: "Notable competitor activity",
    },
  },
  {
    codigo: "inc_perdida_espacio",
    tipo: "incidencia",
    prioridadDefecto: "alta",
    nombre: {
      es: "Pérdida de espacio en lineal",
      eu: "Apalategiko lekua galtzea",
      ca: "Pèrdua d'espai al lineal",
      fr: "Perte d'espace en linéaire",
      en: "Loss of shelf space",
    },
  },
];

/**
 * Motivos de no realización.
 *
 * Mantener esta lista corta es requisito de producto: un catálogo largo no se
 * lee, se elige el primero. "Falta de tiempo" es el sumidero natural — si en
 * el piloto se lleva la mayoría de los casos, hay que desglosarlo o el dato no
 * sirve (ANEXO §4).
 */
export const MOTIVOS_NO_REALIZACION: Array<{
  codigo: string;
  requiereComentario: boolean;
  texto: TextoI18n;
}> = [
  {
    codigo: "tienda_cerrada",
    requiereComentario: false,
    texto: {
      es: "Tienda cerrada",
      eu: "Denda itxita",
      ca: "Botiga tancada",
      fr: "Magasin fermé",
      en: "Store closed",
    },
  },
  {
    codigo: "encargado_no_disponible",
    requiereComentario: false,
    texto: {
      es: "Encargado no disponible",
      eu: "Arduraduna ez zegoen eskuragarri",
      ca: "Responsable no disponible",
      fr: "Responsable non disponible",
      en: "Store manager unavailable",
    },
  },
  {
    codigo: "falta_tiempo",
    requiereComentario: false,
    texto: {
      es: "Falta de tiempo en la jornada",
      eu: "Lanaldian denbora faltagatik",
      ca: "Falta de temps a la jornada",
      fr: "Manque de temps dans la journée",
      en: "Not enough time in the working day",
    },
  },
  {
    codigo: "incidencia_transporte",
    requiereComentario: false,
    texto: {
      es: "Incidencia de transporte o desplazamiento",
      eu: "Garraio- edo joan-etorri-intzidentzia",
      ca: "Incidència de transport o desplaçament",
      fr: "Incident de transport ou de déplacement",
      en: "Travel or transport problem",
    },
  },
  {
    codigo: "cancelada_por_tienda",
    requiereComentario: false,
    texto: {
      es: "Visita cancelada por la tienda",
      eu: "Dendak bisita bertan behera utzi du",
      ca: "Visita cancel·lada per la botiga",
      fr: "Visite annulée par le magasin",
      en: "Visit cancelled by the store",
    },
  },
  {
    codigo: "otro",
    requiereComentario: true,
    texto: {
      es: "Otro",
      eu: "Bestelakoa",
      ca: "Altres",
      fr: "Autre",
      en: "Other",
    },
  },
];

export const TIPOS_TIENDA: Array<{ codigo: string; nombre: TextoI18n }> = [
  {
    codigo: "hipermercado",
    nombre: {
      es: "Hipermercado",
      eu: "Hipermerkatua",
      ca: "Hipermercat",
      fr: "Hypermarché",
      en: "Hypermarket",
    },
  },
  {
    codigo: "supermercado",
    nombre: {
      es: "Supermercado",
      eu: "Supermerkatua",
      ca: "Supermercat",
      fr: "Supermarché",
      en: "Supermarket",
    },
  },
  {
    codigo: "proximidad",
    nombre: {
      es: "Supermercado de proximidad",
      eu: "Auzoko supermerkatua",
      ca: "Supermercat de proximitat",
      fr: "Supermarché de proximité",
      en: "Convenience supermarket",
    },
  },
  {
    codigo: "tradicional",
    nombre: {
      es: "Tienda tradicional",
      eu: "Denda tradizionala",
      ca: "Botiga tradicional",
      fr: "Commerce traditionnel",
      en: "Traditional store",
    },
  },
  {
    codigo: "autoservicio",
    nombre: {
      es: "Autoservicio",
      eu: "Autozerbitzua",
      ca: "Autoservei",
      fr: "Libre-service",
      en: "Self-service store",
    },
  },
];
