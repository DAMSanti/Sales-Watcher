import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { operacionesSincronizadas, visitas } from "@sw/db";
import {
  esFalloPermanente,
  type RefVisita,
  type RespuestaLote,
  type ResultadoOperacion,
} from "@sw/shared";
import { SERVICIO_DB, type ClienteDb } from "../db/db.module";
import { ChecklistService } from "../visitas/checklist.service";
import { EvidenciasService } from "../evidencias/evidencias.service";
import { IncidenciasService } from "../incidencias/incidencias.service";
import { AccionesService } from "../acciones/acciones.service";
import { JustificacionesService } from "../visitas/justificaciones.service";
import { VisitasService } from "../visitas/visitas.service";
import type { PayloadToken } from "../auth/auth.service";
import type { OperacionDto } from "./dto/sincronizacion.dto";

@Injectable()
export class SincronizacionService {
  private readonly logger = new Logger(SincronizacionService.name);

  constructor(
    @Inject(SERVICIO_DB) private readonly db: ClienteDb,
    private readonly visitasService: VisitasService,
    private readonly justificaciones: JustificacionesService,
    private readonly checklist: ChecklistService,
    private readonly incidencias: IncidenciasService,
    private readonly acciones: AccionesService,
    private readonly evidencias: EvidenciasService,
  ) {}

  /**
   * Aplica un lote de operaciones encoladas por la PWA.
   *
   * DELIBERADAMENTE NO ES UNA TRANSACCIÓN ÚNICA. Envolver todo el lote haría
   * que una sola operación imposible —una justificación cuya ventana ya
   * cerró— revirtiera también las diez que sí valían, y como esa operación
   * fallaría igual en cada reintento, la cola del comercial quedaría atascada
   * para siempre y perdería el trabajo de toda la jornada.
   *
   * Cada operación se aplica por separado y se informa de su suerte. El
   * cliente descarta lo aplicado y lo permanentemente fallido, y reintenta
   * solo lo temporal.
   *
   * El orden SÍ importa: las operaciones se aplican secuencialmente porque
   * unas dependen de otras, y una visita creada en el índice 0 debe existir
   * antes de que el índice 1 intente comenzarla.
   */
  async aplicarLote(
    operaciones: OperacionDto[],
    usuario: PayloadToken,
  ): Promise<RespuestaLote> {
    /**
     * Traduce los identificadores de cliente a los de servidor a medida que se
     * van creando. Es lo que permite que el lote se refiera a cosas que aún no
     * existían cuando el dispositivo lo preparó.
     */
    const equivalencias = new Map<string, string>();
    const resultados: ResultadoOperacion[] = [];

    for (const [indice, operacion] of operaciones.entries()) {
      /**
       * ¿Ya se aplicó esta misma entrada de cola?
       *
       * Cubre el caso de la respuesta perdida: el servidor aplicó el lote
       * entero y el cliente, sin saberlo, lo reenvía. Reproducir el resultado
       * guardado evita volver a intentar la transición de estado, que
       * devolvería un conflicto por algo que ya salió bien.
       */
      const previa = await this.buscarAplicada(operacion.opId, usuario.sub);
      if (previa) {
        const registrado = previa as Omit<ResultadoOperacion, "indice" | "tipo">;
        // Se reconstruyen las equivalencias: las operaciones siguientes del
        // lote pueden referirse a lo que creó esta.
        if (registrado.idCliente && registrado.id) {
          equivalencias.set(registrado.idCliente, registrado.id);
        }
        resultados.push({
          ...registrado,
          indice,
          tipo: operacion.tipo,
          estado: "duplicada",
        });
        continue;
      }

      try {
        const resultado = await this.aplicarUna(operacion, usuario, equivalencias);
        await this.registrarAplicada(operacion, usuario.sub, resultado);
        resultados.push({ indice, tipo: operacion.tipo, ...resultado });
      } catch (error) {
        /**
         * Los fallos NO se registran. Un fallo temporal debe poder reintentarse
         * con el mismo `opId`, y un permanente no gana nada quedando anotado:
         * el cliente ya lo descarta de su cola al recibir la respuesta.
         */
        resultados.push({
          indice,
          tipo: operacion.tipo,
          ...this.clasificarError(error, operacion),
        });
      }
    }

    return {
      aplicadas: resultados.filter((r) => r.estado === "aplicada").length,
      duplicadas: resultados.filter((r) => r.estado === "duplicada").length,
      fallidasPermanentes: resultados.filter(
        (r) => r.estado === "fallida_permanente",
      ).length,
      fallidasTemporales: resultados.filter(
        (r) => r.estado === "fallida_temporal",
      ).length,
      resultados,
    };
  }

  private async aplicarUna(
    operacion: OperacionDto,
    usuario: PayloadToken,
    equivalencias: Map<string, string>,
  ): Promise<Omit<ResultadoOperacion, "indice" | "tipo">> {
    switch (operacion.tipo) {
      case "visita.crear": {
        const visita = await this.visitasService.crearNoPlanificada(
          operacion.tiendaId,
          usuario,
          operacion.idCliente,
        );
        if (operacion.idCliente) equivalencias.set(operacion.idCliente, visita.id);
        return {
          estado: "aplicada",
          id: visita.id,
          ...(operacion.idCliente ? { idCliente: operacion.idCliente } : {}),
        };
      }

      case "visita.comenzar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const { visita, desviacion } = await this.visitasService.comenzar(
          visitaId,
          usuario,
          operacion,
        );
        return {
          estado: "aplicada",
          id: visita.id,
          datos: { desviacion },
        };
      }

      case "visita.finalizar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const resultado = await this.visitasService.finalizar(
          visitaId,
          usuario,
          operacion,
        );
        return {
          estado: "aplicada",
          id: resultado.visita.id,
          datos: {
            incompleta: resultado.incompleta,
            duracionMinutos: resultado.duracionMinutos,
          },
        };
      }

      case "visita.justificar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const justificacion = await this.justificaciones.justificar(
          visitaId,
          usuario,
          operacion,
        );
        return {
          estado: "aplicada",
          id: justificacion.id,
          ...(operacion.idCliente ? { idCliente: operacion.idCliente } : {}),
        };
      }

      case "checklist.marcar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const resultado = await this.checklist.marcar(
          visitaId,
          operacion.itemId,
          operacion.completado,
          usuario,
          operacion.capturadaEn,
        );
        return { estado: "aplicada", id: resultado.id };
      }

      case "incidencia.crear": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const incidencia = await this.incidencias.crear(visitaId, usuario, operacion);
        if (operacion.idCliente) {
          equivalencias.set(operacion.idCliente, incidencia.id);
        }
        return {
          estado: "aplicada",
          id: incidencia.id,
          ...(operacion.idCliente ? { idCliente: operacion.idCliente } : {}),
        };
      }

      case "accion.registrar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const accion = await this.acciones.registrar(visitaId, usuario, operacion.datos);
        // La acción recién creada puede ser el destino de una comprobación
        // posterior del MISMO lote, así que se registra la equivalencia.
        if (operacion.datos.idCliente) {
          equivalencias.set(operacion.datos.idCliente, accion.id);
        }
        return {
          estado: "aplicada",
          id: accion.id,
          ...(operacion.datos.idCliente ? { idCliente: operacion.datos.idCliente } : {}),
        };
      }

      case "accion.comprobar": {
        // La acción puede haberse creado en este mismo lote y no tener aún id
        // de servidor: se resuelve por la equivalencia igual que las visitas.
        const accionId =
          equivalencias.get(operacion.accionId) ?? operacion.accionId;
        const visitaId = operacion.visita
          ? await this.resolverVisita(operacion.visita, equivalencias)
          : undefined;
        const comprobacion = await this.acciones.comprobar(accionId, usuario, {
          ...operacion.datos,
          ...(visitaId ? { visitaId } : {}),
        });
        return { estado: "aplicada", id: comprobacion.id };
      }

      case "relacion.guardar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const relacion = await this.acciones.guardarRelacionResponsable(
          visitaId,
          usuario,
          operacion.datos,
        );
        return { estado: "aplicada", id: relacion.id };
      }

      case "evidencia.reservar": {
        const visitaId = await this.resolverVisita(operacion.visita, equivalencias);
        const reserva = await this.evidencias.solicitarSubida(
          {
            ...operacion,
            visitaId,
            /** Una evidencia de incidencia puede apuntar a una creada en este lote. */
            incidenciaId: operacion.incidenciaIdCliente
              ? equivalencias.get(operacion.incidenciaIdCliente)
              : operacion.incidenciaId,
          },
          usuario,
        );
        if (operacion.idCliente) {
          equivalencias.set(operacion.idCliente, reserva.evidenciaId);
        }
        return {
          estado: reserva.yaConfirmada ? "duplicada" : "aplicada",
          id: reserva.evidenciaId,
          ...(operacion.idCliente ? { idCliente: operacion.idCliente } : {}),
          /** La URL firmada viaja de vuelta: el cliente sube y confirma después. */
          datos: { urlSubida: reserva.urlSubida },
        };
      }

      case "evidencia.confirmar": {
        const evidenciaId =
          operacion.evidenciaIdCliente !== undefined
            ? equivalencias.get(operacion.evidenciaIdCliente)
            : operacion.evidenciaId;

        if (!evidenciaId) {
          return {
            estado: "fallida_permanente",
            error: "No se pudo resolver la fotografía a confirmar",
          };
        }

        const resultado = await this.evidencias.confirmarSubida(evidenciaId, usuario);
        return { estado: "aplicada", id: resultado.evidenciaId };
      }
    }
  }

  /** Resultado guardado de una operación ya aplicada, si la hubo. */
  private async buscarAplicada(opId: string, usuarioId: string) {
    const [fila] = await this.db
      .select({ resultado: operacionesSincronizadas.resultado })
      .from(operacionesSincronizadas)
      .where(
        and(
          eq(operacionesSincronizadas.opId, opId),
          eq(operacionesSincronizadas.usuarioId, usuarioId),
        ),
      )
      .limit(1);

    return fila?.resultado ?? null;
  }

  /**
   * Anota la operación como aplicada.
   *
   * `onConflictDoNothing` cubre la carrera de dos lotes idénticos llegando a
   * la vez desde dos pestañas o dos reintentos solapados: el segundo no
   * revienta, simplemente no anota nada.
   *
   * Un fallo escribiendo aquí no tumba la operación, que ya se aplicó: lo peor
   * que puede pasar es que un reintento posterior la reintente de verdad, que
   * es exactamente el comportamiento que había antes de esta tabla.
   */
  private async registrarAplicada(
    operacion: OperacionDto,
    usuarioId: string,
    resultado: Omit<ResultadoOperacion, "indice" | "tipo">,
  ) {
    try {
      await this.db
        .insert(operacionesSincronizadas)
        .values({
          usuarioId,
          opId: operacion.opId,
          tipo: operacion.tipo,
          resultado: resultado as Record<string, unknown>,
        })
        .onConflictDoNothing();
    } catch (error) {
      this.logger.warn(
        `No se pudo anotar la operación "${operacion.opId}" como aplicada: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Resuelve la visita a la que apunta una operación.
   *
   * Prefiere el identificador de servidor cuando el cliente lo conoce. Si solo
   * trae `idCliente`, lo busca primero entre lo creado en este mismo lote y
   * después en base de datos: un lote anterior pudo haber creado la visita y
   * haberse perdido la respuesta por el camino.
   */
  private async resolverVisita(
    ref: RefVisita,
    equivalencias: Map<string, string>,
  ): Promise<string> {
    if (ref.id) return ref.id;

    if (ref.idCliente) {
      const enLote = equivalencias.get(ref.idCliente);
      if (enLote) return enLote;

      const [existente] = await this.db
        .select({ id: visitas.id })
        .from(visitas)
        .where(eq(visitas.idCliente, ref.idCliente))
        .limit(1);

      if (existente) {
        equivalencias.set(ref.idCliente, existente.id);
        return existente.id;
      }
    }

    /**
     * Se lanza como error de dominio para que caiga en la clasificación
     * normal. Es permanente: si la visita referenciada no existe ni se creó en
     * este lote, tampoco aparecerá en el siguiente.
     */
    throw new HttpException(
      "No se pudo resolver la visita referenciada por la operación",
      404,
    );
  }

  /**
   * Decide si el cliente debe reintentar.
   *
   * Un `HttpException` del dominio con código 4xx es permanente: los datos o
   * el estado no van a cambiar por reintentar. Cualquier otra cosa —una caída
   * de base de datos, un fallo del almacenamiento— es temporal, y ahí el sesgo
   * correcto es conservar: reintentar de más cuesta una petición; descartar de
   * menos pierde el trabajo de una visita entera.
   */
  private clasificarError(
    error: unknown,
    operacion: OperacionDto,
  ): Omit<ResultadoOperacion, "indice" | "tipo"> {
    const idCliente =
      "idCliente" in operacion && operacion.idCliente
        ? { idCliente: operacion.idCliente }
        : {};

    if (error instanceof HttpException) {
      const codigo = error.getStatus();
      const respuesta = error.getResponse();
      const mensaje =
        typeof respuesta === "string"
          ? respuesta
          : ((respuesta as { message?: string; mensaje?: string })?.message ??
            (respuesta as { mensaje?: string })?.mensaje ??
            error.message);

      return {
        estado: esFalloPermanente(codigo) ? "fallida_permanente" : "fallida_temporal",
        error: mensaje,
        ...idCliente,
      };
    }

    this.logger.error(
      `Fallo inesperado aplicando "${operacion.tipo}"`,
      error instanceof Error ? error.stack : String(error),
    );

    return {
      estado: "fallida_temporal",
      error: "Error interno al aplicar la operación",
      ...idCliente,
    };
  }
}
