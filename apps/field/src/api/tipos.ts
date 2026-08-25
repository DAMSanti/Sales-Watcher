import type { Idioma } from "@sw/shared";

/** Formas que devuelve la API, tal y como las consume la app de campo. */

export type EstadoVisita = "pendiente" | "en_curso" | "finalizada" | "no_realizada";

export type Perfil = {
  id: string;
  numeroTrabajador: string;
  rol: "comercial" | "supervisor" | "administrador";
  zonaId: string | null;
  idioma: Idioma;
  requiereCambioPassword: boolean;
};

export type RespuestaLogin = {
  token: string;
  usuario: {
    id: string;
    numeroTrabajador: string;
    nombre: string;
    rol: string;
    zonaId: string | null;
    idiomaPreferido: Idioma;
  };
  requiereCambioPassword: boolean;
};

export type TarjetaVisita = {
  visitaId: string | null;
  tienda: {
    id: string;
    nombre: string;
    numeroReferencia: string;
    direccion: string | null;
    localidad: string | null;
  };
  estado: EstadoVisita;
  planificada: boolean;
  ordenSugerido: number | null;
  incompleta: boolean;
  justificada: boolean;
  horaInicio: string | null;
  horaFin: string | null;
};

export type VistaDelDia = {
  fecha: string;
  zonaHoraria: string;
  /** Hora local de cierre, para el aviso con antelación. */
  horaCierre: string;
  resumen: {
    total: number;
    finalizadas: number;
    noRealizadas: number;
    pendientes: number;
    enCurso: number;
    sinJustificar: number;
  };
  visitas: TarjetaVisita[];
};

export type ItemChecklist = {
  itemId: string;
  resultadoId: string | null;
  texto: string;
  requiereFoto: boolean;
  obligatorio: boolean;
  orden: number;
  completado: boolean;
  completadoEn: string | null;
  fotos: number;
  /** La app deshabilita el interruptor en vez de dejar que el servidor falle. */
  puedeCompletarse: boolean;
};

export type Checklist = {
  visitaId: string;
  editable: boolean;
  items: ItemChecklist[];
  /**
   * Si el checklist está encendido en esta instalación.
   *
   * Apagado por defecto: el boceto lo sustituye por los flujos tipificados y
   * lo que queda es una sección opcional. Distinto de `items: []`, que
   * significa "encendido pero sin plantilla para esta tienda".
   */
  activo?: boolean;
};

export type Categoria = {
  id: string;
  codigo: string;
  tipo: "incidencia" | "oportunidad";
  nombre: string;
  prioridadDefecto: "baja" | "media" | "alta" | "critica";
};

export type Motivo = {
  id: string;
  codigo: string;
  texto: string;
  requiereComentario: boolean;
};

export type IncidenciaVisita = {
  id: string;
  categoria: { id: string; codigo: string; tipo: string; nombre: string };
  descripcion: string | null;
  prioridad: "baja" | "media" | "alta" | "critica";
  estado: string;
  fotos: number;
  creadoEn: string;
};

export type Desviacion = {
  evaluable: boolean;
  desviada: boolean;
  metros: number | null;
};

// ── El ciclo de acciones (SPECS §5.5 y §5.8) ──────────────────────────

export type CategoriaProducto = "dairy" | "waters" | "pbb";

export type TipoSituacion =
  | "stock"
  | "fechas"
  | "hueco"
  | "top_pico"
  | "facings"
  | "visibilidad"
  | "reorganizacion"
  | "extraespacio"
  | "nevera";

export type Accion = {
  id: string;
  tiendaId: string;
  visitaOrigenId: string;
  categoriaProducto: CategoriaProducto | "transversal";
  tipoSituacion: TipoSituacion;
  responsableActuar: "gpv" | "fsm";
  estado: "abierta" | "en_curso" | "resuelta" | "descartada";
  detectadaEn: string;
  /** Derivados por el servidor: no hay columna que los guarde. */
  diasAbierta: number;
  estancada: boolean;
  comprobaciones?: number;
  referencia?: { id: string; nombre: string } | null;
};

export type TopPicoPendiente = {
  accionId: string;
  detectadaEn: string;
  referencia: { id: string; nombre: string; codigo: string };
  categoriaProducto: CategoriaProducto;
  responsableActuar: "gpv" | "fsm";
};

export type Marca = {
  id: string;
  nombre: string;
  categoriaProducto: CategoriaProducto;
};

export type ReferenciaProducto = {
  id: string;
  nombre: string;
  codigo: string;
  categoriaProducto: CategoriaProducto;
};

export type RelacionResponsable = {
  id: string;
  haHablado: boolean;
  valoracion: string | null;
  cuestionPendiente: boolean;
  comentario: string | null;
};

export type ResumenVisita = {
  visitaId: string;
  estado: EstadoVisita;
  porCategoria: Record<
    string,
    {
      incidencias: number;
      oportunidades: number;
      paraElFsm: number;
      facingsGanados: number;
      situaciones: Record<string, number>;
    }
  >;
  extraespacios: { total: number; porTipo: Record<string, number> };
  relacionResponsable: {
    haHablado: boolean;
    valoracion: string | null;
    cuestionPendiente: boolean;
  } | null;
  pendientesPrevias: number;
  /**
   * Lo que falta, para informar sin bloquear: el MVP no exige mínimos.
   *
   * Llegan como CÓDIGOS y los traduce el cliente. Si el servidor mandara la
   * frase hecha, saldría en castellano para quien tiene la interfaz en otro
   * idioma.
   */
  avisos: Array<{ codigo: string; n?: number }>;
};
