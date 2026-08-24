import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idPk } from "./comunes";
import { usuarios } from "./usuarios";

/**
 * Registro de auditoría: quién hizo qué y cuándo.
 *
 * Es un requisito no funcional explícito (SPECS §8) y su razón de ser es
 * resolver disputas. Cuando un supervisor cuestione una justificación o el
 * resultado de un checklist, esta tabla es la que responde.
 *
 * Es append-only por diseño. No lleva `actualizadoEn` ni se modifica nunca:
 * un registro de auditoría editable no vale como registro de auditoría.
 *
 * `usuarioId` es nullable y NO cascadea: si se borrase el usuario, el rastro
 * de sus acciones debe sobrevivir. Por eso además se copia `numeroTrabajador`
 * como texto plano, que conserva la identidad aunque la ficha desaparezca.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: idPk(),

    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    /** Copia desnormalizada a propósito: sobrevive al borrado del usuario. */
    numeroTrabajador: text("numero_trabajador"),

    /** Verbo del dominio: `visita.finalizada`, `justificacion.creada`, … */
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id"),

    /**
     * Estado anterior y posterior de los campos que cambiaron.
     * Solo el delta, no la entidad entera: el volumen crece rápido con
     * cientos de visitas al día.
     */
    cambios: jsonb("cambios").$type<Record<string, { antes: unknown; despues: unknown }>>(),

    ip: text("ip"),
    agenteUsuario: text("agente_usuario"),

    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    porEntidad: index("auditoria_entidad_idx").on(t.entidad, t.entidadId),
    porUsuario: index("auditoria_usuario_idx").on(t.usuarioId),
    porFecha: index("auditoria_ocurrido_en_idx").on(t.ocurridoEn),
  }),
);
