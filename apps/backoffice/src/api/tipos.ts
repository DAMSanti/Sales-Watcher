import type { Idioma } from "@sw/shared";

/** Formas que devuelve la API, tal y como las consume el backoffice. */

export type Perfil = {
  id: string;
  numeroTrabajador: string;
  rol: "comercial" | "supervisor" | "administrador";
  zonaId: string | null;
  idioma: Idioma;
  requiereCambioPassword: boolean;
};

export type IncidenciaBandeja = {
  id: string;
  categoria: { codigo: string; tipo: string; nombre: string };
  descripcion: string | null;
  prioridad: "baja" | "media" | "alta" | "critica";
  estado: "abierta" | "en_revision" | "resuelta" | "descartada";
  tienda: { id: string; nombre: string; numeroReferencia: string };
  comercial: { id: string; nombre: string; numeroTrabajador: string };
  fecha: string;
  creadoEn: string;
};

export type JustificacionBandeja = {
  visitaId: string;
  fecha: string;
  justificada: boolean;
  motivo: string | null;
  motivoCodigo: string | null;
  comentario: string | null;
  capturadaEn: string | null;
  estadoRevision: "pendiente" | "aceptada" | "cuestionada" | null;
  justificacionId: string | null;
  tienda: { nombre: string; numeroReferencia: string };
  comercial: { nombre: string; numeroTrabajador: string };
};

export type Cobertura = {
  periodo: { desde: string; hasta: string };
  porZona: Array<{
    zonaCodigo: string | null;
    planificadas: number;
    realizadas: number;
    noRealizadas: number;
    sinJustificar: number;
    cobertura: number;
  }>;
  porComercial: Array<{
    numeroTrabajador: string;
    nombre: string;
    zonaCodigo: string | null;
    planificadas: number;
    realizadas: number;
    noRealizadas: number;
    sinJustificar: number;
    cobertura: number;
  }>;
  visitasNoPlanificadas: number;
};

export type NoRealizacion = {
  periodo: { desde: string; hasta: string };
  resumen: {
    planificadas: number;
    noRealizadas: number;
    justificadas: number;
    sinJustificar: number;
    tasaNoRealizacion: number;
  };
  porMotivo: Array<{
    codigo: string;
    texto: string;
    total: number;
    porcentaje: number;
    aceptadas: number;
    cuestionadas: number;
    pendientesRevision: number;
  }>;
  concentracion: {
    motivoDominante: string;
    porcentaje: number;
    revisarCatalogo: boolean;
  } | null;
};

export type Ejecucion = {
  periodo: { desde: string; hasta: string };
  checklist: {
    itemsEvaluados: number;
    completados: number;
    obligatoriosEvaluados: number;
    obligatoriosCompletados: number;
    tasaCumplimiento: number;
    tasaObligatorios: number;
  };
  visitasIncompletas: { finalizadas: number; incompletas: number; tasa: number };
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
