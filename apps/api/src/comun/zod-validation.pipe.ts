import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Valida el cuerpo de la petición con un esquema Zod.
 *
 * Se usa Zod en lugar de class-validator porque los mismos esquemas se
 * comparten con la PWA desde `@sw/shared`: la validación que ve el comercial
 * antes de encolar una operación offline es literalmente la misma que aplica
 * el servidor al recibirla.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly esquema: ZodSchema) {}

  transform(valor: unknown) {
    const resultado = this.esquema.safeParse(valor);
    if (!resultado.success) {
      throw new BadRequestException({
        mensaje: "Datos inválidos",
        errores: resultado.error.issues.map((i) => ({
          campo: i.path.join("."),
          error: i.message,
        })),
      });
    }
    return resultado.data;
  }
}
