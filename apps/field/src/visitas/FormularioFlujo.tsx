import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  opcionesSuficienciaStock,
  preguntaHueco,
  resolverResponsable,
} from "@sw/shared";
import { pedir } from "../api/cliente";
import type {
  CategoriaProducto,
  Marca,
  ReferenciaProducto,
  TipoSituacion,
} from "../api/tipos";
import { useSesion } from "../auth/sesion";
import { ejecutar } from "../offline/cola";
import { NEVERA_EXIGE_CODIGO, OPCIONES } from "./flujos";

/**
 * Formulario de un flujo de detección (SPECS §5.5).
 *
 * Cada flujo pregunta lo suyo y nada más. El objetivo del boceto es que el GPV
 * pase menos tiempo delante del móvil, así que ningún formulario tiene más
 * campos de los que su situación necesita.
 *
 * El responsable de actuar NO se pregunta: lo calcula el servidor. Aquí se
 * anticipa solo para poder redactar bien el aviso —«se genera una acción para
 * tu responsable» frente a «recuerda comentárselo al encargado»— usando la
 * misma función que usa el servidor, no una copia.
 */
export function FormularioFlujo({
  tipo,
  categoria,
  visitaId,
  nombreTienda,
  alGuardar,
  alCancelar,
}: {
  tipo: TipoSituacion;
  categoria: CategoriaProducto;
  visitaId: string;
  nombreTienda: string;
  alGuardar: () => Promise<void>;
  alCancelar: () => void;
}) {
  const { t } = useTranslation();
  const { idioma } = useSesion();

  const [campos, setCampos] = useState<Record<string, unknown>>(() => valoresIniciales(tipo, categoria));
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [referencias, setReferencias] = useState<ReferenciaProducto[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encolado, setEncolado] = useState(false);

  const regla = resolverResponsable(tipo, categoria);
  const necesitaMarca = tipo === "facings" || tipo === "visibilidad";

  /** Los catálogos se piden al abrir el formulario, no antes: la mayoría de
   *  flujos no los necesita y pedirlos siempre gastaría datos del comercial. */
  useEffect(() => {
    if (necesitaMarca && marcas.length === 0) {
      void pedir<Marca[]>(`/marcas?categoria=${categoria}`, { idioma })
        .then(setMarcas)
        .catch(() => setMarcas([]));
    }
    if (tipo === "top_pico" && referencias.length === 0) {
      void pedir<ReferenciaProducto[]>(`/referencias?categoria=${categoria}`, { idioma })
        .then(setReferencias)
        .catch(() => setReferencias([]));
    }
  }, [tipo, categoria, idioma, necesitaMarca, marcas.length, referencias.length]);

  const poner = (clave: string, valor: unknown) =>
    setCampos((previos) => ({ ...previos, [clave]: valor }));

  /** Réplica en cliente de las reglas que el servidor valida. Evita un viaje
   *  para recibir un 400 que ya sabemos que va a llegar. */
  function loQueFalta(): string | null {
    if (tipo === "fechas" && campos.problema === "otro" && !String(campos.detalle ?? "").trim()) {
      return t("flujo.faltaDetalle");
    }
    if (tipo === "top_pico" && !campos.referenciaId) return t("flujo.faltaReferencia");
    if (tipo === "reorganizacion" && !String(campos.propuesta ?? "").trim()) {
      return t("flujo.faltaPropuesta");
    }
    if (tipo === "facings" && campos.conseguido && Number(campos.facingsGanados ?? 0) < 1) {
      return t("flujo.faltaFacings");
    }
    if (
      tipo === "nevera" &&
      NEVERA_EXIGE_CODIGO.includes(String(campos.situacion)) &&
      !String(campos.codigoNevera ?? "").trim()
    ) {
      return t("flujo.faltaCodigoNevera");
    }
    return null;
  }

  async function guardar() {
    const falta = loQueFalta();
    if (falta) {
      setError(falta);
      return;
    }

    setEnviando(true);
    setError(null);

    const datos = {
      tipoSituacion: tipo,
      categoriaProducto: categoria,
      detectadaEn: new Date().toISOString(),
      idCliente: crypto.randomUUID(),
      ...limpiar(campos),
    };

    try {
      const resultado = await ejecutar({
        ruta: `/visitas/${visitaId}/acciones`,
        tipo: "accion.registrar",
        cuerpo: datos,
        carga: { visita: { id: visitaId }, datos },
        descripcion: `${nombreTienda} · ${t(`situacion.${tipo}`)}`,
      });

      if (resultado.via === "encolado") {
        // Sin cobertura la pantalla avanza igual: el GPV está en el lineal y
        // no puede quedarse esperando a que vuelva la red.
        setEncolado(true);
        setTimeout(() => void alGuardar(), 600);
      } else {
        await alGuardar();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flujo">
      <header className="flujo__cabecera">
        <h3 className="flujo__titulo">{t(`situacion.${tipo}`)}</h3>
        <p className="flujo__pregunta">{t(`flujo.${tipo}.pregunta`)}</p>
      </header>

      <div className="flujo__campos">
        {tipo === "stock" && (
          <Eleccion
            etiqueta={t("flujo.stock.suficiencia")}
            opciones={opcionesSuficienciaStock(categoria).map((v) => ({
              valor: v,
              texto: t(`flujo.suficiencia.${v}`),
            }))}
            valor={String(campos.suficiencia ?? "")}
            alElegir={(v) => poner("suficiencia", v)}
          />
        )}

        {/* Solo en Waters y PBB: en Dairy escala al FSM y no hay nada que
            comunicar en tienda. Mostrarlo allí ofrecería una gestión que no
            corresponde al GPV. */}
        {tipo === "stock" && categoria !== "dairy" && (
          <Interruptor
            etiqueta={t("flujo.stock.comunicado")}
            valor={Boolean(campos.comunicadoAlResponsable)}
            alCambiar={(v) => poner("comunicadoAlResponsable", v)}
          />
        )}

        {tipo === "fechas" && (
          <>
            <Eleccion
              etiqueta={t("flujo.fechas.problema")}
              opciones={OPCIONES.problemaFechas.map((v) => ({
                valor: v,
                texto: t(`flujo.problemaFechas.${v}`),
              }))}
              valor={String(campos.problema ?? "")}
              alElegir={(v) => poner("problema", v)}
            />
            {campos.problema === "otro" && (
              <Texto
                etiqueta={t("flujo.detalle")}
                valor={String(campos.detalle ?? "")}
                alCambiar={(v) => poner("detalle", v)}
              />
            )}
          </>
        )}

        {tipo === "hueco" && (
          <>
            <Interruptor
              etiqueta={t("flujo.hueco.existe")}
              valor={Boolean(campos.existeHueco)}
              alCambiar={(v) => poner("existeHueco", v)}
            />
            {/* Dairy pregunta si el reponedor lo cubrió; Waters y PBB, si lo
                corrigió el propio GPV. Son dos preguntas distintas. */}
            {campos.existeHueco && preguntaHueco(categoria) === "cubierto" && (
              <Interruptor
                etiqueta={t("flujo.hueco.cubierto")}
                valor={Boolean(campos.cubiertoConAdyacente)}
                alCambiar={(v) => poner("cubiertoConAdyacente", v)}
              />
            )}
            {campos.existeHueco && preguntaHueco(categoria) === "corregido" && (
              <Eleccion
                etiqueta={t("flujo.hueco.corregido")}
                opciones={OPCIONES.correccionHueco.map((v) => ({
                  valor: v,
                  texto: t(`flujo.correccion.${v}`),
                }))}
                valor={String(campos.correccion ?? "")}
                alElegir={(v) => poner("correccion", v)}
              />
            )}
          </>
        )}

        {tipo === "top_pico" && (
          <Lista
            etiqueta={t("flujo.topPico.referencia")}
            opciones={referencias.map((r) => ({ valor: r.id, texto: r.nombre }))}
            valor={String(campos.referenciaId ?? "")}
            alElegir={(v) => poner("referenciaId", v)}
            vacio={t("flujo.sinReferencias")}
          />
        )}

        {necesitaMarca && (
          <Lista
            etiqueta={t("flujo.marca")}
            opciones={marcas.map((m) => ({ valor: m.id, texto: m.nombre }))}
            valor={String(campos.marcaId ?? "")}
            alElegir={(v) => poner("marcaId", v)}
            vacio={t("flujo.sinMarcas")}
            opcional
          />
        )}

        {tipo === "facings" && (
          <>
            <Interruptor
              etiqueta={t("flujo.facings.conseguido")}
              valor={Boolean(campos.conseguido)}
              alCambiar={(v) => poner("conseguido", v)}
            />
            {/* Solo el incremento: el GPV no debe perder tiempo contando el
                lineal, y lo que interesa medir es lo que se ganó. */}
            {campos.conseguido && (
              <Contador
                etiqueta={t("flujo.facings.cuantos")}
                valor={Number(campos.facingsGanados ?? 1)}
                alCambiar={(v) => poner("facingsGanados", v)}
              />
            )}
          </>
        )}

        {tipo === "visibilidad" && (
          <>
            <Eleccion
              etiqueta={t("flujo.visibilidad.ubicacion")}
              opciones={OPCIONES.ubicacionLineal.map((v) => ({
                valor: v,
                texto: t(`flujo.ubicacion.${v}`),
              }))}
              valor={String(campos.ubicacionActual ?? "")}
              alElegir={(v) => poner("ubicacionActual", v)}
            />
            <Eleccion
              etiqueta={t("flujo.visibilidad.propuesta")}
              opciones={OPCIONES.propuestaVisibilidad.map((v) => ({
                valor: v,
                texto: t(`flujo.propuesta.${v}`),
              }))}
              valor={String(campos.propuesta ?? "")}
              alElegir={(v) => poner("propuesta", v)}
            />
          </>
        )}

        {tipo === "reorganizacion" && (
          <Texto
            etiqueta={t("flujo.reorganizacion.propuesta")}
            valor={String(campos.propuesta ?? "")}
            alCambiar={(v) => poner("propuesta", v)}
            largo
          />
        )}

        {(tipo === "extraespacio" || tipo === "nevera") && (
          <>
            {tipo === "extraespacio" && (
              <Eleccion
                etiqueta={t("flujo.extraespacio.tipo")}
                opciones={OPCIONES.tipoExtraespacio.map((v) => ({
                  valor: v,
                  texto: t(`flujo.tipoExtraespacio.${v}`),
                }))}
                valor={String(campos.tipo ?? "")}
                alElegir={(v) => poner("tipo", v)}
              />
            )}
            <Eleccion
              etiqueta={t("flujo.extraespacio.motivo")}
              opciones={OPCIONES.motivoExtraespacio.map((v) => ({
                valor: v,
                texto: t(`flujo.motivoExtraespacio.${v}`),
              }))}
              valor={String(campos.motivo ?? "")}
              alElegir={(v) => poner("motivo", v)}
            />
          </>
        )}

        {tipo === "nevera" && (
          <>
            <Eleccion
              etiqueta={t("flujo.nevera.situacion")}
              opciones={OPCIONES.situacionNevera.map((v) => ({
                valor: v,
                texto: t(`flujo.situacionNevera.${v}`),
              }))}
              valor={String(campos.situacion ?? "")}
              alElegir={(v) => poner("situacion", v)}
            />
            {/* El código solo se pide cuando hay que mover una unidad concreta.
                Está dentro de la nevera, así que el aviso lo recuerda: pedirlo
                sin decir dónde mirar es pedirle al GPV que adivine. */}
            {NEVERA_EXIGE_CODIGO.includes(String(campos.situacion)) && (
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="codigo-nevera">
                  {t("flujo.nevera.codigo")}
                </label>
                <input
                  id="codigo-nevera"
                  className="campo__control"
                  value={String(campos.codigoNevera ?? "")}
                  onChange={(e) => poner("codigoNevera", e.target.value)}
                  maxLength={64}
                  autoCapitalize="characters"
                />
                <p className="campo__ayuda">{t("flujo.nevera.codigoAyuda")}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Se le dice al GPV qué va a pasar con lo que registra. Sin esto,
          registrar algo de Dairy y no ver ninguna consecuencia parece que no
          sirvió de nada. */}
      <p className="flujo__responsable">
        {regla.responsable === "fsm"
          ? t("flujo.iraAlFsm")
          : categoria === "dairy"
            ? t("flujo.actuasTu")
            : t("flujo.hablasConEncargado")}
      </p>

      {error && (
        <div className="aviso aviso--error" role="alert">
          {error}
        </div>
      )}
      {encolado && (
        <div className="aviso aviso--sinconexion" role="status">
          {t("sync.guardadoLocal")}
        </div>
      )}

      <div className="flujo__acciones">
        <button className="boton boton--secundario" onClick={alCancelar} disabled={enviando}>
          {t("comun.cancelar")}
        </button>
        <button
          className="boton boton--principal"
          onClick={() => void guardar()}
          disabled={enviando}
        >
          {enviando ? t("comun.guardando") : t("comun.guardar")}
        </button>
      </div>
    </div>
  );
}

/** Valores de partida: los que hacen que el formulario abra ya utilizable. */
function valoresIniciales(tipo: TipoSituacion, categoria: CategoriaProducto) {
  switch (tipo) {
    case "stock":
      return { suficiencia: "no" };
    case "fechas":
      return { problema: "fifo_incorrecto" };
    case "hueco":
      return categoria === "dairy"
        ? { existeHueco: true, cubiertoConAdyacente: false }
        : { existeHueco: true, correccion: "si" };
    case "facings":
      return { conseguido: false, facingsGanados: 0 };
    case "visibilidad":
      return { ubicacionActual: "palomar", propuesta: "subir_producto" };
    case "extraespacio":
      return { tipo: "cabecera", motivo: "alta_rotacion" };
    case "nevera":
      return { motivo: "potencial_venta", situacion: "uso_parcial" };
    default:
      return {};
  }
}

/**
 * Quita lo que no toca enviar.
 *
 * Los campos vacíos se omiten en lugar de mandarse como cadena vacía: el
 * servidor distingue "no aplica" de "vacío", y mandar `""` donde espera
 * ausencia provoca un rechazo que al GPV le parecería arbitrario.
 */
function limpiar(campos: Record<string, unknown>) {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === "" || valor === undefined || valor === null) continue;
    salida[clave] = valor;
  }
  return salida;
}

// ── Controles ─────────────────────────────────────────────────────────
//
// Botones grandes en lugar de desplegables nativos: el GPV los usa de pie, con
// una mano, y a veces con guantes. Un `select` obliga a dos toques y a apuntar
// a una lista pequeña.

function Eleccion({
  etiqueta,
  opciones,
  valor,
  alElegir,
}: {
  etiqueta: string;
  opciones: Array<{ valor: string; texto: string }>;
  valor: string;
  alElegir: (v: string) => void;
}) {
  return (
    <div className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      <div className="opciones" role="radiogroup" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            className={`opcion ${valor === o.valor ? "opcion--activa" : ""}`}
            onClick={() => alElegir(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

function Interruptor({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <div className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      <div className="opciones" role="radiogroup" aria-label={etiqueta}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={valor === v}
            className={`opcion ${valor === v ? "opcion--activa" : ""}`}
            onClick={() => alCambiar(v)}
          >
            {v ? "Sí" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Lista({
  etiqueta,
  opciones,
  valor,
  alElegir,
  vacio,
  opcional,
}: {
  etiqueta: string;
  opciones: Array<{ valor: string; texto: string }>;
  valor: string;
  alElegir: (v: string) => void;
  vacio: string;
  opcional?: boolean;
}) {
  if (opciones.length === 0) {
    return (
      <div className="campo">
        <span className="campo__etiqueta">{etiqueta}</span>
        <p className="campo__ayuda">{vacio}</p>
      </div>
    );
  }
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={`lista-${etiqueta}`}>
        {etiqueta}
      </label>
      <select
        id={`lista-${etiqueta}`}
        className="campo__control"
        value={valor}
        onChange={(e) => alElegir(e.target.value)}
      >
        <option value="">{opcional ? "—" : vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

function Texto({
  etiqueta,
  valor,
  alCambiar,
  largo,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  largo?: boolean;
}) {
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={`texto-${etiqueta}`}>
        {etiqueta}
      </label>
      <textarea
        id={`texto-${etiqueta}`}
        className="campo__control"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        rows={largo ? 4 : 2}
        maxLength={4000}
      />
    </div>
  );
}

function Contador({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  alCambiar: (v: number) => void;
}) {
  return (
    <div className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      <div className="opciones">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`opcion ${valor === n ? "opcion--activa" : ""}`}
            onClick={() => alCambiar(n)}
          >
            +{n}
          </button>
        ))}
      </div>
    </div>
  );
}
