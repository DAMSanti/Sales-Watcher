/**
 * Marcas y referencias de producto.
 *
 * ⚠️ PLACEHOLDER. El cliente confirma que el catálogo definitivo aún no existe
 * (ANEXO, respuesta a P22), y de dónde saldrá el de referencias sigue abierto
 * (P32). Estos datos permiten desarrollar y demostrar los flujos de Top Picos,
 * facings y visibilidad mientras tanto.
 *
 * NOTA IMPORTANTE sobre traducción: ni las marcas ni las referencias llevan
 * `textoI18n`. Son **nombres propios** y no se traducen — «Activia» es Activia
 * en los cinco idiomas. Es la única entrada de contenido configurable del
 * sistema sin traducción, y es deliberado, no un olvido.
 */

type CategoriaProducto = "dairy" | "waters" | "pbb";

type SemillaMarca = {
  codigo: string;
  nombre: string;
  categoria: CategoriaProducto;
  orden: number;
};

export const MARCAS: SemillaMarca[] = [
  { codigo: "activia", nombre: "Activia", categoria: "dairy", orden: 1 },
  { codigo: "actimel", nombre: "Actimel", categoria: "dairy", orden: 2 },
  { codigo: "danone", nombre: "Danone", categoria: "dairy", orden: 3 },
  { codigo: "danonino", nombre: "Danonino", categoria: "dairy", orden: 4 },
  { codigo: "vitalinea", nombre: "Vitalinea", categoria: "dairy", orden: 5 },
  { codigo: "oikos", nombre: "Oikos", categoria: "dairy", orden: 6 },

  { codigo: "font-vella", nombre: "Font Vella", categoria: "waters", orden: 1 },
  { codigo: "lanjaron", nombre: "Lanjarón", categoria: "waters", orden: 2 },
  { codigo: "evian", nombre: "Evian", categoria: "waters", orden: 3 },
  { codigo: "volvic", nombre: "Volvic", categoria: "waters", orden: 4 },

  { codigo: "alpro", nombre: "Alpro", categoria: "pbb", orden: 1 },
];

type SemillaReferencia = {
  codigo: string;
  nombre: string;
  marcaCodigo: string;
  categoria: CategoriaProducto;
  orden: number;
};

/**
 * Referencias de las que el GPV **elige** al registrar un Top Pico ausente.
 *
 * Esto NO es la base de datos de Top Picos: qué referencias son Top Pico en qué
 * tienda vive en otra aplicación del cliente y no se replica aquí. Este
 * catálogo solo da nombres estables, que es lo que hace posible comprobar en la
 * visita siguiente si *la misma* referencia se incorporó.
 */
export const REFERENCIAS: SemillaReferencia[] = [
  // ── Dairy ────────────────────────────────────────────────────────────
  { codigo: "act-nat-4x125", nombre: "Activia Natural 4×125 g", marcaCodigo: "activia", categoria: "dairy", orden: 1 },
  { codigo: "act-fib-4x120", nombre: "Activia Fibras Cereales 4×120 g", marcaCodigo: "activia", categoria: "dairy", orden: 2 },
  { codigo: "atm-ori-6x100", nombre: "Actimel Original 6×100 g", marcaCodigo: "actimel", categoria: "dairy", orden: 3 },
  { codigo: "atm-fre-6x100", nombre: "Actimel 0% Fresa 6×100 g", marcaCodigo: "actimel", categoria: "dairy", orden: 4 },
  { codigo: "dan-nat-8x125", nombre: "Danone Natural Azucarado 8×125 g", marcaCodigo: "danone", categoria: "dairy", orden: 5 },
  { codigo: "dnn-fpl-6x50", nombre: "Danonino Fresa-Plátano 6×50 g", marcaCodigo: "danonino", categoria: "dairy", orden: 6 },
  { codigo: "vit-nat-4x120", nombre: "Vitalinea Natural 4×120 g", marcaCodigo: "vitalinea", categoria: "dairy", orden: 7 },
  { codigo: "oik-gri-2x110", nombre: "Oikos Griego Natural 2×110 g", marcaCodigo: "oikos", categoria: "dairy", orden: 8 },

  // ── Waters ───────────────────────────────────────────────────────────
  { codigo: "fv-15l", nombre: "Font Vella 1,5 L", marcaCodigo: "font-vella", categoria: "waters", orden: 1 },
  { codigo: "fv-sen-125l", nombre: "Font Vella Sensación Limón 1,25 L", marcaCodigo: "font-vella", categoria: "waters", orden: 2 },
  { codigo: "lan-15l", nombre: "Lanjarón 1,5 L", marcaCodigo: "lanjaron", categoria: "waters", orden: 3 },
  { codigo: "evi-1l", nombre: "Evian 1 L", marcaCodigo: "evian", categoria: "waters", orden: 4 },

  // ── PBB ──────────────────────────────────────────────────────────────
  { codigo: "alp-soj-1l", nombre: "Alpro Soja Original 1 L", marcaCodigo: "alpro", categoria: "pbb", orden: 1 },
  { codigo: "alp-ave-1l", nombre: "Alpro Avena Sin Azúcares 1 L", marcaCodigo: "alpro", categoria: "pbb", orden: 2 },
  { codigo: "alp-alm-1l", nombre: "Alpro Almendra Sin Azúcares 1 L", marcaCodigo: "alpro", categoria: "pbb", orden: 3 },
];
