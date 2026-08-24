import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Idioma } from "@sw/shared";
import { ErrorApi, guardarToken, leerToken, pedir } from "../api/cliente";
import { limpiar } from "../offline/almacen";
import type { Perfil, RespuestaLogin } from "../api/tipos";

type Sesion = {
  perfil: Perfil | null;
  cargando: boolean;
  /** true cuando hay token guardado pero no se pudo validar por falta de red. */
  sinVerificar: boolean;
  entrar: (numeroTrabajador: string, password: string) => Promise<void>;
  salir: () => void;
  cambiarPassword: (actual: string, nueva: string) => Promise<void>;
  idioma: Idioma;
  fijarIdioma: (idioma: Idioma) => void;
};

const ContextoSesion = createContext<Sesion | null>(null);
const CLAVE_IDIOMA = "sw.idioma";
const CLAVE_PERFIL = "sw.perfil";

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinVerificar, setSinVerificar] = useState(false);
  const [idioma, setIdiomaEstado] = useState<Idioma>(
    () => (leerLocal(CLAVE_IDIOMA) as Idioma) ?? "es",
  );

  /**
   * Al arrancar se valida el token contra la API.
   *
   * Si no hay red, NO se cierra la sesión: se recupera el perfil guardado y se
   * marca como sin verificar. El comercial abre la app en un sótano sin
   * cobertura y tiene que poder trabajar; expulsarle al login sería
   * exactamente lo contrario de una app offline-first.
   */
  useEffect(() => {
    const token = leerToken();
    if (!token) {
      setCargando(false);
      return;
    }

    let vigente = true;
    pedir<Perfil>("/auth/yo")
      .then((p) => {
        if (!vigente) return;
        setPerfil(p);
        setSinVerificar(false);
        guardarLocal(CLAVE_PERFIL, JSON.stringify(p));
        if (p.idioma) fijarIdiomaLocal(p.idioma);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        if (error instanceof ErrorApi && error.esFalloDeRed) {
          const guardado = leerLocal(CLAVE_PERFIL);
          if (guardado) {
            setPerfil(JSON.parse(guardado) as Perfil);
            setSinVerificar(true);
          }
        }
        // Un 401 ya limpió el token en el cliente: se queda sin sesión.
      })
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
  }, []);

  const fijarIdiomaLocal = (nuevo: Idioma) => {
    setIdiomaEstado(nuevo);
    guardarLocal(CLAVE_IDIOMA, nuevo);
  };

  const entrar = useCallback(async (numeroTrabajador: string, password: string) => {
    const respuesta = await pedir<RespuestaLogin>("/auth/login", {
      metodo: "POST",
      cuerpo: { numeroTrabajador, password },
    });

    guardarToken(respuesta.token);

    const nuevo: Perfil = {
      id: respuesta.usuario.id,
      numeroTrabajador: respuesta.usuario.numeroTrabajador,
      rol: respuesta.usuario.rol as Perfil["rol"],
      zonaId: respuesta.usuario.zonaId,
      idioma: respuesta.usuario.idiomaPreferido,
      requiereCambioPassword: respuesta.requiereCambioPassword,
    };

    setPerfil(nuevo);
    setSinVerificar(false);
    guardarLocal(CLAVE_PERFIL, JSON.stringify(nuevo));
    fijarIdiomaLocal(respuesta.usuario.idiomaPreferido);
  }, []);

  const salir = useCallback(() => {
    guardarToken(null);
    borrarLocal(CLAVE_PERFIL);
    /**
     * Se vacía el almacén local. Los móviles se comparten entre turnos, y sin
     * esto el siguiente comercial vería la ruta y las visitas del anterior.
     */
    void limpiar();
    setPerfil(null);
    setSinVerificar(false);
  }, []);

  const cambiarPassword = useCallback(async (actual: string, nueva: string) => {
    const respuesta = await pedir<{ token: string }>("/auth/password/cambiar", {
      metodo: "POST",
      cuerpo: { passwordActual: actual, passwordNueva: nueva },
    });

    // El cambio invalida el token anterior; la API devuelve uno nuevo.
    guardarToken(respuesta.token);
    const actualizado = await pedir<Perfil>("/auth/yo");
    setPerfil(actualizado);
    guardarLocal(CLAVE_PERFIL, JSON.stringify(actualizado));
  }, []);

  const valor = useMemo<Sesion>(
    () => ({
      perfil,
      cargando,
      sinVerificar,
      entrar,
      salir,
      cambiarPassword,
      idioma,
      fijarIdioma: fijarIdiomaLocal,
    }),
    [perfil, cargando, sinVerificar, entrar, salir, cambiarPassword, idioma],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion() {
  const contexto = useContext(ContextoSesion);
  if (!contexto) throw new Error("useSesion fuera de ProveedorSesion");
  return contexto;
}

/** Envoltorios tolerantes: en modo privado el almacenamiento puede lanzar. */
function leerLocal(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardarLocal(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin persistencia */
  }
}
function borrarLocal(clave: string) {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* sin persistencia */
  }
}
