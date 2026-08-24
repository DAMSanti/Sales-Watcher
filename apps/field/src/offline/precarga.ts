import type { Idioma } from "@sw/shared";
import { pedir } from "../api/cliente";
import type { Checklist, IncidenciaVisita, TarjetaVisita } from "../api/tipos";
import { guardarCache } from "./almacen";

/**
 * Descarga por adelantado todo lo que hará falta sin cobertura.
 *
 * Es un requisito explícito de la especificación (SPECS §4): cargar la ruta
 * del día y los catálogos al iniciar sesión. La razón práctica es que el
 * comercial pierde la señal DENTRO de la tienda, no antes de entrar: si el
 * checklist se descargara al abrir cada visita, la primera que abriese en un
 * sótano ya no tendría nada.
 *
 * Se ejecuta en segundo plano y NO bloquea la pantalla: si algo falla, se
 * habrá cacheado lo que llegara y el resto se intentará en la siguiente carga.
 */
export async function precargarJornada(
  visitas: TarjetaVisita[],
  idioma: Idioma,
): Promise<{ visitas: number; fallos: number }> {
  if (!navigator.onLine) return { visitas: 0, fallos: 0 };

  let cacheadas = 0;
  let fallos = 0;

  /** Catálogos que necesitan los formularios de incidencia y justificación. */
  await Promise.allSettled([
    pedir("/categorias", { idioma }).then((d) => guardarCache("categorias", d)),
    pedir("/visitas/motivos", { idioma }).then((d) => guardarCache("motivos", d)),
  ]);

  /**
   * Las visitas se recorren de una en una, no en paralelo.
   *
   * Una ruta son cinco o seis tiendas; lanzarlas a la vez sobre una red móvil
   * mediocre compite con lo que el comercial esté haciendo en ese momento y
   * puede hacer que ninguna termine.
   */
  for (const visita of visitas) {
    if (!visita.visitaId) continue;
    /** Las cerradas ya no se van a editar: no merecen ocupar la caché. */
    if (visita.estado === "finalizada" || visita.estado === "no_realizada") continue;

    try {
      const [lista, incidenciasVisita] = await Promise.all([
        pedir<Checklist>(`/visitas/${visita.visitaId}/checklist`, { idioma }),
        pedir<IncidenciaVisita[]>(`/visitas/${visita.visitaId}/incidencias`, { idioma }),
      ]);
      await guardarCache(`visita/${visita.visitaId}`, { lista, incidenciasVisita });
      cacheadas++;
    } catch {
      /** Un fallo suelto no aborta la precarga: se seguirá con las demás. */
      fallos++;
    }
  }

  return { visitas: cacheadas, fallos };
}
