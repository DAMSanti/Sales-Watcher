import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { zonas } from "./catalogos";
import { idPk, idiomaEnum, marcasTiempo, rolEnum } from "./comunes";

/**
 * Usuarios internos del sistema: comerciales, supervisores y administradores.
 *
 * El encargado de tienda NO está aquí. Es interlocutor del comercial durante
 * la visita, no usuario del sistema (ANEXO, decisión que cierra P1).
 */
export const usuarios = pgTable(
  "usuarios",
  {
    id: idPk(),
    /** Credencial de acceso: el comercial no usa email para entrar (SPECS §5.1). */
    numeroTrabajador: text("numero_trabajador").notNull().unique(),
    nombre: text("nombre").notNull(),
    email: text("email"),
    rol: rolEnum("rol").notNull(),
    zonaId: uuid("zona_id").references(() => zonas.id),

    passwordHash: text("password_hash").notNull(),
    /**
     * Se activa cuando el administrador regenera la contraseña desde el
     * backoffice. Sin este forzado, acabaría habiendo comerciales usando
     * indefinidamente una contraseña temporal que un tercero conoce y que
     * probablemente viajó por WhatsApp (ANEXO, decisión que cierra P8).
     */
    requiereCambioPassword: boolean("requiere_cambio_password")
      .notNull()
      .default(false),

    /**
     * Momento del último cambio de contraseña. Es el interruptor de emergencia
     * de las sesiones.
     *
     * Los tokens duran 30 días porque el comercial no puede estar
     * reautenticándose en tienda (SPECS §5.1), pero eso significa que una
     * credencial robada seguiría viva un mes. Cada token lleva dentro la fecha
     * de emisión y el guard la compara con este campo: al cambiar o regenerar
     * la contraseña, todos los tokens emitidos antes dejan de valer al
     * instante. Sin esto, regenerar la contraseña de un móvil perdido no
     * cerraría la sesión que ya estaba abierta en él.
     */
    passwordCambiadoEn: timestamp("password_cambiado_en", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),

    idiomaPreferido: idiomaEnum("idioma_preferido").notNull().default("es"),

    /** Protección básica contra fuerza bruta (SPECS §5.1). */
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true, mode: "date" }),
    ultimoAccesoEn: timestamp("ultimo_acceso_en", { withTimezone: true, mode: "date" }),

    activo: boolean("activo").notNull().default(true),
    ...marcasTiempo,
  },
  (t) => ({
    porZona: index("usuarios_zona_idx").on(t.zonaId),
    porRol: index("usuarios_rol_idx").on(t.rol),
  }),
);
