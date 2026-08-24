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
