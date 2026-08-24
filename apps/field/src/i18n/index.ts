import { IDIOMAS, type Idioma } from "@sw/shared";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import ca from "./locales/ca.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import eu from "./locales/eu.json";
import fr from "./locales/fr.json";

/**
 * Traducciones de la INTERFAZ.
 *
 * Van empaquetadas con la aplicación, no se piden a la API. Es lo que permite
 * que la pantalla de login funcione sin sesión y que la app entera siga
 * legible sin cobertura: un texto de interfaz que hubiera que descargar
 * dejaría botones vacíos justo en el sótano donde el comercial trabaja.
 *
 * El contenido configurable —ítems de checklist, categorías, motivos— viaja
 * como dato desde la API, ya resuelto al idioma del usuario.
 */
export const recursos = { es, eu, ca, fr, en };

/**
 * Cadena de respaldo, la misma que aplica el servidor. Duplicarla con otro
 * criterio haría que un mismo hueco se rellenara distinto en cliente y
 * servidor dentro de la misma pantalla.
 */
const respaldo: Record<Idioma, Idioma[]> = {
  es: [],
  eu: ["es"],
  ca: ["es"],
  fr: ["en", "es"],
  en: ["es"],
};

export function iniciarI18n(idioma: Idioma) {
  void i18next.use(initReactI18next).init({
    resources: Object.fromEntries(
      IDIOMAS.map((i) => [i, { translation: recursos[i] }]),
    ),
    lng: idioma,
    fallbackLng: respaldo,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  return i18next;
}

export { i18next };
