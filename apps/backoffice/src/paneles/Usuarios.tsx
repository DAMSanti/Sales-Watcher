import { useCallback, useEffect, useState } from "react";
import { IDIOMAS, NOMBRE_IDIOMA, type Idioma } from "@sw/shared";
import { useTranslation } from "react-i18next";
import { ErrorApi, pedir } from "../api/cliente";
import { useSesion } from "../auth/sesion";
import { Dialogo } from "../componentes/Dialogo";

type Rol = "comercial" | "supervisor" | "administrador";

type Usuario = {
  id: string;
  numeroTrabajador: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  zonaId: string | null;
  zonaCodigo: string | null;
  idiomaPreferido: Idioma;
  activo: boolean;
  requiereCambioPassword: boolean;
  bloqueadoHasta: string | null;
  ultimoAccesoEn: string | null;
};

type Catalogo = { id: string; codigo: string };

export function Usuarios() {
  const { t } = useTranslation();
  const { idioma, perfil } = useSesion();

  const [filas, setFilas] = useState<Usuario[]>([]);
  const [texto, setTexto] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zonas, setZonas] = useState<Catalogo[]>([]);

  const [editando, setEditando] = useState<Usuario | "nuevo" | null>(null);
  /** Contraseña recién generada. Se enseña una vez y desaparece. */
  const [temporal, setTemporal] = useState<{ usuario: string; clave: string } | null>(
    null,
  );

  const esAdministrador = perfil?.rol === "administrador";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const parametros = new URLSearchParams({ limite: "200" });
      if (texto.trim()) parametros.set("texto", texto.trim());
      if (incluirInactivos) parametros.set("incluirInactivos", "true");
      const r = await pedir<{ usuarios: Usuario[] }>(`/usuarios?${parametros}`, { idioma });
      setFilas(r.usuarios);
    } catch (e) {
      setError(
        e instanceof ErrorApi && e.esFalloDeRed
          ? t("comun.sinConexion")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setCargando(false);
    }
  }, [texto, incluirInactivos, idioma, t]);

  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(temporizador);
  }, [cargar]);

  useEffect(() => {
    void pedir<Catalogo[]>("/catalogos/zonas", { idioma })
      .then(setZonas)
      .catch(() => {
        /* Solo un supervisor sin permiso sobre catálogos; el resto funciona. */
      });
  }, [idioma]);

  async function regenerar(usuario: Usuario) {
    try {
      const r = await pedir<{ passwordTemporal: string }>("/auth/password/regenerar", {
        metodo: "POST",
        cuerpo: { usuarioId: usuario.id },
      });
      setTemporal({ usuario: usuario.numeroTrabajador, clave: r.passwordTemporal });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function desbloquear(usuario: Usuario) {
    try {
      await pedir(`/usuarios/${usuario.id}/desbloquear`, { metodo: "POST" });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <header className="pagina__cabecera">
        <div>
          <h1 className="pagina__titulo">{t("usuarios.titulo")}</h1>
          <p className="pagina__subtitulo">{t("usuarios.subtitulo")}</p>
        </div>
        {esAdministrador && (
          <button className="boton boton--principal" onClick={() => setEditando("nuevo")}>
            {t("crud.nuevo")}
          </button>
        )}
      </header>

      <div className="filtros">
        <label className="campo" style={{ flex: 1, minWidth: "220px" }}>
          <span className="campo__etiqueta">{t("crud.buscar")}</span>
          <input
            className="campo__control"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <label
          className="campo"
          style={{ flexDirection: "row", alignItems: "center", gap: "var(--e2)" }}
        >
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          <span className="campo__etiqueta">{t("crud.incluirInactivos")}</span>
        </label>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("usuarios.numero")}</th>
              <th>{t("usuarios.nombre")}</th>
              <th>{t("usuarios.rol")}</th>
              <th>{t("usuarios.zona")}</th>
              <th>{t("usuarios.idioma")}</th>
              <th>{t("usuarios.ultimoAcceso")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  {t("comun.cargando")}
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  {t("comun.vacio")}
                </td>
              </tr>
            )}
            {!cargando &&
              filas.map((u) => {
                const bloqueado =
                  u.bloqueadoHasta !== null && new Date(u.bloqueadoHasta) > new Date();
                return (
                  <tr key={u.id} style={u.activo ? undefined : { opacity: 0.55 }}>
                    <td className="tabla__ref">{u.numeroTrabajador}</td>
                    <td>
                      {u.nombre}
                      {/* Dos estados que el administrador necesita ver de un
                          vistazo: quién no puede entrar y quién arrastra una
                          contraseña temporal sin cambiar. */}
                      {bloqueado && (
                        <span
                          className="distintivo distintivo--abierta"
                          style={{ marginLeft: "var(--e2)" }}
                        >
                          {t("usuarios.bloqueado")}
                        </span>
                      )}
                      {u.requiereCambioPassword && (
                        <span
                          className="distintivo distintivo--en_revision"
                          style={{ marginLeft: "var(--e2)" }}
                        >
                          {t("usuarios.temporalTitulo")}
                        </span>
                      )}
                    </td>
                    <td>{t(`usuarios.rol${cap(u.rol)}`)}</td>
                    <td>{u.zonaCodigo ?? "—"}</td>
                    <td>{NOMBRE_IDIOMA[u.idiomaPreferido]}</td>
                    <td className="tabla__ref">
                      {u.ultimoAccesoEn
                        ? new Date(u.ultimoAccesoEn).toLocaleDateString()
                        : t("usuarios.nunca")}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--e2)", flexWrap: "wrap" }}>
                        {bloqueado && (
                          <button
                            className="boton boton--menudo boton--secundario"
                            onClick={() => void desbloquear(u)}
                          >
                            {t("usuarios.desbloquear")}
                          </button>
                        )}
                        <button
                          className="boton boton--menudo boton--secundario"
                          onClick={() => void regenerar(u)}
                        >
                          {t("usuarios.regenerar")}
                        </button>
                        {esAdministrador && (
                          <button
                            className="boton boton--menudo boton--secundario"
                            onClick={() => setEditando(u)}
                          >
                            {t("crud.editar")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {editando && (
        <FormularioUsuario
          usuario={editando === "nuevo" ? null : editando}
          zonas={zonas}
          onCerrar={() => setEditando(null)}
          onCreado={(numeroTrabajador, clave) => {
            setEditando(null);
            setTemporal({ usuario: numeroTrabajador, clave });
            void cargar();
          }}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}

      {temporal && (
        <Dialogo
          titulo={t("usuarios.temporalTitulo")}
          onCerrar={() => setTemporal(null)}
          ancho="420px"
          acciones={
            <button className="boton boton--principal" onClick={() => setTemporal(null)}>
              {t("comun.cancelar")}
            </button>
          }
        >
          <div className="temporal">
            <div className="metrica__etiqueta">{temporal.usuario}</div>
            {/*
              `user-select: all` para poder copiarla de un clic: el
              administrador se la va a dictar o pegar en un mensaje.
            */}
            <div className="temporal__clave">{temporal.clave}</div>
            <p className="temporal__aviso">{t("usuarios.temporalAviso")}</p>
          </div>
        </Dialogo>
      )}
    </>
  );
}

function FormularioUsuario({
  usuario,
  zonas,
  onCerrar,
  onCreado,
  onGuardado,
}: {
  usuario: Usuario | null;
  zonas: Catalogo[];
  onCerrar: () => void;
  onCreado: (numeroTrabajador: string, clave: string) => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [datos, setDatos] = useState({
    numeroTrabajador: usuario?.numeroTrabajador ?? "",
    nombre: usuario?.nombre ?? "",
    email: usuario?.email ?? "",
    rol: (usuario?.rol ?? "comercial") as Rol,
    zonaId: usuario?.zonaId ?? "",
    idiomaPreferido: usuario?.idiomaPreferido ?? ("es" as Idioma),
    activo: usuario?.activo ?? true,
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      if (usuario) {
        await pedir(`/usuarios/${usuario.id}`, {
          metodo: "PATCH",
          cuerpo: {
            nombre: datos.nombre.trim(),
            email: datos.email.trim() || null,
            rol: datos.rol,
            zonaId: datos.zonaId || null,
            idiomaPreferido: datos.idiomaPreferido,
            activo: datos.activo,
          },
        });
        onGuardado();
      } else {
        const r = await pedir<{ passwordTemporal: string }>("/usuarios", {
          metodo: "POST",
          cuerpo: {
            numeroTrabajador: datos.numeroTrabajador.trim(),
            nombre: datos.nombre.trim(),
            email: datos.email.trim() || undefined,
            rol: datos.rol,
            zonaId: datos.zonaId || undefined,
            idiomaPreferido: datos.idiomaPreferido,
          },
        });
        onCreado(datos.numeroTrabajador.trim(), r.passwordTemporal);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const faltaZona = datos.rol === "comercial" && !datos.zonaId;
  const valido =
    datos.nombre.trim() && (usuario || datos.numeroTrabajador.trim()) && !faltaZona;

  return (
    <Dialogo
      titulo={usuario ? t("crud.editar") : t("crud.nuevo")}
      onCerrar={onCerrar}
      ancho="560px"
      acciones={
        <>
          <button className="boton boton--sutil" onClick={onCerrar} disabled={enviando}>
            {t("comun.cancelar")}
          </button>
          <button
            className="boton boton--principal"
            onClick={() => void guardar()}
            disabled={enviando || !valido}
          >
            {enviando ? t("comun.guardando") : t("comun.guardar")}
          </button>
        </>
      }
    >
      {error && <div className="aviso aviso--error">{error}</div>}

      <div className="rejilla">
        <label className="campo">
          <span className="campo__etiqueta">{t("usuarios.numero")}</span>
          <input
            className="campo__control"
            value={datos.numeroTrabajador}
            onChange={(e) => setDatos({ ...datos, numeroTrabajador: e.target.value })}
            /* No editable: es la credencial de acceso y la clave con la que la
               auditoría identifica a la persona. */
            disabled={usuario !== null}
            autoFocus={!usuario}
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("usuarios.rol")}</span>
          <select
            className="campo__control"
            value={datos.rol}
            onChange={(e) => setDatos({ ...datos, rol: e.target.value as Rol })}
          >
            <option value="comercial">{t("usuarios.rolComercial")}</option>
            <option value="supervisor">{t("usuarios.rolSupervisor")}</option>
            <option value="administrador">{t("usuarios.rolAdministrador")}</option>
          </select>
        </label>

        <label className="campo rejilla--completa">
          <span className="campo__etiqueta">{t("usuarios.nombre")}</span>
          <input
            className="campo__control"
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
          />
        </label>

        <label className="campo rejilla--completa">
          <span className="campo__etiqueta">{t("usuarios.email")}</span>
          <input
            className="campo__control"
            type="email"
            value={datos.email}
            onChange={(e) => setDatos({ ...datos, email: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("usuarios.zona")}</span>
          <select
            className="campo__control"
            value={datos.zonaId}
            onChange={(e) => setDatos({ ...datos, zonaId: e.target.value })}
          >
            <option value="">—</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.codigo}
              </option>
            ))}
          </select>
          {faltaZona && (
            <span className="campo__etiqueta" style={{ color: "var(--error)", fontWeight: 400 }}>
              {t("usuarios.zonaObligatoria")}
            </span>
          )}
        </label>

        <label className="campo">
          <span className="campo__etiqueta">{t("usuarios.idioma")}</span>
          <select
            className="campo__control"
            value={datos.idiomaPreferido}
            onChange={(e) =>
              setDatos({ ...datos, idiomaPreferido: e.target.value as Idioma })
            }
          >
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {NOMBRE_IDIOMA[i]}
              </option>
            ))}
          </select>
        </label>

        {usuario && (
          <label className="campo">
            <span className="campo__etiqueta">{t("crud.activo")}</span>
            <select
              className="campo__control"
              value={datos.activo ? "1" : "0"}
              onChange={(e) => setDatos({ ...datos, activo: e.target.value === "1" })}
            >
              <option value="1">{t("crud.activo")}</option>
              <option value="0">{t("crud.inactivo")}</option>
            </select>
          </label>
        )}
      </div>
    </Dialogo>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
