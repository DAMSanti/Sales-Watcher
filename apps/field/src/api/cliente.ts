import type { Idioma } from "@sw/shared";

/**
 * Cliente HTTP de la app de campo.
 *
 * Rutas relativas a propósito: en desarrollo las resuelve el proxy de Vite y
 * en producción la app y la API pueden servirse tras el mismo dominio sin
 * tocar el código ni introducir una variable de entorno más.
 */

const CLAVE_TOKEN = "sw.token";

export class ErrorApi extends Error {
  constructor(
    readonly codigo: number,
    mensaje: string,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }

  /**
   * Distingue un fallo de red de una respuesta de error del servidor.
   *
   * Es la diferencia entre "estás sin cobertura, tu trabajo está a salvo en la
   * cola" y "el servidor ha rechazado esto". Confundirlas produce el peor
   * mensaje posible para un comercial en tienda: un error rojo cuando lo único
   * que pasa es que está en un sótano.
   */
  get esFalloDeRed() {
    return this.codigo === 0;
  }
}

export function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    // Modo privado o almacenamiento bloqueado: se trabaja sin sesión guardada.
    return null;
  }
}

export function guardarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* Sin persistencia, la sesión durará lo que dure la pestaña. */
  }
}

type Opciones = {
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  cuerpo?: unknown;
  idioma?: Idioma;
  /** Señal para cancelar la petición si la pantalla se desmonta. */
  senal?: AbortSignal;
};

export async function pedir<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const token = leerToken();
  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };

  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (opciones.idioma) cabeceras["Accept-Language"] = opciones.idioma;

  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: opciones.senal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // Código 0 = no hubo respuesta. Sin cobertura, no es culpa de los datos.
    throw new ErrorApi(0, "Sin conexión con el servidor");
  }

  if (respuesta.status === 204) return undefined as T;

  const texto = await respuesta.text();
  const datos = texto ? safeJson(texto) : null;

  if (!respuesta.ok) {
    /**
     * La sesión caducó o la contraseña cambió en el backoffice. Se limpia el
     * token para que la app vuelva al login en lugar de quedarse reintentando
     * con una credencial muerta.
     */
    if (respuesta.status === 401) guardarToken(null);

    throw new ErrorApi(
      respuesta.status,
      extraerMensaje(datos) ?? `Error ${respuesta.status}`,
      datos,
    );
  }

  return datos as T;
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/**
 * La API devuelve el mensaje en `message` (excepciones de Nest) o en `mensaje`
 * (errores de validación propios). Algunas respuestas anidan un objeto, como
 * la de ventana de justificación cerrada.
 */
function extraerMensaje(datos: unknown): string | null {
  if (typeof datos === "string") return datos;
  if (!datos || typeof datos !== "object") return null;

  const objeto = datos as Record<string, unknown>;
  const candidato = objeto.message ?? objeto.mensaje;

  if (typeof candidato === "string") return candidato;
  if (candidato && typeof candidato === "object") {
    const anidado = (candidato as Record<string, unknown>).mensaje;
    if (typeof anidado === "string") return anidado;
  }
  return null;
}
