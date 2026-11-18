import { useCallback, useEffect, useState } from "react";

import { Building2, CalendarDays, CalendarCheck2, CalendarX2, RefreshCw, Unplug, UserRound } from "lucide-react";

import { appAlert, appConfirm } from "../../components/Dialog/dialog";
import { useCompany } from "../../hooks/useCompany";
import { useAuth } from "../../contexts/AuthContext";
import {
  disconnectGoogle,
  getGoogleConnections,
  startGoogleConnection,
  syncGoogleCalendar
} from "../../services/googleCalendarService";
import type { GoogleConnection, GoogleScope } from "../../services/googleCalendarService";

import "./Settings.css";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "ainda não";
}

type CardProps = {
  scope: GoogleScope;
  connection: GoogleConnection | null;
  canConnect: boolean;
  busy: boolean;
  onConnect: (scope: GoogleScope) => void;
  onDisconnect: (connection: GoogleConnection) => void;
};

function ConnectionCard({ scope, connection, canConnect, busy, onConnect, onDisconnect }: CardProps) {
  const isCompany = scope === "empresa";

  return (
    <div className="cert-box">
      <div className="cert-title">
        {isCompany ? <Building2 size={16} /> : <UserRound size={16} />}
        {isCompany ? "Agenda da empresa" : "Minha agenda"}
        <span className="cert-tag">{isCompany ? "todos os agendamentos" : "só os que eu sou o responsável"}</span>
      </div>

      {connection ? (
        <div className={`cert-info${connection.last_error ? " is-expired" : ""}`}>
          {connection.last_error ? <CalendarX2 size={20} /> : <CalendarCheck2 size={20} />}
          <div>
            <strong>{connection.google_email ?? "Conta Google conectada"}</strong>
            <small>Agenda no Google: <b>{connection.calendar_name ?? "Razão Finance"}</b></small>
            <small>
              Última sincronização: {formatDateTime(connection.last_sync_at)}
              {connection.pending > 0 ? ` · ${connection.pending} mudança(s) esperando envio` : ""}
            </small>
            {connection.last_error && <small className="google-error">{connection.last_error}</small>}
          </div>

          {canConnect && (
            <div className="cert-actions">
              {connection.last_error && (
                <button type="button" className="cert-button cert-button-primary" disabled={busy} onClick={() => onConnect(scope)}>
                  <RefreshCw size={14} /> Reconectar
                </button>
              )}
              <button type="button" className="cert-button cert-button-danger" disabled={busy} onClick={() => onDisconnect(connection)}>
                <Unplug size={14} /> Desconectar
              </button>
            </div>
          )}
        </div>
      ) : canConnect ? (
        <div className="google-connect">
          <small className="cert-muted">
            {isCompany
              ? "Uma conta Google recebe todos os agendamentos da empresa, numa agenda separada chamada \"Razão Finance\"."
              : "A sua conta Google recebe os agendamentos em que você é o responsável, numa agenda separada chamada \"Razão Finance\"."}
          </small>
          <button type="button" className="cert-button cert-button-primary" disabled={busy} onClick={() => onConnect(scope)}>
            <CalendarDays size={14} /> Conectar Google Agenda
          </button>
        </div>
      ) : (
        <small className="cert-muted">Não conectada. Só administradores conectam a agenda da empresa.</small>
      )}
    </div>
  );
}

/** Configurações → Integrações: Google Agenda (empresa e minha) */
function IntegrationsSettings() {
  const { active } = useCompany();
  const { user } = useAuth();
  const companyId = active?.company.id ?? null;
  const isAdmin = active?.permissions.isAdmin === true;

  const [connections, setConnections] = useState<GoogleConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;

    try {
      setLoading(true);
      setConnections(await getGoogleConnections(companyId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível ler as conexões.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleConnect(scope: GoogleScope) {
    if (!companyId) return;

    try {
      setBusy(true);
      setErrorMessage("");
      await startGoogleConnection(companyId, scope);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir o Google.");
      setBusy(false);
    }
  }

  async function handleDisconnect(connection: GoogleConnection) {
    const confirmed = await appConfirm(
      "A agenda \"Razão Finance\" criada no Google será apagada (os agendamentos continuam no Razão). Deseja desconectar?",
      { title: "Desconectar Google Agenda", confirmLabel: "Desconectar", tone: "danger" }
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      setErrorMessage("");
      const { calendarRemoved } = await disconnectGoogle(connection.id);
      setSavedMessage(
        calendarRemoved
          ? "Desconectado. A agenda \"Razão Finance\" foi apagada do Google."
          : "Desconectado. Se a agenda \"Razão Finance\" ainda aparecer no Google, você pode apagá-la por lá."
      );
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!companyId) return;

    try {
      setBusy(true);
      setErrorMessage("");
      const result = await syncGoogleCalendar(companyId, true, true);
      const skipped = Object.entries(result.details ?? {})
        .filter(([reason]) => reason !== "ok" && reason !== "já estava igual")
        .map(([reason, count]) => `${count} ${reason}`);
      setSavedMessage(
        `Sincronizado: ${result.sent} enviado(s) para o Google e ${result.received} recebido(s) de lá.` +
          (skipped.length ? ` Ficaram de fora: ${skipped.join(", ")}.` : "")
      );
      if (result.failed > 0) {
        await appAlert("Alguns agendamentos não foram enviados. Veja o aviso na conexão (pode ser preciso reconectar).", {
          title: "Sincronização incompleta"
        });
      }
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível sincronizar.");
    } finally {
      setBusy(false);
    }
  }

  const companyConnection = connections.find(item => item.scope === "empresa") ?? null;
  const myConnection = connections.find(item => item.scope === "usuario" && item.user_id === user?.id) ?? null;

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <h2>Integrações</h2>
          <p>Ligue o Razão a outros serviços.</p>
        </div>
      </header>

      <section className="settings-card">
        <h3>Google Agenda</h3>
        <p>
          Os agendamentos vão para o Google Agenda (e o celular) e o que for criado, movido ou excluído na agenda
          "Razão Finance" do Google volta para o Razão. As suas outras agendas do Google não são lidas.
        </p>

        {loading ? (
          <small className="cert-muted">Carregando...</small>
        ) : (
          <>
            <ConnectionCard
              scope="empresa"
              connection={companyConnection}
              canConnect={isAdmin}
              busy={busy}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
            <ConnectionCard
              scope="usuario"
              connection={myConnection}
              canConnect
              busy={busy}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </>
        )}

        {(companyConnection || myConnection) && (
          <div className="settings-actions">
            <button type="button" className="settings-button settings-button-secondary" disabled={busy} onClick={() => void handleSync()}>
              <RefreshCw size={15} /> {busy ? "Sincronizando..." : "Sincronizar agora"}
            </button>
          </div>
        )}

        <small className="cert-muted">
          Eventos de vários dias ou que se repetem, criados no Google, não entram no Razão (dia inteiro de um dia só entra).
          Atendimento concluído não muda pelo Google. Enquanto o app estiver em teste no Google, a conexão vence a cada 7 dias
          (aparece "Reconectar").
        </small>

        {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
        {savedMessage && <div className="settings-message settings-message-ok">{savedMessage}</div>}
      </section>
    </div>
  );
}

export default IntegrationsSettings;
