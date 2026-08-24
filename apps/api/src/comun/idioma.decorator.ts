import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { negociarIdioma, type Idioma } from "@sw/shared";
import type { Request } from "express";

/**
 * Resuelve el idioma de la respuesta.
 *
 * La preferencia guardada del usuario gana sobre `Accept-Language`: el
 * comercial la eligió a propósito y el navegador del móvil corporativo puede
 * estar en otro idioma sin que eso signifique nada.
 *
 * Funciona también sin sesión, para la pantalla de login.
 */
export const IdiomaActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): Idioma => {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    return negociarIdioma(
      peticion.usuario?.idioma,
      peticion.headers["accept-language"],
    );
  },
);
