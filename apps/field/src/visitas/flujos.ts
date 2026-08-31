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
  oportunidades: ["top_pico", "facings", "visibilidad", "reorganizacion", "bloque_marca"],
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
  /** Sustituye a `situacionNevera` (8 valores) desde v0.7: árbol binario. */
  decisionNevera: ["mantener", "recoger"],
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
 * Flujos que admiten evidencia, y de qué clase (SPECS §5.5, §9).
 *
 * No todos la piden. El boceto es explícito en que **fechas y huecos NO
 * requieren fotografía**: pedirla ahí sería fricción sin motivo, y el objetivo
 * declarado es que el GPV pase menos tiempo delante del móvil.
 *
 * - **Stock**: foto o vídeo. Es donde el boceto quiere apoyarse para hablar con
 *   el responsable del establecimiento, y una falta repetida documentada es la
 *   munición de esa conversación.
 * - **Visibilidad y nueva implantación**: fotografía del lineal, opcional.
 * - **Nevera**: fotografía, obligatoria cuando se recoge — permite verificar una
 *   transcripción dudosa del código sin volver a la tienda.
 */
export const EVIDENCIA_POR_FLUJO: Partial<Record<TipoSituacion, "foto" | "ambas">> = {
  stock: "ambas",
  visibilidad: "foto",
  reorganizacion: "foto",
  nevera: "foto",
};

/**
 * Dónde la evidencia deja de ser opcional (SPECS §5.5.1, §5.5.9 — v0.7).
 *
 * Solo dos casos, y ambos condicionales — no basta con mirar el tipo de
 * situación, hace falta el resto de la respuesta:
 *
 * - **Falta de producto en Waters/PBB**: foto obligatoria del lineal. En Dairy
 *   sigue siendo opcional (la incidencia escala al FSM, que actúa con el
 *   reponedor sin necesitar evidencia).
 * - **Recoger nevera**: foto obligatoria del código. Mantener no la exige.
 */
export function evidenciaObligatoria(
  tipo: TipoSituacion,
  categoria: CategoriaProducto,
  campos: Record<string, unknown>,
): boolean {
  // Solo cuando hay incidencia de verdad: si el producto es suficiente, no
  // hay nada que fotografiar ni incidencia que documentar.
  if (tipo === "stock") return categoria !== "dairy" && campos.suficiencia === "no";
  if (tipo === "nevera") return campos.decision === "recoger";
  return false;
}
