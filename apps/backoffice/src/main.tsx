import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Idioma } from "@sw/shared";
import { App } from "./App";
import { ProveedorSesion } from "./auth/sesion";
import { iniciarI18n } from "./i18n";
import "./estilos/base.css";
import "./estilos/componentes.css";

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem("sw.bo.idioma");
    if (guardado) return guardado as Idioma;
  } catch {
    /* almacenamiento bloqueado */
  }
  const navegador = navigator.language.split("-")[0];
  return (["es", "eu", "ca", "fr", "en"].includes(navegador ?? "")
    ? navegador
    : "es") as Idioma;
}

iniciarI18n(idiomaInicial());

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <ProveedorSesion>
      <App />
    </ProveedorSesion>
  </StrictMode>,
);
