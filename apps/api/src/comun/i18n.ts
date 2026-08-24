import { t, type Idioma, type TextoI18n } from "@sw/shared";

/**
 * Resuelve el contenido configurable al idioma del usuario antes de
 * devolverlo.
 *
 * La API entrega texto ya resuelto, no el objeto JSONB entero. Dos motivos:
 * el cliente offline no debería tener que reimplementar la cadena de
 * respaldo, y enviar los cinco idiomas de cada ítem de checklist multiplicaría
 * por cinco el tamaño de la carga inicial que el comercial descarga en tienda,
 * a menudo con mala cobertura.
 */
export function resolver(texto: TextoI18n | null, idioma: Idioma): string {
  return t(texto, idioma);
}
