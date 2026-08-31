/**
 * El ciclo detección → acción → seguimiento → resultado (SPECS §5.5 y §5.8).
 *
 * Este módulo contiene la lógica de dominio del reencuadre funcional: qué
 * situaciones existen, quién debe actuar en cada una, y cuándo una acción
 * lleva demasiado tiempo abierta.
 *
 * Vive en `@sw/shared` y no en la API por una razón concreta: la app de campo
 * necesita anticipar el responsable para redactar bien sus mensajes ("se ha
 * generado una acción para tu responsable" frente a "recuerda comentárselo al
 * encargado"), y el backoffice necesita la misma tabla para explicar por qué
 * una acción está donde está. Duplicarla en tres sitios garantiza que diverjan.
 *
 * REGLA IMPORTANTE: aunque el cliente pueda anticipar el responsable, **el
 * valor que se guarda lo calcula siempre el servidor** (CONVENTIONS). Aquí solo
 * está la función; quién la ejecuta con autoridad es otra cuestión.
 */

// ── Vocabulario del dominio ────────────────────────────────────────────

/**
 * Las tres categorías de producto del boceto, más `transversal` para lo que no
 * cuelga de ninguna (la relación con el responsable de tienda, que se registra
 * una sola vez por visita).
 */
export const CATEGORIAS_PRODUCTO = ["dairy", "waters", "pbb", "transversal"] as const;
export type CategoriaProducto = (typeof CATEGORIAS_PRODUCTO)[number];

/** Las tres categorías que el GPV ve como pestañas en la visita. */
export const CATEGORIAS_VISIBLES = ["dairy", "waters", "pbb"] as const;
export type CategoriaVisible = (typeof CATEGORIAS_VISIBLES)[number];

/**
 * Situaciones tipificadas que puede detectar el GPV.
 *
 * `nevera` es un tipo de extraespacio según el boceto, pero se distingue aquí
 * porque **cambia el responsable**: una nevera siempre escala al FSM, y el
 * resto de extraespacios los negocia el GPV con el encargado.
 */
export const TIPOS_SITUACION = [
  "stock",
  "fechas",
  "hueco",
  "top_pico",
  "facings",
  "visibilidad",
  "reorganizacion",
  "bloque_marca",
  "extraespacio",
  "nevera",
  "relacion_responsable",
] as const;
export type TipoSituacion = (typeof TIPOS_SITUACION)[number];

export type ResponsableActuar = "gpv" | "fsm";

// ── Reglas de responsable ──────────────────────────────────────────────

/**
 * De dónde sale cada regla.
 *
 * El boceto funcional trae una tabla con once filas (SPECS §5.4), pero los
 * nueve flujos producen algunas combinaciones que esa tabla no cubre. Las
 * marcadas como `derivado` se han deducido aplicando el mismo principio, y
 * están pendientes de confirmar con el cliente.
 *
 * Hacer visible la diferencia importa: una regla derivada que resulte
 * equivocada manda acciones a quien no puede resolverlas, y conviene saber
 * cuáles revisar primero cuando eso ocurra.
 */
export type OrigenRegla = "boceto" | "derivado";

export type Regla = {
  responsable: ResponsableActuar;
  origen: OrigenRegla;
  /** Por qué es esta persona y no la otra. Se usa en la interfaz y en el log. */
  motivo: string;
};

/**
 * El principio que gobierna todo el reparto:
 *
 *   En **Dairy** hay un reponedor de Danone. El GPV no le da instrucciones
 *   directamente, así que lo que depende del reponedor escala al FSM.
 *
 *   En **Waters y PBB** no hay reponedor propio. El GPV actúa por sí mismo o
 *   negocia con el encargado del establecimiento.
 *
 * Cuatro situaciones se salen de ese patrón y dependen solo del tipo, no de la
 * categoría: neveras y reorganización siempre son del FSM, facings y relación
 * con el responsable siempre del GPV.
 */
/**
 * Una situación se resuelve de una de dos maneras, y conviene que la diferencia
 * sea explícita en el tipo:
 *
 * - `segunReponedor` — depende de la categoría: escala al FSM en Dairy porque
 *   hay reponedor, lo hace el GPV en Waters y PBB porque no lo hay.
 * - `fijo` — el responsable es el mismo en las tres categorías.
 *
 * La primera versión de este módulo mezcló ambas cosas en una sola lista y
 * acabó mandando los extraespacios de Dairy al FSM, contradiciendo su propio
 * comentario. La distinción de arriba es lo que impide que vuelva a pasar.
 */
type Definicion =
  | { modo: "segunReponedor"; origen: OrigenRegla }
  | { modo: "fijo"; responsable: ResponsableActuar; origen: OrigenRegla; motivo: string };

const REGLAS: Record<TipoSituacion, Definicion> = {
  // ── Dependen de si hay reponedor en la categoría ─────────────────────
  stock: { modo: "segunReponedor", origen: "boceto" },
  fechas: { modo: "segunReponedor", origen: "boceto" },
  hueco: { modo: "segunReponedor", origen: "boceto" },
  top_pico: { modo: "segunReponedor", origen: "boceto" },
  /**
   * Derivada: mover producto dentro del lineal es, a efectos de quién puede
   * tocarlo, lo mismo que cubrir un hueco.
   */
  visibilidad: { modo: "segunReponedor", origen: "derivado" },

  // ── Mismo responsable en las tres categorías ─────────────────────────
  nevera: {
    modo: "fijo",
    responsable: "fsm",
    origen: "boceto",
    motivo: "La gestión de neveras la lleva el FSM, que informa en su aplicación de neveras",
  },
  reorganizacion: {
    modo: "fijo",
    responsable: "fsm",
    origen: "boceto",
    motivo: "El GPV detecta la oportunidad, pero la decisión de reorganizar es del FSM",
  },
  facings: {
    modo: "fijo",
    responsable: "gpv",
    origen: "boceto",
    motivo: "Ganar facings es negociación en tienda, que hace el propio GPV",
  },
  relacion_responsable: {
    modo: "fijo",
    responsable: "gpv",
    origen: "boceto",
    motivo: "La relación con el encargado la mantiene el GPV",
  },
  /**
   * Nuevo en v0.7. La matriz de responsabilidades de la v2 no le asigna
   * responsable ("—"): se registra automáticamente y no escala a nadie. Se
   * marca como `gpv` porque es quien la genera y no hay a quién trasladarla —
   * no porque el GPV tenga una tarea pendiente sobre ella.
   */
  bloque_marca: {
    modo: "fijo",
    responsable: "gpv",
    origen: "boceto",
    motivo: "Se registra automáticamente como oportunidad, sin escalado",
  },
  /**
   * Derivada: conseguir una cabecera, una isla o una pila es negociación con el
   * establecimiento, y eso lo hace el GPV también en Dairy — el reponedor
   * repone, no negocia espacio adicional.
   */
  extraespacio: {
    modo: "fijo",
    responsable: "gpv",
    origen: "derivado",
    motivo: "Conseguir un extraespacio es negociación con el establecimiento, que hace el GPV",
  },
};

/**
 * Calcula quién debe actuar ante una situación detectada.
 *
 * No es una elección del usuario: si el GPV pudiera seleccionarlo, la misma
 * situación escalaría distinto según quién la registrase y los agregados del
 * dashboard dejarían de ser comparables (SPECS §5.4).
 */
export function resolverResponsable(
  tipo: TipoSituacion,
  categoria: CategoriaProducto,
): Regla {
  const regla = REGLAS[tipo];

  if (!regla) {
    // Un tipo nuevo sin regla es un error de programación. Escalar al FSM es
    // preferible a perder la acción, pero el motivo debe delatar el fallo.
    return {
      responsable: "fsm",
      origen: "derivado",
      motivo: `Situación sin regla definida (${tipo}); escala al FSM por defecto`,
    };
  }

  if (regla.modo === "fijo") {
    return { responsable: regla.responsable, origen: regla.origen, motivo: regla.motivo };
  }

  return categoria === "dairy"
    ? {
        responsable: "fsm",
        origen: regla.origen,
        motivo: "En Dairy actúa el reponedor, y el GPV no le da instrucciones directamente",
      }
    : {
        responsable: "gpv",
        origen: regla.origen,
        motivo:
          "En Waters y PBB no hay reponedor propio: actúa el GPV o lo negocia con el encargado",
      };
}

// ── Clasificación de las situaciones ───────────────────────────────────

/**
 * Los tres grupos en los que el boceto divide cada categoría (§7):
 * incidencias, oportunidades y extraespacios.
 *
 * Son **tres**, no dos. Es fácil colapsar extraespacios dentro de
 * oportunidades —el §13 los menciona en esa lista— pero el menú de cada
 * categoría los separa, y el resumen de visita del boceto los muestra en su
 * propio bloque. Colapsarlos haría que «nos han retirado la nevera» contase
 * como oportunidad detectada, y ensuciaría el embudo del dashboard.
 */
export type GrupoSituacion = "incidencia" | "oportunidad" | "extraespacio";

const GRUPOS: Record<TipoSituacion, GrupoSituacion> = {
  // Problemas que requieren actuación.
  stock: "incidencia",
  fechas: "incidencia",
  hueco: "incidencia",
  // Potencial de mejorar venta, espacio, surtido o ejecución.
  top_pico: "oportunidad",
  facings: "oportunidad",
  visibilidad: "oportunidad",
  reorganizacion: "oportunidad",
  bloque_marca: "oportunidad",
  // Espacios adicionales, con la nevera como caso propio.
  extraespacio: "extraespacio",
  nevera: "extraespacio",
  // Transversal: ni se abre ni se cierra, se acumula como histórico.
  relacion_responsable: "oportunidad",
};

export function grupoSituacion(tipo: TipoSituacion): GrupoSituacion {
  return GRUPOS[tipo] ?? "incidencia";
}

// ── Disponibilidad de flujos y opciones por categoría ──────────────────

/**
 * La comprobación de fechas es **exclusiva de Dairy** (boceto §10). Ofrecerla
 * en Waters o PBB pediría al GPV revisar caducidades de agua embotellada.
 *
 * `nevera` es exclusiva de Dairy y Waters — **no existe en PBB** (SPECS v0.7
 * §5.5.9, §7.9 del documento del cliente: "no mostrar este apartado").
 *
 * `bloque_marca` es exclusiva de Waters y PBB — **no existe en Dairy** (SPECS
 * v0.7 §5.5.7-bis).
 */
export function situacionDisponible(
  tipo: TipoSituacion,
  categoria: CategoriaProducto,
): boolean {
  if (tipo === "fechas") return categoria === "dairy";
  if (tipo === "relacion_responsable") return categoria === "transversal";
  if (tipo === "nevera") return categoria === "dairy" || categoria === "waters";
  if (tipo === "bloque_marca") return categoria === "waters" || categoria === "pbb";
  return categoria !== "transversal";
}

/**
 * "El reponedor todavía no ha pasado" solo tiene sentido en Dairy, porque es la
 * única categoría con reponedor de Danone.
 *
 * Ofrecerla en Waters o PBB sería ofrecer una excusa que no existe, y ensuciaría
 * el dato de suficiencia de stock justo donde el boceto quiere apoyarse para
 * hablar con el responsable del establecimiento.
 */
export function opcionesSuficienciaStock(
  categoria: CategoriaProducto,
): readonly string[] {
  return categoria === "dairy"
    ? ["si", "no", "reponedor_no_ha_pasado"]
    : ["si", "no"];
}

/**
 * Waters y PBB añaden una segunda pregunta tras detectar el hueco: el GPV
 * intenta corregirlo en el momento y registra el resultado de su propia
 * actuación.
 *
 * Dairy **ya no tiene segunda pregunta** desde v0.7: la v2 combina "¿existe un
 * hueco?" y "¿está cubierto con una referencia adyacente?" en una sola
 * pregunta (`existeHueco`), porque el GPV resuelve el criterio de cobertura
 * mentalmente al responder. Devolver `null` es lo que le dice al formulario
 * que no muestre ningún campo adicional.
 */
export function preguntaHueco(categoria: CategoriaProducto): "corregido" | null {
  return categoria === "dairy" ? null : "corregido";
}

// ── Antigüedad ─────────────────────────────────────────────────────────

/**
 * Días tras los que una acción abierta se considera estancada.
 *
 * Catorce días son aproximadamente dos ciclos de visita: suficiente para que el
 * GPV haya vuelto al menos una vez y la acción siga sin resolverse. Es un
 * parámetro configurable, no una constante de negocio.
 */
export const UMBRAL_ESTANCADA_DIAS = 14;

/**
 * Una acción estancada **sigue abierta**; solo sube en el panel del FSM.
 *
 * No es un estado y no se guarda en columna: se deriva de la antigüedad. Como
 * estado permitiría que algo estuviera "estancado" y "resuelto" a la vez, o que
 * dejara de estarlo sin que nadie hiciera nada (SPECS §7.1).
 *
 * Y las acciones **no caducan**: cerrarlas solas destruiría en silencio el
 * seguimiento que da sentido al sistema (ANEXO, decisión que cierra P23).
 */
export function estaEstancada(
  detectadaEn: Date,
  ahora: Date = new Date(),
  umbralDias: number = UMBRAL_ESTANCADA_DIAS,
): boolean {
  const dias = (ahora.getTime() - detectadaEn.getTime()) / 86_400_000;
  return dias >= umbralDias;
}

/** Días completos que lleva abierta una acción. Para ordenar el panel del FSM. */
export function diasAbierta(detectadaEn: Date, ahora: Date = new Date()): number {
  return Math.floor((ahora.getTime() - detectadaEn.getTime()) / 86_400_000);
}
