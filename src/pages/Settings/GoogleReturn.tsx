import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { CalendarCheck2, CalendarX2, Loader2 } from "lucide-react";

import { finishGoogleConnection } from "../../services/googleCalendarService";

import "./Settings.css";

/** O Google volta para cá depois que a pessoa autoriza (ou recusa). */
function GoogleReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);

  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const googleError = params.get("error");

  const [status, setStatus] = useState<"working" | "ok" | "error">(() => (googleError || !code || !state ? "error" : "working"));
  const [message, setMessage] = useState(() =>
    googleError === "access_denied"
      ? "Você não autorizou o acesso no Google. Nada foi conectado."
      : googleError || !code || !state
        ? "O Google não devolveu a autorização. Tente conectar de novo."
        : "Conectando ao Google Agenda e enviando os agendamentos..."
  );

  useEffect(() => {
    if (status !== "working" || started.current) return;
    started.current = true;

    finishGoogleConnection(code, state)
      .then(result => {
        setStatus("ok");
        setMessage(
          `Conectado${result.email ? ` com ${result.email}` : ""}. A agenda "${result.calendarName}" foi criada no Google` +
            (result.sent > 0 ? ` e ${result.sent} agendamento(s) foram enviados.` : ".")
        );
        window.setTimeout(() => navigate("/configuracoes/integracoes", { replace: true }), 3500);
      })
      .catch(error => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Não foi possível conectar.");
      });
  }, [status, code, state, navigate]);

  return (
    <div className="settings-page">
      <section className="settings-card google-return">
        {status === "working" && <Loader2 size={28} className="google-spin" />}
        {status === "ok" && <CalendarCheck2 size={28} className="google-ok" />}
        {status === "error" && <CalendarX2 size={28} className="google-fail" />}
        <h3>Google Agenda</h3>
        <p>{message}</p>
        {status !== "working" && <Link to="/configuracoes/integracoes">Voltar para Integrações</Link>}
      </section>
    </div>
  );
}

export default GoogleReturn;
