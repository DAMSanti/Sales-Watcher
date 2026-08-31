import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import type { Idioma } from "@sw/shared";
import { App } from "./App";
import { ProveedorSesion } from "./auth/sesion";
import { iniciarI18n } from "./i18n";
import { ProveedorSincronizacion } from "./offline/ContextoSincronizacion";
import "./estilos/base.css";
import "./estilos/componentes.css";

/**
 * Registro del service worker, a mano y no con el script que el plugin
 * inyectaría por defecto (`injectRegister: false` en `vite.config.ts`).
 *
 * Antes se dejaba el registro por defecto, y con él un despliegue nuevo
 * podía tardar días en notarse: el service worker se actualiza solo, pero
 * eso NO recarga una pestaña que ya estaba abierta — sigue ejecutando en
 * memoria el JavaScript viejo. En una PWA instalada que el GPV no cierra
 * entre visitas, eso significaba seguir viendo un bug ya corregido.
 *
 * Se avisa en vez de recargar solo (`registerType: "prompt"` en
 * `vite.config.ts`): una recarga silenciosa en mitad de una detección sin
 * guardar —una foto ya hecha, marcas ya elegidas— perdería justo lo que la
 * cola offline existe para no perder. El GPV decide cuándo, normalmente
 * entre una tienda y otra.
 */
const actualizarSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    mostrarAvisoDeActualizacion(() => actualizarSW(true));
  },
});

/**
 * Banner mínimo, sin React: se puede disparar antes de que la app monte, y
 * es un aviso técnico raro (una vez por despliegue), no una pantalla del
 * flujo de visita — no necesita el aparato de i18n para esto.
 */
function mostrarAvisoDeActualizacion(alActualizar: () => void) {
  if (document.getElementById("aviso-actualizacion")) return;

  const aviso = document.createElement("div");
  aviso.id = "aviso-actualizacion";
  aviso.className = "aviso-actualizacion";

  const texto = document.createElement("span");
  texto.textContent = "Hay una versión nueva de la app.";
  aviso.appendChild(texto);

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "aviso-actualizacion__boton";
  boton.textContent = "Actualizar";
  boton.onclick = () => {
    boton.disabled = true;
    boton.textContent = "Actualizando…";
    alActualizar();
  };
  aviso.appendChild(boton);

  document.body.appendChild(aviso);
}

/**
 * El idioma se resuelve ANTES de montar React.
 *
 * i18next debe estar inicializado cuando se pinte el primer componente; si no,
 * la primera pasada mostraría las claves técnicas antes de reemplazarlas, que
 * es un parpadeo visible en móviles lentos.
 */
function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem("sw.idioma");
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
      <ProveedorSincronizacion>
        <App />
      </ProveedorSincronizacion>
    </ProveedorSesion>
  </StrictMode>,
);
