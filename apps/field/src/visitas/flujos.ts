import type { CategoriaProducto, TipoSituacion } from "../api/tipos";

/**
 * Qué flujos ofrece cada bloque de una categoría (SPECS §5.5).
 *
 * El boceto divide cada categoría en tres bloques —incidencias, oportunidades
 * y extraespacios— y no todos los flujos aplican en todas partes. Esta tabla es
 * la que decide qué botones ve el GPV.
 *
 * La disponibilidad por categoría (fechas solo en Dairy) NO se decide aquí: se
 * pregunta a `situacionDisponible` de `@sw/shared`, que es la misma función que
 * usa el servidor para validar. Dos listas distintas divergirían, y la
 * divergencia se notaría como un formulario que se envía y el servidor rechaza.
 */

export type Bloque = "incidencias" | "oportunidades" | "extraespacios";

export const BLOQUES: Bloque[] = ["incidencias", "oportunidades", "extraespacios"];

export const FLUJOS_POR_BLOQUE: Record<Bloque, TipoSituacion[]> = {
  incidencias: ["stock", "fechas", "hueco"],
  oportunidades: ["top_pico", "facings", "visibilidad", "reorganizacion"],
  extraespacios: ["extraespacio", "nevera"],
};

/** Emoji por bloque y categoría, tal y como los usa el boceto. */
export const ICONO_CATEGORIA: Record<CategoriaProducto, string> = {
  dairy: "🥛",
  waters: "💧",
  pbb: "🍦",
};

export const ICONO_BLOQUE: Record<Bloque, string> = {
  incidencias: "🔴",
  oportunidades: "🟢",
  extraespacios: "🧊",
};

/**
 * Opciones de cada desplegable.
 *
 * Son enumeraciones del dominio, no catálogo configurable: vienen del boceto y
 * el servidor las valida como tales. Sus etiquetas se traducen por i18n, con la
 * clave `flujo.<campo>.<valor>`.
 */
export const OPCIONES = {
  problemaFechas: ["fifo_incorrecto", "proximo_caducar", "mal_colocado", "otro"],
  correccionHueco: ["si", "no_posible"],
  tipoExtraespacio: ["cabecera", "isla", "pila", "otro"],
  motivoExtraespacio: [
    "alta_rotacion",
    "promocion",
    "potencial_venta",
    "falta_espacio_lineal",
    "oportunidad_estacional",
    "otro",
  ],
  situacionNevera: [
    "uso_correcto",
    "uso_parcial",
    "uso_incorrecto",
    "retirada",
    "vacia_desaprovechada",
    "necesita_nueva",
    "necesita_recogida",
    "otro",
  ],
  ubicacionLineal: ["palomar", "zona_intermedia", "altura_ojos", "foso", "otra"],
  propuestaVisibilidad: [
    "subir_producto",
    "bajar_producto",
    "ganar_espacio",
    "cambiar_ubicacion",
    "reorganizar_lineal",
    "otra",
  ],
  valoracionRelacion: [
    "muy_buena",
    "buena",
    "correcta",
    "mejorable",
    "mala",
    "no_ha_podido_hablar",
  ],
} as const;

/**
 * Situaciones de nevera que exigen el código de la unidad.
 *
 * El código existe para que el FSM identifique exactamente qué nevera hay que
 * mover en su propia aplicación, y no se retire la equivocada. Solo hace falta
 * cuando hay que mover una: preguntarlo siempre sería fricción sin motivo.
 */
export const NEVERA_EXIGE_CODIGO: string[] = ["retirada", "necesita_recogida"];
