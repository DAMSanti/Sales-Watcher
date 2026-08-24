import type { TextoI18n } from "@sw/shared";

/**
 * Plantillas de checklist placeholder.
 *
 * ⚠️ Igual que los catálogos: son semilla, no especificación. El checklist
 * definitivo se valida en el piloto, que es exactamente donde se descubre si
 * un ítem sobra, falta o se completa sin mirar (ANEXO §6).
 *
 * Nota de diseño: los ítems mezclan comprobación ("revisar caducidades") con
 * conversación ("hablar con el encargado"). No es un descuido — el comercial
 * no manda en la tienda, negocia con el encargado, así que la interlocución
 * es parte del trabajo y debe quedar registrada (ANEXO §0).
 */

type SemillaItem = {
  codigo: string;
  texto: TextoI18n;
  requiereFoto: boolean;
  obligatorio: boolean;
};

type SemillaPlantilla = {
  codigo: string;
  nombre: TextoI18n;
  /** Null = plantilla global, aplicable a cualquier tipo de tienda. */
  tipoTiendaCodigo: string | null;
  items: SemillaItem[];
};

const ITEM_HABLAR_ENCARGADO: SemillaItem = {
  codigo: "hablar_encargado",
  texto: {
    es: "Hablar con el encargado",
    eu: "Arduradunarekin hitz egin",
    ca: "Parlar amb el responsable",
    fr: "Parler au responsable",
    en: "Speak with the store manager",
  },
  requiereFoto: false,
  obligatorio: true,
};

const ITEM_FOTO_LINEAL: SemillaItem = {
  codigo: "foto_lineal",
  texto: {
    es: "Fotografiar el lineal",
    eu: "Apalategiaren argazkia atera",
    ca: "Fotografiar el lineal",
    fr: "Photographier le linéaire",
    en: "Photograph the shelf",
  },
  requiereFoto: true,
  obligatorio: true,
};

const ITEM_REVISAR_STOCK: SemillaItem = {
  codigo: "revisar_stock",
  texto: {
    es: "Revisar stock en lineal y almacén",
    eu: "Apalategiko eta biltegiko stocka berrikusi",
    ca: "Revisar estoc al lineal i magatzem",
    fr: "Vérifier le stock en linéaire et en réserve",
    en: "Check shelf and back-room stock",
  },
  requiereFoto: false,
  obligatorio: true,
};

const ITEM_COMPROBAR_PRECIO: SemillaItem = {
  codigo: "comprobar_precio",
  texto: {
    es: "Comprobar precio en tienda",
    eu: "Dendako prezioa egiaztatu",
    ca: "Comprovar el preu a la botiga",
    fr: "Vérifier le prix en magasin",
    en: "Verify in-store pricing",
  },
  requiereFoto: false,
  obligatorio: true,
};

const ITEM_CADUCIDADES: SemillaItem = {
  codigo: "revisar_caducidades",
  texto: {
    es: "Revisar fechas de caducidad",
    eu: "Iraungitze-datak berrikusi",
    ca: "Revisar dates de caducitat",
    fr: "Contrôler les dates limites de consommation",
    en: "Check expiry dates",
  },
  requiereFoto: false,
  obligatorio: true,
};

const ITEM_CADENA_FRIO: SemillaItem = {
  codigo: "comprobar_cadena_frio",
  texto: {
    es: "Comprobar temperatura del mueble frigorífico",
    eu: "Hozkailuaren tenperatura egiaztatu",
    ca: "Comprovar la temperatura del moble frigorífic",
    fr: "Contrôler la température du meuble réfrigéré",
    en: "Check refrigerated unit temperature",
  },
  requiereFoto: true,
  obligatorio: true,
};

const ITEM_PLV: SemillaItem = {
  codigo: "revisar_plv",
  texto: {
    es: "Revisar material promocional (PLV)",
    eu: "Material promozionala berrikusi",
    ca: "Revisar el material promocional (PLV)",
    fr: "Vérifier la PLV",
    en: "Check point-of-sale material",
  },
  requiereFoto: false,
  obligatorio: false,
};

const ITEM_COMPETENCIA: SemillaItem = {
  codigo: "observar_competencia",
  texto: {
    es: "Observar acciones de la competencia",
    eu: "Lehiakideen ekintzak behatu",
    ca: "Observar accions de la competència",
    fr: "Observer les actions de la concurrence",
    en: "Note competitor activity",
  },
  requiereFoto: false,
  obligatorio: false,
};

const ITEM_UBICACION_SECUNDARIA: SemillaItem = {
  codigo: "revisar_ubicacion_secundaria",
  texto: {
    es: "Revisar ubicaciones secundarias (cabeceras e islas)",
    eu: "Bigarren mailako kokalekuak berrikusi (buru-apalak eta uharteak)",
    ca: "Revisar ubicacions secundàries (capçaleres i illes)",
    fr: "Vérifier les emplacements secondaires (têtes de gondole et îlots)",
    en: "Check secondary placements (gondola ends and islands)",
  },
  requiereFoto: true,
  obligatorio: false,
};

export const PLANTILLAS_CHECKLIST: SemillaPlantilla[] = [
  {
    codigo: "estandar",
    tipoTiendaCodigo: null,
    nombre: {
      es: "Visita estándar",
      eu: "Bisita estandarra",
      ca: "Visita estàndard",
      fr: "Visite standard",
      en: "Standard visit",
    },
    items: [
      ITEM_HABLAR_ENCARGADO,
      ITEM_REVISAR_STOCK,
      ITEM_FOTO_LINEAL,
      ITEM_COMPROBAR_PRECIO,
      ITEM_CADUCIDADES,
      ITEM_CADENA_FRIO,
      ITEM_PLV,
    ],
  },
  {
    /**
     * Un hipermercado tiene ubicaciones secundarias y presencia de competencia
     * que una tienda de barrio no tiene. Es el ejemplo de por qué el checklist
     * se asigna por tipo de tienda en lugar de ser único (SPECS §11).
     */
    codigo: "hipermercado",
    tipoTiendaCodigo: "hipermercado",
    nombre: {
      es: "Visita a hipermercado",
      eu: "Hipermerkatuko bisita",
      ca: "Visita a hipermercat",
      fr: "Visite en hypermarché",
      en: "Hypermarket visit",
    },
    items: [
      ITEM_HABLAR_ENCARGADO,
      ITEM_REVISAR_STOCK,
      ITEM_FOTO_LINEAL,
      ITEM_COMPROBAR_PRECIO,
      ITEM_CADUCIDADES,
      ITEM_CADENA_FRIO,
      ITEM_UBICACION_SECUNDARIA,
      ITEM_COMPETENCIA,
      ITEM_PLV,
    ],
  },
];
