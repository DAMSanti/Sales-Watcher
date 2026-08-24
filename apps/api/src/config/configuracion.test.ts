import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarConfiguracion } from "./configuracion";

/**
 * La configuración se valida al arrancar y el proceso se niega a levantar si
 * algo falta. Estos tests comprueban esa negativa, que es una propiedad de
 * seguridad real: una API que arranca con JWT_SECRET vacío y falla en la
 * primera petición es mucho peor que una que no arranca.
 */

const MINIMA = {
  DATABASE_URL: "postgresql://sw:pass@localhost:5432/sw",
  JWT_SECRET: "un-secreto-suficientemente-largo-para-produccion",
};

let entornoOriginal: NodeJS.ProcessEnv;

beforeEach(() => {
  entornoOriginal = process.env;
  // Entorno limpio: si se heredase el real, los tests pasarían por accidente
  // en la máquina del desarrollador y fallarían en CI.
  process.env = { ...MINIMA } as NodeJS.ProcessEnv;
});

afterEach(() => {
  process.env = entornoOriginal;
});

describe("cargarConfiguracion", () => {
  it("acepta la configuración mínima y aplica los valores por defecto", () => {
    const config = cargarConfiguracion();

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.JWT_EXPIRES_IN).toBe("30d");
    expect(config.CIERRE_JORNADA_HORA).toBe("21:00");
    expect(config.ZONA_HORARIA_DEFECTO).toBe("Europe/Madrid");
    expect(config.AUTH_MAX_INTENTOS).toBe(5);
    expect(config.AUTH_BLOQUEO_MINUTOS).toBe(15);
  });

  it("rechaza que falte DATABASE_URL", () => {
    delete process.env.DATABASE_URL;
    expect(() => cargarConfiguracion()).toThrow(/DATABASE_URL/);
  });

  it("rechaza un JWT_SECRET demasiado corto", () => {
    process.env.JWT_SECRET = "corto";
    expect(() => cargarConfiguracion()).toThrow(/JWT_SECRET/);
  });

  /**
   * El `.env.example` trae un secreto de ejemplo. Sin esta comprobación,
   * desplegar sin tocarlo daría una API que arranca y firma tokens con un
   * secreto que está publicado en el repositorio.
   */
  it("rechaza el secreto de ejemplo en producción", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "cambiar_esto_por_un_secreto_largo_y_aleatorio";
    expect(() => cargarConfiguracion()).toThrow(/valor de ejemplo/);
  });

  it("permite el secreto de ejemplo fuera de producción", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "cambiar_esto_por_un_secreto_largo_y_aleatorio";
    expect(() => cargarConfiguracion()).not.toThrow();
  });

  it("rechaza una hora de cierre con formato inválido", () => {
    process.env.CIERRE_JORNADA_HORA = "21h";
    expect(() => cargarConfiguracion()).toThrow(/CIERRE_JORNADA_HORA/);

    process.env.CIERRE_JORNADA_HORA = "9:00";
    expect(() => cargarConfiguracion()).toThrow(/CIERRE_JORNADA_HORA/);
  });

  /**
   * La retención de fotos sigue sin decidirse por negocio (P7). Vacío
   * significa conservar indefinidamente, no cero días — confundirlo borraría
   * todas las fotos en la primera pasada del proceso de purga.
   */
  it("interpreta una retención de fotos vacía como indefinida, no como cero", () => {
    process.env.RETENCION_FOTOS_DIAS = "";
    expect(cargarConfiguracion().RETENCION_FOTOS_DIAS).toBeNull();

    process.env.RETENCION_FOTOS_DIAS = "   ";
    expect(cargarConfiguracion().RETENCION_FOTOS_DIAS).toBeNull();

    process.env.RETENCION_FOTOS_DIAS = "90";
    expect(cargarConfiguracion().RETENCION_FOTOS_DIAS).toBe(90);
  });

  it("rechaza un entorno desconocido", () => {
    process.env.NODE_ENV = "staging";
    expect(() => cargarConfiguracion()).toThrow(/NODE_ENV/);
  });
});
