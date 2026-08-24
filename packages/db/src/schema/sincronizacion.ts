import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idPk } from "./comunes";
import { usuarios } from "./usuarios";

/**
 * Registro de operaciones de sincronización ya aplicadas.
 *
 * Existe para un fallo concreto y muy real: el dispositivo envía un lote, el
 * servidor lo aplica entero, y la respuesta se pierde por el camino. El
 * cliente, que no sabe qué pasó, reintenta el lote.
 *
 * Sin esta tabla, las operaciones que crean entidades se resuelven solas por
 * sus claves únicas, pero las TRANSICIONES DE ESTADO no: reintentar "comenzar
 * visita" sobre una visita ya finalizada devuelve un conflicto, y el comercial
 * vería "no se pudo comenzar la visita" de una visita que sí se registró
 * correctamente. Datos bien, mensaje aterrador.
 *
 * Guardando el resultado de cada operación aplicada, el reintento devuelve lo
 * mismo que la primera vez en lugar de volver a intentar la transición.
 */
export const operacionesSincronizadas = pgTable(
  "operaciones_sincronizadas",
  {
    id: idPk(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),

    /**
     * Identificador que el dispositivo asigna a cada entrada de su cola.
     *
     * Distinto de `id_cliente`, que identifica una ENTIDAD (esta visita, esta
     * incidencia) y sirve para referenciarla entre operaciones. Este identifica
     * la OPERACIÓN (este intento de finalizar), y sirve para no repetirla.
     */
    opId: text("op_id").notNull(),

    tipo: text("tipo").notNull(),
    /** Respuesta devuelta la primera vez, para reproducirla tal cual. */
    resultado: jsonb("resultado").$type<Record<string, unknown>>(),

    aplicadaEn: timestamp("aplicada_en", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /**
     * Acotado por usuario: dos dispositivos distintos pueden generar el mismo
     * identificador sin que uno pise el registro del otro.
     */
    operacionUnica: uniqueIndex("operaciones_sincronizadas_unica").on(
      t.usuarioId,
      t.opId,
    ),
    /** La purga barre por antigüedad. */
    porFecha: index("operaciones_sincronizadas_fecha_idx").on(t.aplicadaEn),
  }),
);
