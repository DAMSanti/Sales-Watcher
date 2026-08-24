import type { Request } from "express";

/**
 * Extrae IP y agente de usuario para la auditoría.
 *
 * `x-forwarded-for` puede traer una cadena de proxies; se toma el primero, que
 * es el cliente original. Requiere que Express tenga `trust proxy` activado
 * cuando la API va detrás de un balanceador, o la cabecera sería falsificable.
 */
export function contextoDe(peticion: Request) {
  const reenviada = peticion.headers["x-forwarded-for"];
  const ip =
    (typeof reenviada === "string" ? reenviada.split(",")[0]?.trim() : undefined) ??
    peticion.ip;

  return {
    ip: ip ?? undefined,
    agenteUsuario: peticion.headers["user-agent"] ?? undefined,
  };
}
