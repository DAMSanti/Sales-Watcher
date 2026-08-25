/**
 * Primitivas de gráfico, en HTML plano.
 *
 * No hay librería de gráficos en el proyecto y no hace falta: lo que el
 * dashboard necesita son barras horizontales y una barra apilada. Una
 * dependencia para eso pesaría más que el código y traería su propio criterio
 * visual, que habría que pelear para que respetase los tokens.
 *
 * ── Decisiones de forma ────────────────────────────────────────────────
 *
 * **El embudo usa una rampa secuencial de un solo tono, no colores
 * categóricos.** Detectado → trabajado → solucionado es una progresión
 * ordenada, no tres identidades distintas: más avance, más oscuro. Lo que
 * queda sin tocar va en gris, que es la ausencia de trabajo y no una cuarta
 * categoría.
 *
 * **Los facings usan una sola serie**, así que no llevan leyenda: el título ya
 * dice qué se está midiendo y una caja con un solo color lo repetiría.
 */

/** Pasos del embudo. Monótonos en luminancia: 9,34 → 3,37 → 2,56 sobre blanco. */
export const PASOS_EMBUDO = {
  solucionadas: "#00458f",
  enCurso: "#4a8ee0",
  sinTocar: "#94a3b8",
} as const;

/** Tono único de magnitud, el azul corporativo. */
export const TONO_MAGNITUD = "#0057b8";

type Segmento = { clave: string; valor: number; etiqueta: string; color: string };

/**
 * Barra apilada horizontal: las partes de un total.
 *
 * Los segmentos se separan con 2 px de superficie, no con un borde: un trazo
 * alrededor de la marca añade tinta que no es dato.
 *
 * Las etiquetas van DENTRO solo si caben. Se estima el ancho del texto y, si no
 * entra con holgura, el valor se deja a la leyenda y a la tabla — nunca se
 * recorta, que es peor que no etiquetar.
 */
export function BarraApilada({
  segmentos,
  total,
  titulo,
}: {
  segmentos: Segmento[];
  total: number;
  titulo: string;
}) {
  if (total <= 0) return null;

  return (
    <div className="grafico">
      <div className="barra-apilada" role="img" aria-label={titulo}>
        {segmentos
          .filter((s) => s.valor > 0)
          .map((s) => {
            const porcentaje = (s.valor / total) * 100;
            /**
             * ~7 px por carácter a 0,8 rem, más 16 px de aire. Si el segmento no
             * llega, la etiqueta se omite en lugar de recortarse.
             */
            const cabe = porcentaje > (String(s.valor).length * 7 + 16) / 6;
            return (
              <div
                key={s.clave}
                className="barra-apilada__segmento"
                style={{ width: `${porcentaje}%`, background: s.color }}
                title={`${s.etiqueta}: ${s.valor}`}
              >
                {cabe && <span className="barra-apilada__valor">{s.valor}</span>}
              </div>
            );
          })}
      </div>

      {/* La leyenda siempre está con dos o más series: es el canal de identidad
          fiable. Las etiquetas directas la complementan, no la sustituyen. */}
      <ul className="leyenda">
        {segmentos.map((s) => (
          <li key={s.clave} className="leyenda__entrada">
            <span
              className="leyenda__marca"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="leyenda__texto">{s.etiqueta}</span>
            <span className="leyenda__valor">{s.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Barras horizontales para comparar magnitudes.
 *
 * Horizontal y no vertical porque las etiquetas son nombres largos —GPVs,
 * tiendas, marcas— y en columnas habría que girarlas o recortarlas.
 *
 * Una sola serie, un solo tono: el trabajo del color aquí es magnitud, no
 * identidad. Pintar cada barra de un color distinto sugeriría que las
 * categorías son la historia, y la historia es cuánto.
 */
export function BarrasHorizontales({
  filas,
  formato,
  vacio,
}: {
  filas: Array<{ etiqueta: string; valor: number; detalle?: string }>;
  formato?: (v: number) => string;
  vacio: string;
}) {
  if (filas.length === 0) return <p className="tabla__vacia">{vacio}</p>;

  const maximo = Math.max(...filas.map((f) => f.valor), 1);
  const mostrar = formato ?? ((v: number) => String(v));

  return (
    <div className="barras">
      {filas.map((f) => (
        <div key={f.etiqueta} className="barras__fila">
          <span className="barras__etiqueta" title={f.etiqueta}>
            {f.etiqueta}
          </span>
          <div className="barras__pista">
            <div
              className="barras__marca"
              style={{ width: `${(f.valor / maximo) * 100}%`, background: TONO_MAGNITUD }}
              title={f.detalle ?? `${f.etiqueta}: ${mostrar(f.valor)}`}
            />
          </div>
          {/* El valor va al extremo de la barra, fuera de ella: siempre legible
              sea cual sea el ancho de la marca. */}
          <span className="barras__valor">{mostrar(f.valor)}</span>
        </div>
      ))}
    </div>
  );
}
