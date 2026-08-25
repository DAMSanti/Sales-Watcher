import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_VISIBLES,
  TIPOS_SITUACION,
  diasAbierta,
  estaEstancada,
  grupoSituacion,
  opcionesSuficienciaStock,
  preguntaHueco,
  resolverResponsable,
  situacionDisponible,
  type CategoriaProducto,
} from "./acciones";

/**
 * El reparto de responsable es la regla de negocio central del reencuadre: si
 * se equivoca, una incidencia acaba en la bandeja de quien no puede resolverla
 * y se queda ahí. Estos tests fijan la tabla del boceto (SPECS §5.4) fila por
 * fila, para que un cambio accidental falle en vez de pasar desapercibido.
 */

describe("resolverResponsable — la tabla del boceto", () => {
  /** Las once filas literales del boceto funcional, en su mismo orden. */
  const TABLA: Array<[string, CategoriaProducto, string]> = [
    ["hueco", "dairy", "fsm"],
    ["stock", "dairy", "fsm"],
    ["fechas", "dairy", "fsm"],
    ["top_pico", "dairy", "fsm"],
    ["hueco", "waters", "gpv"],
    ["hueco", "pbb", "gpv"],
    ["stock", "waters", "gpv"],
    ["stock", "pbb", "gpv"],
    ["top_pico", "waters", "gpv"],
    ["top_pico", "pbb", "gpv"],
    ["nevera", "dairy", "fsm"],
    ["nevera", "waters", "fsm"],
    ["facings", "dairy", "gpv"],
    ["facings", "waters", "gpv"],
    ["reorganizacion", "dairy", "fsm"],
    ["reorganizacion", "pbb", "fsm"],
    ["relacion_responsable", "transversal", "gpv"],
  ];

  it.each(TABLA)("%s en %s → %s", (tipo, categoria, esperado) => {
    const regla = resolverResponsable(tipo as never, categoria);
    expect(regla.responsable).toBe(esperado);
    expect(regla.origen).toBe("boceto");
  });

  /**
   * Las cuatro situaciones que no dependen de la categoría no deben cambiar de
   * responsable al cambiarla. Es fácil romperlo al tocar la regla del reponedor.
   */
  it("nevera y reorganización van al FSM en cualquier categoría", () => {
    for (const categoria of CATEGORIAS_VISIBLES) {
      expect(resolverResponsable("nevera", categoria).responsable).toBe("fsm");
      expect(resolverResponsable("reorganizacion", categoria).responsable).toBe("fsm");
    }
  });

  it("facings y relación con el responsable son siempre del GPV", () => {
    for (const categoria of CATEGORIAS_VISIBLES) {
      expect(resolverResponsable("facings", categoria).responsable).toBe("gpv");
      expect(resolverResponsable("relacion_responsable", categoria).responsable).toBe("gpv");
    }
  });

  /**
   * El principio de fondo: Dairy tiene reponedor y Waters/PBB no. Si esto se
   * invierte, todo el reparto queda del revés.
   */
  it("lo que depende del reponedor escala en Dairy y no en Waters/PBB", () => {
    for (const tipo of ["stock", "hueco", "top_pico"] as const) {
      expect(resolverResponsable(tipo, "dairy").responsable).toBe("fsm");
      expect(resolverResponsable(tipo, "waters").responsable).toBe("gpv");
      expect(resolverResponsable(tipo, "pbb").responsable).toBe("gpv");
    }
  });
});

describe("resolverResponsable — reglas derivadas", () => {
  /**
   * Visibilidad y extraespacio no están en la tabla del boceto. Se marcan como
   * derivadas para poder revisarlas primero si el reparto falla en el piloto.
   */
  it("marca como derivadas las que el boceto no lista", () => {
    expect(resolverResponsable("visibilidad", "dairy").origen).toBe("derivado");
    expect(resolverResponsable("extraespacio", "waters").origen).toBe("derivado");
  });

  it("visibilidad sigue la regla del reponedor", () => {
    expect(resolverResponsable("visibilidad", "dairy").responsable).toBe("fsm");
    expect(resolverResponsable("visibilidad", "pbb").responsable).toBe("gpv");
  });

  it("un extraespacio que no es nevera lo negocia el GPV en cualquier categoría", () => {
    for (const categoria of CATEGORIAS_VISIBLES) {
      expect(resolverResponsable("extraespacio", categoria).responsable).toBe("gpv");
    }
  });

  /** Ningún tipo puede quedarse sin responsable: se perdería la acción. */
  it("todos los tipos de situación resuelven a alguien", () => {
    for (const tipo of TIPOS_SITUACION) {
      for (const categoria of ["dairy", "waters", "pbb", "transversal"] as const) {
        const regla = resolverResponsable(tipo, categoria);
        expect(["gpv", "fsm"]).toContain(regla.responsable);
        expect(regla.motivo.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("clasificación en tres grupos", () => {
  /**
   * La lista sale del boceto, no de nuestro criterio. El §7 divide cada
   * categoría en incidencias, oportunidades y extraespacios, y el resumen de
   * visita muestra extraespacios en su propio bloque.
   */
  it("las incidencias son los problemas que requieren actuación", () => {
    for (const tipo of ["stock", "fechas", "hueco"] as const) {
      expect(grupoSituacion(tipo)).toBe("incidencia");
    }
  });

  it("las oportunidades incluyen Top Picos, que el boceto lista como tal", () => {
    for (const tipo of ["top_pico", "facings", "visibilidad", "reorganizacion"] as const) {
      expect(grupoSituacion(tipo)).toBe("oportunidad");
    }
  });

  /**
   * Extraespacios es un grupo propio, no un subconjunto de oportunidades.
   * Colapsarlos haría que «nos han retirado la nevera» contase como
   * oportunidad detectada y ensuciaría el embudo del dashboard.
   */
  it("los extraespacios son grupo propio, neveras incluidas", () => {
    expect(grupoSituacion("extraespacio")).toBe("extraespacio");
    expect(grupoSituacion("nevera")).toBe("extraespacio");
  });

  it("todo tipo tiene grupo", () => {
    for (const tipo of TIPOS_SITUACION) {
      expect(["incidencia", "oportunidad", "extraespacio"]).toContain(grupoSituacion(tipo));
    }
  });
});

describe("disponibilidad por categoría", () => {
  /** Pedir revisar caducidades de agua embotellada no tendría sentido. */
  it("las fechas solo se comprueban en Dairy", () => {
    expect(situacionDisponible("fechas", "dairy")).toBe(true);
    expect(situacionDisponible("fechas", "waters")).toBe(false);
    expect(situacionDisponible("fechas", "pbb")).toBe(false);
  });

  it("la relación con el responsable es transversal, no de categoría", () => {
    expect(situacionDisponible("relacion_responsable", "transversal")).toBe(true);
    expect(situacionDisponible("relacion_responsable", "dairy")).toBe(false);
  });

  /**
   * "El reponedor todavía no ha pasado" en Waters sería ofrecer una excusa que
   * no existe, y ensuciaría justo el dato en que el boceto quiere apoyarse para
   * hablar con el responsable del establecimiento.
   */
  it("solo Dairy ofrece «el reponedor todavía no ha pasado»", () => {
    expect(opcionesSuficienciaStock("dairy")).toContain("reponedor_no_ha_pasado");
    expect(opcionesSuficienciaStock("waters")).not.toContain("reponedor_no_ha_pasado");
    expect(opcionesSuficienciaStock("pbb")).not.toContain("reponedor_no_ha_pasado");
    expect(opcionesSuficienciaStock("waters")).toEqual(["si", "no"]);
  });

  /** En Dairy se comprueba si está cubierto; en el resto, si lo corrigió él. */
  it("el hueco pregunta cosas distintas según la categoría", () => {
    expect(preguntaHueco("dairy")).toBe("cubierto");
    expect(preguntaHueco("waters")).toBe("corregido");
    expect(preguntaHueco("pbb")).toBe("corregido");
  });
});

describe("antigüedad de una acción", () => {
  const ahora = new Date("2026-09-15T10:00:00Z");

  it("no está estancada antes del umbral", () => {
    const hace13 = new Date("2026-09-02T10:00:00Z");
    expect(estaEstancada(hace13, ahora, 14)).toBe(false);
  });

  it("está estancada al alcanzar el umbral", () => {
    const hace14 = new Date("2026-09-01T10:00:00Z");
    expect(estaEstancada(hace14, ahora, 14)).toBe(true);
  });

  it("respeta un umbral configurado distinto del defecto", () => {
    const hace5 = new Date("2026-09-10T10:00:00Z");
    expect(estaEstancada(hace5, ahora, 14)).toBe(false);
    expect(estaEstancada(hace5, ahora, 3)).toBe(true);
  });

  it("cuenta días completos abiertos", () => {
    expect(diasAbierta(new Date("2026-09-01T10:00:00Z"), ahora)).toBe(14);
    expect(diasAbierta(new Date("2026-09-15T09:00:00Z"), ahora)).toBe(0);
  });

  /**
   * Una acción recién detectada no puede salir estancada: sería ruido inmediato
   * en el panel del FSM el mismo día en que el GPV la registra.
   */
  it("una acción de hoy nunca está estancada", () => {
    expect(estaEstancada(ahora, ahora)).toBe(false);
  });
});
