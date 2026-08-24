import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fallidas, pendientes, type OperacionEncolada } from "./almacen";
import { alCambiarLaCola, iniciarSincronizacionAutomatica, sincronizar } from "./cola";

type EstadoSincronizacion = {
  enLinea: boolean;
  pendientes: OperacionEncolada[];
  fallidas: OperacionEncolada[];
  sincronizando: boolean;
  refrescar: () => Promise<void>;
  forzarSincronizacion: () => Promise<void>;
};

const Contexto = createContext<EstadoSincronizacion | null>(null);

export function ProveedorSincronizacion({ children }: { children: ReactNode }) {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [cola, setCola] = useState<OperacionEncolada[]>([]);
  const [rechazadas, setRechazadas] = useState<OperacionEncolada[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const refrescar = useCallback(async () => {
    const [p, f] = await Promise.all([pendientes(), fallidas()]);
    setCola(p);
    setRechazadas(f);
  }, []);

  /** El estado de red se sigue por eventos: el comercial entra y sale de
   *  cobertura varias veces en la misma visita. */
  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener("online", conectado);
    window.addEventListener("offline", desconectado);
    return () => {
      window.removeEventListener("online", conectado);
      window.removeEventListener("offline", desconectado);
    };
  }, []);

  useEffect(() => {
    void refrescar();
    const dejarDeEscuchar = alCambiarLaCola(() => void refrescar());
    const parar = iniciarSincronizacionAutomatica();
    return () => {
      dejarDeEscuchar();
      parar();
    };
  }, [refrescar]);

  const forzarSincronizacion = useCallback(async () => {
    setSincronizando(true);
    try {
      await sincronizar();
      await refrescar();
    } finally {
      setSincronizando(false);
    }
  }, [refrescar]);

  const valor = useMemo<EstadoSincronizacion>(
    () => ({
      enLinea,
      pendientes: cola,
      fallidas: rechazadas,
      sincronizando,
      refrescar,
      forzarSincronizacion,
    }),
    [enLinea, cola, rechazadas, sincronizando, refrescar, forzarSincronizacion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSincronizacion() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useSincronizacion fuera de ProveedorSincronizacion");
  return contexto;
}
