/**
 * Infraestructura de internacionalización compartida por API y frontends.
 *
 * El sistema separa dos capas que no conviene mezclar (SPECS §4):
 *
 *  - Textos de INTERFAZ: ficheros de traducción versionados con el código.
 *    No pasan por aquí; los gestiona i18next en cada frontend.
 *  - CONTENIDO CONFIGURABLE: ítems de checklist, categorías, tipos de tienda
 *    y zonas. Lo introduce el administrador y viaja como dato. Es lo que
 *    resuelve este módulo.
 */

export const IDIOMAS = ["es", "eu", "ca", "fr", "en"] as const;

export type Idioma = (typeof IDIOMAS)[number];

/** Idioma por defecto y último eslabón de toda cadena de respaldo. */
export const IDIOMA_DEFECTO: Idioma = "es";

/** Texto traducible tal y como se almacena en las columnas JSONB. */
export type TextoI18n = Partial<Record<Idioma, string>>;

/**
 * Cadena de respaldo cuando falta una traducción.
 *
 * El respaldo de euskera y catalán es el castellano porque quien los usa lo
 * entiende. El francés respalda antes en inglés que en castellano por el mismo
 * motivo (ANEXO, decisión que cierra P9).
 */
export const CADENA_RESPALDO: Record<Idioma, readonly Idioma[]> = {
  es: [],
  eu: ["es"],
  ca: ["es"],
  fr: ["en", "es"],
  en: ["es"],
} as const;

/** Etiqueta de cada idioma en su propia lengua, para el selector. */
export const NOMBRE_IDIOMA: Record<Idioma, string> = {
  es: "Castellano",
  eu: "Euskara",
  ca: "Català",
  fr: "Français",
  en: "English",
};

/** Locale completo para formateo de fechas y números. */
export const LOCALE: Record<Idioma, string> = {
  es: "es-ES",
  eu: "eu-ES",
  ca: "ca-ES",
  fr: "fr-FR",
  // Británico, no americano: formatos de fecha DD/MM/YYYY, coherente con el
  // resto del sistema (ANEXO, decisión que cierra P14).
  en: "en-GB",
};

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === "string" && (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * Resuelve un texto traducible al idioma pedido, aplicando la cadena de
 * respaldo. Nunca devuelve cadena vacía ni la clave técnica.
 *
 * Devuelve también `idiomaUsado` para que la interfaz pueda avisar de que
 * está mostrando un respaldo. Sin esa señal, las traducciones faltantes se
 * descubren en producción cuando un comercial ve un ítem en el idioma
 * equivocado y nadie sabe por qué.
 */
export function resolverTexto(
  texto: TextoI18n | null | undefined,
  idioma: Idioma,
): { valor: string; idiomaUsado: Idioma | null; esRespaldo: boolean } {
  if (!texto) {
    return { valor: "", idiomaUsado: null, esRespaldo: false };
  }

  const directo = texto[idioma];
  if (directo && directo.trim() !== "") {
    return { valor: directo, idiomaUsado: idioma, esRespaldo: false };
  }

  for (const respaldo of CADENA_RESPALDO[idioma]) {
    const valor = texto[respaldo];
    if (valor && valor.trim() !== "") {
      return { valor, idiomaUsado: respaldo, esRespaldo: true };
    }
  }

  // Último recurso: cualquier idioma con contenido. Preferimos mostrar algo
  // en la lengua equivocada antes que un hueco en la pantalla del comercial.
  for (const candidato of IDIOMAS) {
    const valor = texto[candidato];
    if (valor && valor.trim() !== "") {
      return { valor, idiomaUsado: candidato, esRespaldo: true };
    }
  }

  return { valor: "", idiomaUsado: null, esRespaldo: false };
}

/** Atajo cuando no interesa saber si hubo respaldo. */
export function t(texto: TextoI18n | null | undefined, idioma: Idioma): string {
  return resolverTexto(texto, idioma).valor;
}

/**
 * Idiomas que le faltan a un texto configurable.
 * Alimenta el aviso de "traducciones pendientes" del backoffice, que es lo
 * que evita que los idiomas minoritarios se degraden por acumulación.
 */
export function idiomasFaltantes(texto: TextoI18n | null | undefined): Idioma[] {
  return IDIOMAS.filter((idioma) => {
    const valor = texto?.[idioma];
    return !valor || valor.trim() === "";
  });
}

/**
 * Negocia el idioma a partir de la preferencia del usuario y la cabecera
 * `Accept-Language`. La preferencia explícita siempre gana.
 */
export function negociarIdioma(
  preferenciaUsuario: string | null | undefined,
  acceptLanguage?: string | null,
): Idioma {
  if (esIdioma(preferenciaUsuario)) return preferenciaUsuario;

  if (acceptLanguage) {
    for (const parte of acceptLanguage.split(",")) {
      const codigo = parte.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
      if (esIdioma(codigo)) return codigo;
    }
  }

  return IDIOMA_DEFECTO;
}
