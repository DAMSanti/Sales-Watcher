/**
 * Serialización a CSV para exportar informes.
 *
 * Se genera a mano en lugar de traer una dependencia: la forma de los datos es
 * conocida y lo único delicado es el escapado, que son cuatro líneas.
 */
export function aCsv(filas: Array<Record<string, unknown>>): string {
  if (filas.length === 0) return "";

  const columnas = Object.keys(filas[0]!);
  const lineas = [
    columnas.join(","),
    ...filas.map((fila) => columnas.map((c) => escapar(fila[c])).join(",")),
  ];

  /**
   * BOM al principio y saltos CRLF: sin ellos, Excel en Windows abre el
   * fichero interpretando los acentos como caracteres sueltos, y el informe
   * llega ilegible a quien lo pidió.
   */
  return "\ufeff" + lineas.join("\r\n");
}

function escapar(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  if (typeof valor === "object") {
    // Los textos traducibles llegan como objeto; se toma el castellano.
    const traducible = valor as Record<string, string>;
    valor = traducible.es ?? JSON.stringify(valor);
  }

  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
