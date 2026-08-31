import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
import { obtenerUbicacion } from "../comun/ubicacion";
import { ejecutar } from "../offline/cola";
import { comprimir, type FotoComprimida } from "../evidencias/comprimir";
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SEGUNDOS,
  duracionDeVideo,
  subirFoto,
  subirVideo,
} from "../evidencias/subida";
import { EVIDENCIA_POR_FLUJO, OPCIONES, evidenciaObligatoria } from "./flujos";

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

  /**
   * Evidencia (foto y, si el flujo la admite, vídeo), capturada aquí mismo en
   * el formulario, ANTES de guardar — nunca en una pantalla aparte después.
   *
   * Es la queja que motivó este cambio: no había ningún botón para hacer una
   * foto en las secciones que la admiten hasta DESPUÉS de guardar la
   * incidencia. Ahora se comprime y se guarda en memoria al momento; la
   * subida real ocurre al pulsar Guardar, en cuanto la acción tiene id.
   */
  const [fotoCapturada, setFotoCapturada] = useState<FotoComprimida | null>(null);
  const [videoCapturado, setVideoCapturado] = useState<{ fichero: File; duracion: number } | null>(null);
  const [capturandoFoto, setCapturandoFoto] = useState(false);
  const [capturandoVideo, setCapturandoVideo] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const entradaVideo = useRef<HTMLInputElement>(null);
  /**
   * La nevera solo admite evidencia cuando se recoge (foto del código); el
   * resto de flujos lo decide su tipo sin más contexto.
   */
  const admiteEvidencia = tipo === "nevera" ? (campos.decision === "recoger" ? "foto" : undefined) : EVIDENCIA_POR_FLUJO[tipo];
  const obligatoria = evidenciaObligatoria(tipo, categoria, campos);

  /** Al cambiar la respuesta que hace obligatoria la foto (p. ej. la decisión
   *  de nevera), se descarta una foto ya capturada para otra combinación. */
  useEffect(() => {
    setFotoCapturada(null);
  }, [obligatoria]);

  async function alElegirFoto(evento: ChangeEvent<HTMLInputElement>) {
    const fichero = evento.target.files?.[0];
    evento.target.value = "";
    if (!fichero) return;

    setCapturandoFoto(true);
    setError(null);
    try {
      setFotoCapturada(await comprimir(fichero));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturandoFoto(false);
    }
  }

  /** Igual que en `BotonEvidencia`: se valida en el dispositivo antes de
   *  aceptarlo, para no descubrir al pulsar Guardar que el vídeo no vale. */
  async function alElegirVideo(evento: ChangeEvent<HTMLInputElement>) {
    const fichero = evento.target.files?.[0];
    evento.target.value = "";
    if (!fichero) return;

    setCapturandoVideo(true);
    setError(null);
    try {
      if (fichero.size > VIDEO_MAX_BYTES) {
        throw new Error(
          t("video.demasiadoGrande", {
            mb: Math.round(fichero.size / 1024 / 1024),
            max: Math.round(VIDEO_MAX_BYTES / 1024 / 1024),
          }),
        );
      }
      const duracion = await duracionDeVideo(fichero).catch(() => {
        throw new Error(t("video.sinDuracion"));
      });
      if (duracion > VIDEO_MAX_SEGUNDOS) {
        throw new Error(t("video.demasiadoLargo", { s: duracion, max: VIDEO_MAX_SEGUNDOS }));
      }
      setVideoCapturado({ fichero, duracion });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturandoVideo(false);
    }
  }

  const regla = resolverResponsable(tipo, categoria);
  const necesitaMarca = tipo === "facings" || tipo === "visibilidad";
  /** Selección múltiple: varias marcas para la misma nueva implantación. */
  const necesitaMarcas = tipo === "reorganizacion";

  /** Los catálogos se piden al abrir el formulario, no antes: la mayoría de
   *  flujos no los necesita y pedirlos siempre gastaría datos del comercial. */
  useEffect(() => {
    if ((necesitaMarca || necesitaMarcas) && marcas.length === 0) {
      void pedir<Marca[]>(`/marcas?categoria=${categoria}`, { idioma })
        .then(setMarcas)
        .catch(() => setMarcas([]));
    }
    if (tipo === "top_pico" && referencias.length === 0) {
      void pedir<ReferenciaProducto[]>(`/referencias?categoria=${categoria}`, { idioma })
        .then(setReferencias)
        .catch(() => setReferencias([]));
    }
  }, [tipo, categoria, idioma, necesitaMarca, necesitaMarcas, marcas.length, referencias.length]);

  const poner = (clave: string, valor: unknown) =>
    setCampos((previos) => ({ ...previos, [clave]: valor }));

  /** Réplica en cliente de las reglas que el servidor valida. Evita un viaje
   *  para recibir un 400 que ya sabemos que va a llegar. */
  function loQueFalta(): string | null {
    if (tipo === "fechas" && campos.problema === "otro" && !String(campos.detalle ?? "").trim()) {
      return t("flujo.faltaDetalle");
    }
    if (tipo === "top_pico" && referenciasElegidas(campos).length === 0) {
      return t("flujo.faltaReferencia");
    }
    if (
      tipo === "reorganizacion" &&
      !campos.todoLineal &&
      marcasElegidas(campos).length === 0
    ) {
      return t("flujo.faltaMarcaImplantacion");
    }
    if (tipo === "facings" && campos.conseguido && Number(campos.facingsGanados ?? 0) < 1) {
      return t("flujo.faltaFacings");
    }
    if (tipo === "nevera") {
      if (campos.hayNevera && !campos.decision) return t("flujo.faltaDecisionNevera");
      if (campos.decision === "recoger" && !String(campos.codigoNevera ?? "").trim()) {
        return t("flujo.faltaCodigoNevera");
      }
      if (campos.hayNevera === false && campos.oportunidadAnadir === undefined) {
        return t("flujo.faltaOportunidadNevera");
      }
    }
    if (obligatoria && !fotoCapturada) {
      return t("flujo.faltaFotoObligatoria");
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

    /**
     * Top Picos: selección múltiple sin volver atrás (SPECS §5.5.4, v0.7).
     * Cada referencia lleva su propio seguimiento independiente, así que se
     * crea una `Acción` por referencia — el requisito es no obligar al GPV a
     * salir y volver a entrar para la siguiente, no fusionarlas en una sola.
     */
    if (tipo === "top_pico") {
      try {
        for (const referenciaId of referenciasElegidas(campos)) {
          const datos = {
            tipoSituacion: "top_pico",
            categoriaProducto: categoria,
            detectadaEn: new Date().toISOString(),
            idCliente: crypto.randomUUID(),
            referenciaId,
          };
          await ejecutar({
            ruta: `/visitas/${visitaId}/acciones`,
            tipo: "accion.registrar",
            cuerpo: datos,
            carga: { visita: { id: visitaId }, datos },
            descripcion: `${nombreTienda} · ${t("situacion.top_pico")}`,
          });
        }
        await alGuardar();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setEnviando(false);
      }
      return;
    }

    const datos = {
      tipoSituacion: tipo,
      categoriaProducto: categoria,
      detectadaEn: new Date().toISOString(),
      idCliente: crypto.randomUUID(),
      ...limpiar(
        tipo === "reorganizacion"
          ? { ...campos, marcaIds: marcasElegidas(campos) }
          : campos,
      ),
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
        // no puede quedarse esperando a que vuelva la red. Tampoco se sube la
        // evidencia ya capturada: la acción aún no tiene identidad, y el
        // endpoint de subida directa no resuelve `accionIdCliente` (solo lo
        // hace el lote de sincronización). Limitación conocida, igual que el
        // vídeo ya no se ofrece sin cobertura en ningún otro flujo.
        setEncolado(true);
        setTimeout(() => void alGuardar(), 600);
        return;
      }

      const id = (resultado.datos as { id?: string })?.id;

      // La evidencia ya se capturó ANTES de pulsar Guardar (SPECS §9: "antes
      // de guardar"); en cuanto la acción tiene identidad, se sube. Nunca hay
      // una pantalla aparte después: si el GPV quería adjuntar algo, ya lo
      // hizo, y si no quería, no hace falta preguntárselo dos veces.
      if (id) {
        const ubicacion = await obtenerUbicacion();
        if (fotoCapturada) {
          await subirFoto(fotoCapturada, { visitaId, ambito: "accion", accionId: id }, ubicacion);
        }
        if (videoCapturado) {
          await subirVideo(
            videoCapturado.fichero,
            videoCapturado.duracion,
            { visitaId, ambito: "accion", accionId: id },
            ubicacion,
          );
        }
      }

      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flujo">
      {/* Mismo patrón que "← Categorías" en PanelCategoria: sin esto, la
          única forma de salir era bajar hasta el botón "Cancelar" al final
          del formulario, y en un formulario largo eso no se ve sin desplazar. */}
      <button className="categoria__volver" onClick={alCancelar} disabled={enviando}>
        <span aria-hidden="true">←</span> {t("flujo.volver")}
      </button>

      <header className="flujo__cabecera">
        <h3 className="flujo__titulo">{t(`situacion.${tipo}`)}</h3>
        <p className="flujo__pregunta">{t(`flujo.${tipo}.pregunta`)}</p>
      </header>

      <div className="flujo__campos">
        {/*
          Evidencia SIEMPRE en el propio formulario, antes de guardar — nunca
          en una pantalla aparte después (SPECS §9, v0.7). Aparece con
          cualquier flujo que la admita; el único matiz es si hace falta o es
          un apoyo: "obligatoria" bloquea Guardar sin ella, "opcional" no.
        */}
        {admiteEvidencia && (
          <div className="campo">
            <input
              ref={entradaFoto}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void alElegirFoto(e)}
              className="solo-lectores"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              className="boton boton--secundario foto__boton"
              onClick={() => entradaFoto.current?.click()}
              disabled={capturandoFoto}
            >
              <span aria-hidden="true">📷</span>
              {capturandoFoto
                ? t("foto.procesando")
                : fotoCapturada
                  ? t("flujo.fotoObligatoriaLista")
                  : obligatoria
                    ? t("flujo.fotoObligatoriaHacer")
                    : t("foto.hacer")}
            </button>

            {admiteEvidencia === "ambas" && (
              <>
                <input
                  ref={entradaVideo}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={(e) => void alElegirVideo(e)}
                  className="solo-lectores"
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className="boton boton--secundario foto__boton"
                  onClick={() => entradaVideo.current?.click()}
                  disabled={capturandoVideo}
                >
                  <span aria-hidden="true">🎥</span>
                  {capturandoVideo
                    ? t("video.procesando")
                    : videoCapturado
                      ? t("video.subido", {
                          s: videoCapturado.duracion,
                          mb: (videoCapturado.fichero.size / 1024 / 1024).toFixed(1),
                        })
                      : t("video.grabar")}
                </button>
                {videoCapturado && !capturandoVideo && (
                  <p className="foto__aviso foto__aviso--sutil">{t("video.avisoAudio")}</p>
                )}
              </>
            )}

            <p className="campo__ayuda">
              {obligatoria ? t("flujo.fotoObligatoriaAyuda") : t("flujo.evidenciaOpcional")}
            </p>
          </div>
        )}

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
            {/* Pregunta única desde v0.7: ya incorpora el criterio de
                cobertura. En Dairy, "Sí" ya implica incidencia — no hay
                segunda pregunta (SPECS §5.5.3). */}
            <Interruptor
              etiqueta={t("flujo.hueco.existe")}
              valor={Boolean(campos.existeHueco)}
              alCambiar={(v) => poner("existeHueco", v)}
            />
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
          <SeleccionMultiple
            etiqueta={t("flujo.top_pico.referencia")}
            opciones={referencias.map((r) => ({ valor: r.id, texto: r.nombre }))}
            elegidos={referenciasElegidas(campos)}
            alAnadir={(v) => poner("referenciaIds", [...referenciasElegidas(campos), v])}
            alQuitar={(v) =>
              poner(
                "referenciaIds",
                referenciasElegidas(campos).filter((r) => r !== v),
              )
            }
            vacio={t("flujo.sinReferencias")}
            placeholder={t("flujo.anadirReferencia")}
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

        {/* "Nueva implantación" (v0.7): categoriza por marca en vez de texto
            libre, con "todo el lineal" como alternativa. */}
        {tipo === "reorganizacion" && (
          <>
            <SeleccionMultiple
              etiqueta={t("flujo.reorganizacion.marcas")}
              opciones={marcas.map((m) => ({ valor: m.id, texto: m.nombre }))}
              elegidos={marcasElegidas(campos)}
              alAnadir={(v) => poner("marcaIds", [...marcasElegidas(campos), v])}
              alQuitar={(v) =>
                poner(
                  "marcaIds",
                  marcasElegidas(campos).filter((m) => m !== v),
                )
              }
              vacio={t("flujo.sinMarcas")}
              placeholder={t("flujo.anadirMarca")}
              deshabilitado={Boolean(campos.todoLineal)}
            />
            <Interruptor
              etiqueta={t("flujo.reorganizacion.todoLineal")}
              valor={Boolean(campos.todoLineal)}
              alCambiar={(v) => poner("todoLineal", v)}
            />
          </>
        )}

        {tipo === "extraespacio" && (
          <>
            <Eleccion
              etiqueta={t("flujo.extraespacio.tipo")}
              opciones={OPCIONES.tipoExtraespacio.map((v) => ({
                valor: v,
                texto: t(`flujo.tipoExtraespacio.${v}`),
              }))}
              valor={String(campos.tipo ?? "")}
              alElegir={(v) => poner("tipo", v)}
            />
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

        {/* Nevera (v0.7): árbol binario, exclusiva Dairy/Waters. */}
        {tipo === "nevera" && (
          <>
            <Interruptor
              etiqueta={t("flujo.nevera.hayNevera")}
              valor={Boolean(campos.hayNevera)}
              alCambiar={(v) =>
                setCampos({
                  hayNevera: v,
                  ...(v ? { decision: "mantener" } : { oportunidadAnadir: false }),
                })
              }
            />
            {campos.hayNevera && (
              <Eleccion
                etiqueta={t("flujo.nevera.decision")}
                opciones={OPCIONES.decisionNevera.map((v) => ({
                  valor: v,
                  texto: t(`flujo.decisionNevera.${v}`),
                }))}
                valor={String(campos.decision ?? "")}
                alElegir={(v) => poner("decision", v)}
              />
            )}
            {/* El código solo se pide al recoger. Está dentro de la nevera, así
                que el aviso lo recuerda: pedirlo sin decir dónde mirar es
                pedirle al GPV que adivine. */}
            {campos.decision === "recoger" && (
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
            {campos.hayNevera === false && (
              <Interruptor
                etiqueta={t("flujo.nevera.oportunidadAnadir")}
                valor={Boolean(campos.oportunidadAnadir)}
                alCambiar={(v) => poner("oportunidadAnadir", v)}
              />
            )}
          </>
        )}
      </div>

      {/* Se le dice al GPV qué va a pasar con lo que registra. Sin esto,
          registrar algo de Dairy y no ver ninguna consecuencia parece que no
          sirvió de nada. */}
      <p className="flujo__responsable">
        {tipo === "bloque_marca"
          ? t("flujo.seRegistraSolo")
          : regla.responsable === "fsm"
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
        ? { existeHueco: true }
        : { existeHueco: true, correccion: "si" };
    case "top_pico":
      return { referenciaIds: [] as string[] };
    case "facings":
      return { conseguido: false, facingsGanados: 0 };
    case "visibilidad":
      return { ubicacionActual: "palomar", propuesta: "subir_producto" };
    case "reorganizacion":
      return { marcaIds: [] as string[], todoLineal: false };
    case "extraespacio":
      return { tipo: "cabecera", motivo: "alta_rotacion" };
    case "nevera":
      return { hayNevera: true, decision: "mantener" };
    default:
      return {};
  }
}

/** Lectura tipada de las referencias elegidas para Top Picos. */
function referenciasElegidas(campos: Record<string, unknown>): string[] {
  return Array.isArray(campos.referenciaIds) ? (campos.referenciaIds as string[]) : [];
}

/** Lectura tipada de las marcas elegidas para Nueva implantación. */
function marcasElegidas(campos: Record<string, unknown>): string[] {
  return Array.isArray(campos.marcaIds) ? (campos.marcaIds as string[]) : [];
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

/**
 * Selección múltiple sin salir de la pantalla (SPECS §5.5.4, v0.7).
 *
 * El requisito del cliente es explícito: añadir Referencia A + B + C sin
 * pulsar atrás y volver a entrar al buscador. Se resuelve con un desplegable
 * que añade a una lista de elegidos en vez de sustituir la selección — cada
 * elección deja el desplegable listo para la siguiente.
 */
function SeleccionMultiple({
  etiqueta,
  opciones,
  elegidos,
  alAnadir,
  alQuitar,
  vacio,
  placeholder,
  deshabilitado,
}: {
  etiqueta: string;
  opciones: Array<{ valor: string; texto: string }>;
  elegidos: string[];
  alAnadir: (v: string) => void;
  alQuitar: (v: string) => void;
  vacio: string;
  placeholder?: string;
  deshabilitado?: boolean;
}) {
  const disponibles = opciones.filter((o) => !elegidos.includes(o.valor));
  const textoDe = (v: string) => opciones.find((o) => o.valor === v)?.texto ?? v;

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
      <label className="campo__etiqueta" htmlFor={`multi-${etiqueta}`}>
        {etiqueta}
      </label>
      {elegidos.length > 0 && (
        <ul className="seleccion-multiple__elegidos">
          {elegidos.map((v) => (
            <li key={v} className="seleccion-multiple__chip">
              {textoDe(v)}
              <button
                type="button"
                className="seleccion-multiple__quitar"
                onClick={() => alQuitar(v)}
                disabled={deshabilitado}
                aria-label={`Quitar ${textoDe(v)}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {disponibles.length > 0 && (
        <select
          id={`multi-${etiqueta}`}
          className="campo__control"
          value=""
          disabled={deshabilitado}
          onChange={(e) => {
            if (e.target.value) alAnadir(e.target.value);
          }}
        >
          <option value="">+ {placeholder ?? vacio}</option>
          {disponibles.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      )}
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
