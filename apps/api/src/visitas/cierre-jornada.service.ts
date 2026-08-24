import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, inArray, sql } from "drizzle-orm";
import { rutasDiarias, usuarios, visitas, zonas } from "@sw/db";
import { fechaLocal, instanteCierreJornada } from "@sw/shared";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import type { Configuracion } from "../config/configuracion";

/**
 * Cierre de jornada: convierte en `no_realizada` las visitas planificadas que
 * siguen pendientes al terminar el día.
 *
 * No se reprograman automáticamente. Arrastrar visitas al día siguiente infla
 * la ruta en silencio hasta hacerla imposible de cubrir; que el supervisor vea
 * la no realización y decida es más sano que un automatismo que oculta el
 * problema (ANEXO, decisión que cierra P4).
 *
 * Las visitas que se cierran así quedan con `justificada: false`, que es un
 * desenlace peor y distinto: el comercial dejó pasar la ventana sin decir por
 * qué. El backoffice los separa visualmente.
 */
@Injectable()
export class CierreJornadaService {
  private readonly logger = new Logger(CierreJornadaService.name);
  private ejecutando = false;

  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly config: ConfigService<Configuracion, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Cada hora, no una vez al día.
   *
   * El cierre tiene semántica de hora LOCAL, y distintas zonas la alcanzan en
   * momentos distintos: cuando en la Península son las 21:00, en Canarias son
   * las 20:00 y allí todavía se trabaja. Un único disparo diario obligaría a
   * elegir la zona de quién, y cerraría la jornada de los demás antes o
   * después de tiempo.
   *
   * Ejecutar cada hora y comprobar zona por zona es simple y correcto; el
   * coste es una consulta barata por hora.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async ejecutarProgramado(): Promise<void> {
    await this.ejecutar();
  }

  async ejecutar(ahora = new Date()) {
    if (this.ejecutando) {
      this.logger.warn("Cierre de jornada ya en curso, se omite");
      return { cerradas: 0, porZona: {} as Record<string, number> };
    }
    this.ejecutando = true;

    try {
      const horaCierre = this.config.get("CIERRE_JORNADA_HORA", { infer: true });
      const listaZonas = await this.db
        .select({ id: zonas.id, codigo: zonas.codigo, tz: zonas.zonaHoraria })
        .from(zonas)
        .where(eq(zonas.activo, true));

      const porZona: Record<string, number> = {};
      let total = 0;

      for (const zona of listaZonas) {
        const hoy = fechaLocal(ahora, zona.tz);
        const limite = instanteCierreJornada(hoy, zona.tz, horaCierre);

        // Aún no ha cerrado la jornada en esta zona: no se toca nada.
        if (ahora < limite) continue;

        const cerradas = await this.cerrarZona(zona.id, hoy);
        if (cerradas > 0) {
          porZona[zona.codigo] = cerradas;
          total += cerradas;
        }
      }

      if (total > 0) {
        this.logger.log(
          `Cierre de jornada: ${total} visita(s) marcadas como no realizadas ${JSON.stringify(porZona)}`,
        );
      }

      return { cerradas: total, porZona };
    } finally {
      this.ejecutando = false;
    }
  }

  /**
   * Cierra las visitas pendientes de una zona para una fecha local.
   *
   * Hace DOS cosas, y la segunda es la importante:
   *
   *  1. Marca como `no_realizada` las visitas que existen en estado pendiente.
   *  2. CREA la fila de las tiendas planificadas que el comercial nunca llegó
   *     a abrir.
   *
   * El segundo caso es el habitual, no el raro: quien no visita una tienda
   * normalmente tampoco toca la app, así que no hay fila en `visitas` — solo
   * una ruta asignada sin nada colgando. Sin materializarlas aquí, el
   * incumplimiento más frecuente no dejaría rastro y la bandeja del supervisor
   * mostraría cero.
   *
   * Solo afecta a visitas PLANIFICADAS. Una visita extra que el comercial creó
   * y no llegó a empezar no es un incumplimiento: nadie se la asignó.
   */
  private async cerrarZona(zonaId: string, fecha: string): Promise<number> {
    const comerciales = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(
        and(
          eq(usuarios.zonaId, zonaId),
          eq(usuarios.rol, "comercial"),
          eq(usuarios.activo, true),
        ),
      );

    if (comerciales.length === 0) return 0;
    const ids = comerciales.map((c) => c.id);

    const cerradas = await this.db
      .update(visitas)
      .set({ estado: "no_realizada", justificada: false })
      .where(
        and(
          inArray(visitas.usuarioId, ids),
          eq(visitas.fecha, fecha),
          eq(visitas.estado, "pendiente"),
          eq(visitas.planificada, true),
        ),
      )
      .returning({ id: visitas.id });

    /**
     * Rutas del día sin visita asociada. El `NOT EXISTS` evita crear una
     * segunda fila para tiendas que sí se abrieron, y hace la operación
     * repetible: si el cierre se ejecuta dos veces, la segunda no duplica.
     */
    const sinAbrir = await this.db
      .select({
        rutaId: rutasDiarias.id,
        usuarioId: rutasDiarias.usuarioId,
        tiendaId: rutasDiarias.tiendaId,
      })
      .from(rutasDiarias)
      .where(
        and(
          inArray(rutasDiarias.usuarioId, ids),
          eq(rutasDiarias.fecha, fecha),
          /**
           * Se comprueba por comercial + tienda + fecha, no solo por ruta.
           *
           * Si el comercial llegó a esa tienda por el buscador, existe ya una
           * visita suya sin enlazar a la ruta. Insertar otra dejaría dos
           * visitas de la misma tienda el mismo día: una finalizada y otra
           * marcada como no realizada, que es peor que no registrar nada.
           */
          sql`not exists (
            select 1 from ${visitas}
            where ${visitas.usuarioId} = ${rutasDiarias.usuarioId}
              and ${visitas.tiendaId} = ${rutasDiarias.tiendaId}
              and ${visitas.fecha} = ${rutasDiarias.fecha}
          )`,
        ),
      );

    const creadas = sinAbrir.length
      ? await this.db
          .insert(visitas)
          .values(
            sinAbrir.map((r) => ({
              usuarioId: r.usuarioId,
              tiendaId: r.tiendaId,
              rutaDiariaId: r.rutaId,
              fecha,
              estado: "no_realizada" as const,
              planificada: true,
              justificada: false,
            })),
          )
          .returning({ id: visitas.id })
      : [];

    for (const visita of [...cerradas, ...creadas]) {
      await this.auditoria.registrar({
        accion: "visita.cerrada_sin_justificar",
        entidad: "visita",
        entidadId: visita.id,
        cambios: {
          estado: { antes: "pendiente", despues: "no_realizada" },
          justificada: { antes: null, despues: false },
        },
      });
    }

    return cerradas.length + creadas.length;
  }
}
