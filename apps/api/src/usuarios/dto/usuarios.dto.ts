import { IDIOMAS } from "@sw/shared";
import { z } from "zod";

const rol = z.enum(["comercial", "supervisor", "administrador"]);
const idioma = z.enum(IDIOMAS);

export const crearUsuarioSchema = z.object({
  numeroTrabajador: z.string().trim().min(1).max(32),
  nombre: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional(),
  rol,
  zonaId: z.string().uuid().optional(),
  idiomaPreferido: idioma.default("es"),
});
export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;

/**
 * El número de trabajador NO se edita: es la credencial de acceso y la clave
 * con la que el histórico de auditoría identifica a la persona. Cambiarlo
 * dejaría el rastro anterior apuntando a un número que ya no existe.
 */
export const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  rol: rol.optional(),
  zonaId: z.string().uuid().nullable().optional(),
  idiomaPreferido: idioma.optional(),
  activo: z.boolean().optional(),
});
export type EditarUsuarioDto = z.infer<typeof editarUsuarioSchema>;

export const buscarUsuariosSchema = z.object({
  texto: z.string().trim().min(1).max(120).optional(),
  rol: rol.optional(),
  zonaId: z.string().uuid().optional(),
  incluirInactivos: z.coerce.boolean().default(false),
  limite: z.coerce.number().int().positive().max(200).default(50),
  desplazamiento: z.coerce.number().int().min(0).default(0),
});
export type BuscarUsuariosDto = z.infer<typeof buscarUsuariosSchema>;
