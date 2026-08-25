/**
 * Una cifra con su etiqueta.
 *
 * Vive aquí y no dentro de un panel porque la usan el dashboard y el panel de
 * acciones. La primera versión del segundo replicó el marcado a mano y salió
 * con el texto pegado —«149ABIERTAS»—, que es lo que pasa cuando se duplica
 * estructura en vez de reutilizar el componente.
 */
export function Metrica({
  valor,
  etiqueta,
  pie,
  tono,
}: {
  valor: number;
  etiqueta: string;
  pie?: string | undefined;
  tono?: "ok" | "curso" | "aviso" | "alerta" | undefined;
}) {
  return (
    <div className={`metrica ${tono ? `metrica--${tono}` : ""}`}>
      <div className="metrica__valor">{valor}</div>
      <div className="metrica__etiqueta">{etiqueta}</div>
      {pie && <div className="metrica__pie">{pie}</div>}
    </div>
  );
}
