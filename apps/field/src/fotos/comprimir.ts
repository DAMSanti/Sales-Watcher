/**
 * Compresión y redimensionado de fotografías en el dispositivo.
 *
 * Es un requisito no funcional explícito (SPECS §8) y la razón es doble: las
 * fotos sin comprimir consumen los datos móviles del comercial —que suele ser
 * su tarifa— y llenan el almacenamiento a razón de cientos de visitas al día.
 *
 * Una foto de móvil moderno ronda los 4 MB; tras pasar por aquí baja a unos
 * 200-400 KB sin que se deje de leer una etiqueta de precio en el lineal, que
 * es para lo que sirve.
 */

/**
 * Lado mayor máximo.
 *
 * 1600 px es suficiente para leer un precio o una fecha de caducidad al hacer
 * zoom desde el backoffice, y bastante menos que los 4000 px que entrega la
 * cámara. Subir de ahí multiplica el peso sin añadir información útil.
 */
const LADO_MAXIMO = 1600;

/** Calidad JPEG. Por debajo de 0,7 empiezan a verse artefactos en el texto. */
const CALIDAD = 0.8;

export type FotoComprimida = {
  blob: Blob;
  tipoMime: string;
  ancho: number;
  alto: number;
  tamanoBytes: number;
  /** Peso original, para poder informar de cuánto se ahorró. */
  tamanoOriginal: number;
};

export async function comprimir(fichero: File): Promise<FotoComprimida> {
  const imagen = await cargarImagen(fichero);

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const contexto = lienzo.getContext("2d");
  if (!contexto) throw new Error("No se pudo preparar la imagen");

  /**
   * Fondo blanco antes de dibujar: un PNG con transparencia convertido a JPEG
   * mostraría las zonas transparentes en negro, y una foto de lineal con
   * manchas negras parece un fallo de cámara.
   */
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, ancho, alto);
  contexto.drawImage(imagen, 0, 0, ancho, alto);

  if ("close" in imagen && typeof imagen.close === "function") imagen.close();

  const blob = await new Promise<Blob | null>((resolver) =>
    lienzo.toBlob(resolver, "image/jpeg", CALIDAD),
  );

  if (!blob) throw new Error("No se pudo comprimir la imagen");

  return {
    blob,
    tipoMime: "image/jpeg",
    ancho,
    alto,
    tamanoBytes: blob.size,
    tamanoOriginal: fichero.size,
  };
}

/**
 * Decodifica el fichero.
 *
 * Se prefiere `createImageBitmap` porque respeta la orientación EXIF: sin él,
 * las fotos hechas en vertical con algunos móviles se suben giradas 90 grados
 * y el supervisor ve el lineal de lado. El respaldo con `<img>` es para
 * navegadores que no admiten la opción.
 */
async function cargarImagen(fichero: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(fichero, { imageOrientation: "from-image" });
    } catch {
      /* Sin soporte de la opción: se cae al respaldo. */
    }
  }

  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(fichero);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("No se pudo leer la imagen"));
    };
    imagen.src = url;
  });
}
