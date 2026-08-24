import { describe, expect, it } from "vitest";
import { evaluarDesviacion } from "./geolocalizacion";

/** Hiper Bilbao Abando, del catálogo semilla. */
const TIENDA = { lat: 43.262, lon: -2.935 };

describe("evaluarDesviacion", () => {
  it("no marca desviación cuando el check-in es junto a la tienda", () => {
    const r = evaluarDesviacion(
      { lat: 43.2622, lon: -2.9353, precisionM: 15 },
      TIENDA,
    );
    expect(r.evaluable).toBe(true);
    expect(r.desviada).toBe(false);
    expect(r.metros).toBeLessThan(60);
  });

  it("marca desviación cuando el check-in está a kilómetros", () => {
    const r = evaluarDesviacion(
      { lat: 43.298, lon: -2.948, precisionM: 20 },
      TIENDA,
    );
    expect(r.desviada).toBe(true);
    expect(r.metros).toBeGreaterThan(2000);
  });

  /**
   * El caso que evita la mayoría de los falsos positivos: dentro de un centro
   * comercial el GPS reporta cientos de metros de error, y una lectura así no
   * permite concluir nada sobre dónde estaba el comercial.
   */
  it("no evalúa cuando la precisión del GPS es inutilizable", () => {
    const r = evaluarDesviacion(
      { lat: 43.5, lon: -2.5, precisionM: 500 },
      TIENDA,
    );
    expect(r.evaluable).toBe(false);
    expect(r.desviada).toBe(false);
    expect(r.metros).toBeNull();
  });

  /**
   * La incertidumbre se suma a la tolerancia. Una distancia de ~330 m con
   * 150 m de error declarado podría ser 180 m reales, así que no se marca.
   */
  it("suma la incertidumbre del dispositivo a la tolerancia", () => {
    const aTrescientosMetros = { lat: 43.2647, lon: -2.935 };

    const preciso = evaluarDesviacion(
      { ...aTrescientosMetros, precisionM: 5 },
      TIENDA,
    );
    const impreciso = evaluarDesviacion(
      { ...aTrescientosMetros, precisionM: 150 },
      TIENDA,
    );

    expect(preciso.metros).toBe(impreciso.metros);
    expect(preciso.desviada).toBe(true);
    expect(impreciso.desviada).toBe(false);
  });

  it("no evalúa si falta alguna de las dos ubicaciones", () => {
    expect(evaluarDesviacion(null, TIENDA).evaluable).toBe(false);
    expect(
      evaluarDesviacion({ lat: 43.262, lon: -2.935, precisionM: 10 }, null)
        .evaluable,
    ).toBe(false);
  });

  /**
   * Denegar el permiso de ubicación no debe parecer una desviación: el
   * comercial pudo haber ido perfectamente y tener el GPS apagado.
   */
  it("una ubicación ausente no cuenta como desviada", () => {
    const r = evaluarDesviacion(undefined, TIENDA);
    expect(r.desviada).toBe(false);
  });
});
