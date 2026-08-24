import { SetMetadata } from "@nestjs/common";

export const ES_PUBLICO = "es_publico";

/**
 * Exime a un endpoint de autenticación.
 *
 * El guard JWT es global, así que este decorador es la única forma de abrir
 * una ruta. Usarlo con cuidado: cada `@Publico()` es una puerta sin cerradura.
 */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
