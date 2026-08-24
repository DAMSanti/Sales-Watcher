import { describe, expect, it } from "vitest";
import { esFalloPermanente, MAX_OPERACIONES_LOTE } from "./sincronizacion";

/**
 * La clasificación de fallos es el contrato más delicado de la cola offline.
 *
 * Equivocarse en un sentido atasca la cola para siempre con algo que nunca va
 * a entrar; equivocarse en el otro descarta trabajo real de campo que sí
 * habría entrado al segundo intento.
 */
describe("esFalloPermanente", () => {
  it("trata como permanente lo que no cambia por reintentar", () => {
    // Datos inválidos: el mismo cuerpo dará el mismo error siempre.
    expect(esFalloPermanente(400)).toBe(true);
    // Sin permiso sobre el recurso.
    expect(esFalloPermanente(403)).toBe(true);
    // La visita referenciada no existe y no va a aparecer.
    expect(esFalloPermanente(404)).toBe(true);
    // Ventana cerrada, visita ya finalizada, transición imposible.
    expect(esFalloPermanente(409)).toBe(true);
  });

  it("trata como temporal todo lo demás", () => {
    // Caída de base de datos o del almacenamiento.
    expect(esFalloPermanente(500)).toBe(false);
    expect(esFalloPermanente(502)).toBe(false);
    expect(esFalloPermanente(503)).toBe(false);
    // Límite de peticiones: reintentar más tarde es exactamente lo correcto.
    expect(esFalloPermanente(429)).toBe(false);
  });

  /**
   * El sesgo por defecto debe ser conservar. Un código desconocido reintentado
   * de más cuesta una petición; descartado de menos pierde el trabajo de una
   * visita entera.
   */
  it("ante un código desconocido, conserva en lugar de descartar", () => {
    expect(esFalloPermanente(418)).toBe(false);
    expect(esFalloPermanente(0)).toBe(false);
  });
});

describe("MAX_OPERACIONES_LOTE", () => {
  /**
   * Una jornada real son unas 10 visitas por unas 12 operaciones cada una.
   * El tope debe cubrir un día entero acumulado sin cobertura con margen, o
   * la cola no llegaría a vaciarse nunca de una sentada.
   */
  it("cubre una jornada completa sin sincronizar", () => {
    const operacionesPorVisita = 12;
    const visitasPorJornada = 10;
    expect(MAX_OPERACIONES_LOTE).toBeGreaterThan(
      operacionesPorVisita * visitasPorJornada,
    );
  });
});
