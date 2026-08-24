import { describe, expect, it } from "vitest";
import {
  distanciaMetros,
  fechaLocal,
  instanteCierreJornada,
  ventanaJustificacionAbierta,
} from "./jornada";

const MADRID = "Europe/Madrid";
const CANARIAS = "Atlantic/Canary";

describe("instanteCierreJornada", () => {
  it("resuelve la hora local a UTC en horario de invierno (CET, UTC+1)", () => {
    const cierre = instanteCierreJornada("2026-01-15", MADRID, "21:00");
    expect(cierre.toISOString()).toBe("2026-01-15T20:00:00.000Z");
  });

  it("resuelve la hora local a UTC en horario de verano (CEST, UTC+2)", () => {
    const cierre = instanteCierreJornada("2026-07-15", MADRID, "21:00");
    expect(cierre.toISOString()).toBe("2026-07-15T19:00:00.000Z");
  });

  it("aplica el desfase propio de Canarias (una hora menos que la Península)", () => {
    const peninsula = instanteCierreJornada("2026-07-15", MADRID, "21:00");
    const canarias = instanteCierreJornada("2026-07-15", CANARIAS, "21:00");
    const diferenciaHoras =
      (canarias.getTime() - peninsula.getTime()) / (1000 * 60 * 60);
    expect(diferenciaHoras).toBe(1);
  });

  it("rechaza formatos inválidos en lugar de fallar en silencio", () => {
    expect(() => instanteCierreJornada("2026-07-15", MADRID, "21h")).toThrow();
    expect(() => instanteCierreJornada("15/07/2026", MADRID, "21:00")).toThrow();
  });
});

describe("ventanaJustificacionAbierta", () => {
  it("acepta una justificación hecha antes del cierre", () => {
    const capturada = new Date("2026-07-15T18:55:00.000Z"); // 20:55 en Madrid
    expect(
      ventanaJustificacionAbierta(capturada, "2026-07-15", MADRID, "21:00"),
    ).toBe(true);
  });

  it("rechaza una justificación hecha después del cierre", () => {
    const capturada = new Date("2026-07-15T19:30:00.000Z"); // 21:30 en Madrid
    expect(
      ventanaJustificacionAbierta(capturada, "2026-07-15", MADRID, "21:00"),
    ).toBe(false);
  });

  it("rechaza justificar hoy una visita de un día anterior", () => {
    const capturada = new Date("2026-07-17T10:00:00.000Z");
    expect(
      ventanaJustificacionAbierta(capturada, "2026-07-15", MADRID, "21:00"),
    ).toBe(false);
  });

  /**
   * El caso que motiva todo el diseño: el comercial justifica a tiempo pero
   * sin cobertura, y la cola sincroniza mucho después. La ventana se valida
   * contra la captura en dispositivo, así que debe aceptarse.
   */
  it("acepta una justificación capturada a tiempo aunque sincronice tarde", () => {
    const capturadaEnDispositivo = new Date("2026-07-15T17:55:00.000Z"); // 19:55 local
    const recibidaEnServidor = new Date("2026-07-15T19:30:00.000Z"); // 21:30 local

    expect(
      ventanaJustificacionAbierta(
        capturadaEnDispositivo,
        "2026-07-15",
        MADRID,
        "21:00",
      ),
    ).toBe(true);

    // Y la comprobación equivocada, la que NO hay que implementar:
    expect(
      ventanaJustificacionAbierta(recibidaEnServidor, "2026-07-15", MADRID, "21:00"),
    ).toBe(false);
  });
});

describe("fechaLocal", () => {
  it("no desplaza el día en horario de verano a última hora de la tarde", () => {
    // 23:30 del 15 de julio en Madrid es todavía día 15, pero 21:30 UTC.
    const instante = new Date("2026-07-15T21:30:00.000Z");
    expect(fechaLocal(instante, MADRID)).toBe("2026-07-15");
  });

  it("asigna a la jornada correcta un instante ya pasada la medianoche local", () => {
    // 00:30 del 16 de julio en Madrid es 22:30 UTC del día 15.
    const instante = new Date("2026-07-15T22:30:00.000Z");
    expect(fechaLocal(instante, MADRID)).toBe("2026-07-16");
  });
});

describe("distanciaMetros", () => {
  it("devuelve cero para el mismo punto", () => {
    const p = { lat: 40.4168, lon: -3.7038 };
    expect(distanciaMetros(p, p)).toBe(0);
  });

  it("calcula una distancia corta con precisión suficiente", () => {
    // Dos puntos separados por ~111 m en latitud.
    const a = { lat: 40.4168, lon: -3.7038 };
    const b = { lat: 40.4178, lon: -3.7038 };
    expect(distanciaMetros(a, b)).toBeGreaterThan(100);
    expect(distanciaMetros(a, b)).toBeLessThan(125);
  });
});
