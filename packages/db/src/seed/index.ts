import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { fechaLocal } from "@sw/shared";
import { cargarEnv } from "../cargar-env";
import { crearCliente } from "../index";
import {
  categorias,
  itemsChecklist,
  motivosNoRealizacion,
  plantillasChecklist,
  rutasDiarias,
  tiendas,
  tiposTienda,
  usuarios,
  zonas,
} from "../schema/index";
import { CATEGORIAS, MOTIVOS_NO_REALIZACION, TIPOS_TIENDA } from "./catalogos";
import { PLANTILLAS_CHECKLIST } from "./checklists";
import { PASSWORD_DEMO, TIENDAS, USUARIOS, ZONAS } from "./demo";

cargarEnv();

/**
 * Carga de datos semilla.
 *
 * Es IDEMPOTENTE: todas las inserciones son upserts por código estable, así
 * que se puede volver a ejecutar sobre una base ya poblada sin duplicar nada
 * ni perder los identificadores existentes. Eso importa porque los catálogos
 * van a cambiar mientras se negocia con el cliente, y hay que poder
 * recargarlos sin tirar la base de datos.
 */

if (process.env.NODE_ENV === "production") {
  console.error(
    "El seed contiene contraseñas de desarrollo conocidas y no debe ejecutarse en producción.",
  );
  process.exit(1);
}

async function principal() {
  const { db, sql: conexion } = crearCliente();


  console.log("Cargando datos semilla...\n");

  // ── Zonas ──────────────────────────────────────────────────────────────
  const idsZona = new Map<string, string>();
  for (const zona of ZONAS) {
    const [fila] = await db
      .insert(zonas)
      .values({
        codigo: zona.codigo,
        nombre: zona.nombre,
        region: zona.region,
        zonaHoraria: zona.zonaHoraria,
      })
      .onConflictDoUpdate({
        target: zonas.codigo,
        set: {
          nombre: zona.nombre,
          region: zona.region,
          zonaHoraria: zona.zonaHoraria,
          actualizadoEn: new Date(),
        },
      })
      .returning({ id: zonas.id });

    if (!fila) throw new Error(`No se pudo resolver la zona ${zona.codigo}`);
    idsZona.set(zona.codigo, fila.id);
  }
  console.log(`  Zonas .......................... ${idsZona.size}`);

  // ── Tipos de tienda ────────────────────────────────────────────────────
  const idsTipoTienda = new Map<string, string>();
  for (const tipo of TIPOS_TIENDA) {
    const [fila] = await db
      .insert(tiposTienda)
      .values({ codigo: tipo.codigo, nombre: tipo.nombre })
      .onConflictDoUpdate({
        target: tiposTienda.codigo,
        set: { nombre: tipo.nombre, actualizadoEn: new Date() },
      })
      .returning({ id: tiposTienda.id });
    if (!fila) throw new Error(`No se pudo insertar el tipo ${tipo.codigo}`);
    idsTipoTienda.set(tipo.codigo, fila.id);
  }
  console.log(`  Tipos de tienda ................ ${idsTipoTienda.size}`);

  // ── Categorías de incidencia y oportunidad ─────────────────────────────
  let nIncidencias = 0;
  let nOportunidades = 0;
  for (const [indice, categoria] of CATEGORIAS.entries()) {
    await db
      .insert(categorias)
      .values({
        codigo: categoria.codigo,
        nombre: categoria.nombre,
        tipo: categoria.tipo,
        prioridadDefecto: categoria.prioridadDefecto,
        orden: indice,
      })
      .onConflictDoUpdate({
        target: categorias.codigo,
        set: {
          nombre: categoria.nombre,
          prioridadDefecto: categoria.prioridadDefecto,
          orden: indice,
          actualizadoEn: new Date(),
        },
      });
    if (categoria.tipo === "incidencia") nIncidencias++;
    else nOportunidades++;
  }
  console.log(
    `  Categorías ..................... ${CATEGORIAS.length} (${nIncidencias} incidencia, ${nOportunidades} oportunidad)`,
  );

  // ── Motivos de no realización ──────────────────────────────────────────
  for (const [indice, motivo] of MOTIVOS_NO_REALIZACION.entries()) {
    await db
      .insert(motivosNoRealizacion)
      .values({
        codigo: motivo.codigo,
        texto: motivo.texto,
        requiereComentario: motivo.requiereComentario,
        orden: indice,
      })
      .onConflictDoUpdate({
        target: motivosNoRealizacion.codigo,
        set: {
          texto: motivo.texto,
          requiereComentario: motivo.requiereComentario,
          orden: indice,
          actualizadoEn: new Date(),
        },
      });
  }
  console.log(`  Motivos de no realización ...... ${MOTIVOS_NO_REALIZACION.length}`);

  // ── Plantillas de checklist ────────────────────────────────────────────
  // Las plantillas no tienen código único en el esquema, así que se recargan
  // por completo: se borran sus ítems y se vuelven a crear. Es seguro porque
  // los resultados de checklist apuntan a `items_checklist`, y en un entorno de
  // desarrollo con seed no hay visitas históricas que preservar.
  let nItems = 0;
  for (const plantilla of PLANTILLAS_CHECKLIST) {
    const tipoId = plantilla.tipoTiendaCodigo
      ? idsTipoTienda.get(plantilla.tipoTiendaCodigo)
      : null;

    const existentes = await db
      .select({ id: plantillasChecklist.id })
      .from(plantillasChecklist)
      .where(
        tipoId
          ? eq(plantillasChecklist.tipoTiendaId, tipoId)
          : sql`${plantillasChecklist.tipoTiendaId} is null`,
      )
      .limit(1);

    let plantillaId = existentes[0]?.id;

    if (plantillaId) {
      await db
        .update(plantillasChecklist)
        .set({ nombre: plantilla.nombre, actualizadoEn: new Date() })
        .where(eq(plantillasChecklist.id, plantillaId));
      await db.delete(itemsChecklist).where(eq(itemsChecklist.plantillaId, plantillaId));
    } else {
      const [creada] = await db
        .insert(plantillasChecklist)
        .values({ nombre: plantilla.nombre, tipoTiendaId: tipoId ?? null })
        .returning({ id: plantillasChecklist.id });
      if (!creada) throw new Error(`No se pudo crear la plantilla ${plantilla.codigo}`);
      plantillaId = creada.id;
    }

    await db.insert(itemsChecklist).values(
      plantilla.items.map((item, indice) => ({
        plantillaId: plantillaId!,
        texto: item.texto,
        requiereFoto: item.requiereFoto,
        obligatorio: item.obligatorio,
        orden: indice,
      })),
    );
    nItems += plantilla.items.length;
  }
  console.log(
    `  Plantillas de checklist ........ ${PLANTILLAS_CHECKLIST.length} (${nItems} ítems)`,
  );

  // ── Usuarios ───────────────────────────────────────────────────────────
  // Un único hash para todos: argon2 es lento a propósito, y hacerlo una vez
  // en lugar de ocho ahorra varios segundos en cada recarga del seed.
  const hashDemo = await hash(PASSWORD_DEMO);
  const idsUsuario = new Map<string, string>();
  for (const usuario of USUARIOS) {
    const [fila] = await db
      .insert(usuarios)
      .values({
        numeroTrabajador: usuario.numeroTrabajador,
        nombre: usuario.nombre,
        email: usuario.email ?? null,
        rol: usuario.rol,
        zonaId: usuario.zonaCodigo ? (idsZona.get(usuario.zonaCodigo) ?? null) : null,
        passwordHash: hashDemo,
        idiomaPreferido: usuario.idiomaPreferido,
        // Los usuarios de demo no arrastran el forzado de cambio: haría falta
        // pasar por el flujo de cambio de contraseña en cada recarga del seed.
        requiereCambioPassword: false,
      })
      .onConflictDoUpdate({
        target: usuarios.numeroTrabajador,
        set: {
          nombre: usuario.nombre,
          rol: usuario.rol,
          idiomaPreferido: usuario.idiomaPreferido,
          actualizadoEn: new Date(),
        },
      })
      .returning({ id: usuarios.id });
    if (!fila) throw new Error(`No se pudo insertar el usuario ${usuario.numeroTrabajador}`);
    idsUsuario.set(usuario.numeroTrabajador, fila.id);
  }
  console.log(`  Usuarios ....................... ${idsUsuario.size}`);

  // ── Tiendas ────────────────────────────────────────────────────────────
  const idsTienda = new Map<string, string>();
  for (const tienda of TIENDAS) {
    const zonaId = idsZona.get(tienda.zonaCodigo);
    const tipoId = idsTipoTienda.get(tienda.tipoTiendaCodigo);

    const existente = await db
      .select({ id: tiendas.id })
      .from(tiendas)
      .where(eq(tiendas.numeroReferencia, tienda.numeroReferencia))
      .limit(1);

    const valores = {
      nombre: tienda.nombre,
      numeroReferencia: tienda.numeroReferencia,
      direccion: tienda.direccion,
      localidad: tienda.localidad,
      codigoPostal: tienda.codigoPostal,
      zonaId: zonaId ?? null,
      tipoTiendaId: tipoId ?? null,
      ubicacion: {
        lat: tienda.lat,
        lon: tienda.lon,
        precisionM: 0,
        capturadoEn: new Date().toISOString(),
      },
      // Sin `idExterno` a propósito: estas fichas son de carga manual, y cuando
      // llegue el ERP habrá que poder distinguirlas de las sincronizadas.
      origen: "manual" as const,
    };

    let id = existente[0]?.id;
    if (id) {
      await db
        .update(tiendas)
        .set({ ...valores, actualizadoEn: new Date() })
        .where(eq(tiendas.id, id));
    } else {
      const [creada] = await db.insert(tiendas).values(valores).returning({ id: tiendas.id });
      if (!creada) throw new Error(`No se pudo crear la tienda ${tienda.numeroReferencia}`);
      id = creada.id;
    }
    idsTienda.set(tienda.numeroReferencia, id);
  }
  console.log(`  Tiendas ........................ ${idsTienda.size}`);

  // ── Rutas del día ──────────────────────────────────────────────────────
  // Sin ruta para hoy, la vista del día aparecería vacía y no habría nada que
  // probar en la PWA. La fecha se calcula en la zona de cada comercial, no en
  // la del servidor: para el comercial canario el "hoy" puede ser distinto.
  const asignaciones: Array<{ trabajador: string; referencias: string[] }> = [
    { trabajador: "30001", referencias: ["CAT-0101", "CAT-0102", "CAT-0103", "CAT-0104"] },
    { trabajador: "30002", referencias: ["PV-0201", "PV-0202", "PV-0203", "PV-0204"] },
    { trabajador: "30003", referencias: ["MAD-0301", "MAD-0302", "MAD-0303"] },
    { trabajador: "30004", referencias: ["LEV-0401", "LEV-0402", "LEV-0403"] },
    { trabajador: "30005", referencias: ["CAN-0501", "CAN-0502"] },
  ];

  let nRutas = 0;
  for (const asignacion of asignaciones) {
    const usuarioId = idsUsuario.get(asignacion.trabajador);
    if (!usuarioId) continue;

    const zonaCodigo = USUARIOS.find(
      (u) => u.numeroTrabajador === asignacion.trabajador,
    )?.zonaCodigo;
    const zonaHoraria =
      ZONAS.find((z) => z.codigo === zonaCodigo)?.zonaHoraria ?? "Europe/Madrid";
    const hoy = fechaLocal(new Date(), zonaHoraria);

    for (const [indice, referencia] of asignacion.referencias.entries()) {
      const tiendaId = idsTienda.get(referencia);
      if (!tiendaId) continue;
      await db
        .insert(rutasDiarias)
        .values({ usuarioId, tiendaId, fecha: hoy, ordenSugerido: indice + 1 })
        .onConflictDoNothing();
      nRutas++;
    }
  }
  console.log(`  Rutas del día .................. ${nRutas}`);

  console.log(`
  Datos semilla cargados.

    Acceso de desarrollo
      Administrador   10000
      Supervisores    20001 (ca), 20002 (eu)
      Comerciales     30001 (ca), 30002 (eu), 30003 (es), 30004 (es), 30005 (fr)
      Contraseña      ${PASSWORD_DEMO}

    Los catálogos son placeholder y las traducciones al euskera necesitan
    revisión nativa antes del rollout (ANEXO §4).
  `);

  await conexion.end();
}

principal().catch((error) => {
  console.error("Fallo cargando datos semilla:", error);
  process.exit(1);
});
