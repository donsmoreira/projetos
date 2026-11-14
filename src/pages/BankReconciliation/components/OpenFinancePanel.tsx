import { useState } from "react";

import { Landmark, Link2Off, PlugZap, RefreshCw } from "lucide-react";

import Modal from "../../../components/Modal/Modal";
import { appAlert, appConfirm } from "../../../components/Dialog/dialog";

import {
  deleteBankConnection,
  getConnectToken,
  getItemAccounts,
  saveBankConnection,
  syncConnection
} from "../../../services/openFinanceService";
import type { BankConnection, ItemAccounts } from "../../../services/openFinanceService";
import type { AccountWithBalance } from "../../../types/bankAccount";
import { formatCurrency } from "../../../utils/currency";
import { formatDateBR } from "../../../utils/entryBatch";

type OpenFinancePanelProps = {
  account: AccountWithBalance;
  connection: BankConnection | undefined;
  canCreate: boolean;
  canDelete: boolean;
  onChanged: (message: string, range?: { from: string; to: string }) => Promise<void> | void;
};

/**
 * Ambiente atual = homologação: mostra os bancos de teste da Pluggy.
 * Em produção isso fica desligado (VITE_OPEN_FINANCE_SANDBOX=false).
 */
const INCLUDE_SANDBOX = import.meta.env.VITE_OPEN_FINANCE_SANDBOX !== "false";

function formatDateTime(value: string | null) {
  if (!value) return "nunca";
  const date = new Date(value);
  return `${formatDateBR(date.toISOString().slice(0, 10))} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Conectar o banco pelo Open Finance e trazer os lançamentos para a conciliação. */
function OpenFinancePanel({ account, connection, canCreate, canDelete, onChanged }: OpenFinancePanelProps) {
  const [busy, setBusy] = useState<"" | "connect" | "sync" | "save" | "remove">("");
  const [choice, setChoice] = useState<ItemAccounts | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function openWidget(updateItemId?: string) {
    try {
      setBusy("connect");
      setErrorMessage("");

      const token = await getConnectToken(updateItemId);
      const { PluggyConnect } = await import("pluggy-connect-sdk");

      const widget = new PluggyConnect({
        connectToken: token,
        includeSandbox: INCLUDE_SANDBOX,
        language: "pt",
        ...(updateItemId ? { updateItem: updateItemId } : {}),
        onSuccess: async ({ item }: { item: { id: string } }) => {
          if (updateItemId && connection) {
            await runSync(connection.id, "Conexão renovada.");
            return;
          }

          try {
            const info = await getItemAccounts(item.id);
            setChoice(info);
            setSelectedAccount(info.accounts[0]?.id ?? "");
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Não foi possível ler as contas do banco.");
          }
        },
        onError: () => {
          setErrorMessage("A conexão com o banco não foi concluída. Tente de novo.");
        },
        onClose: () => {
          setBusy(current => (current === "connect" ? "" : current));
        }
      });

      await widget.init();
    } catch (error) {
      setBusy("");
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir a conexão com o banco.");
    }
  }

  async function runSync(connectionId: string, prefix = "") {
    try {
      setBusy("sync");
      setErrorMessage("");
      const result = await syncConnection(connectionId);

      await onChanged(
        `${prefix ? `${prefix} ` : ""}Banco sincronizado: ${result.inserted} lançamento(s) novo(s)` +
          (result.duplicates > 0 ? ` · ${result.duplicates} já existiam` : "") +
          ` · saldo no banco ${formatCurrency(result.bankBalance)}.`,
        { from: result.from, to: result.to }
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível sincronizar.");
      await onChanged("");
    } finally {
      setBusy("");
    }
  }

  async function handleChoose() {
    if (!choice || !selectedAccount) {
      return;
    }

    const picked = choice.accounts.find(item => item.id === selectedAccount);

    try {
      setBusy("save");
      setErrorMessage("");

      const connectionId = await saveBankConnection({
        bankAccountId: account.id,
        itemId: choice.itemId,
        providerAccountId: selectedAccount,
        connectorName: choice.connectorName,
        accountLabel: picked ? `${picked.name}${picked.number ? ` · ${picked.number}` : ""}` : "",
        consentExpiresAt: choice.consentExpiresAt
      });

      setChoice(null);
      await runSync(connectionId, "Banco conectado.");
    } catch (error) {
      setBusy("");
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível ligar a conta.");
    }
  }

  async function handleDisconnect() {
    if (!connection) return;

    const confirmed = await appConfirm(
      `Desconectar "${account.name}" do Open Finance? Os lançamentos já trazidos continuam na conciliação.`,
      { title: "Desconectar banco", confirmLabel: "Sim", cancelLabel: "Não", tone: "warning" }
    );

    if (!confirmed) return;

    try {
      setBusy("remove");
      await deleteBankConnection(connection.id);
      await onChanged("Banco desconectado.");
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Não foi possível desconectar.");
    } finally {
      setBusy("");
    }
  }

  const consentSoon =
    connection?.consent_expires_at &&
    new Date(connection.consent_expires_at).getTime() - Date.now() < 15 * 86400000;

  return (
    <div className={`openfinance-panel${connection ? " is-connected" : ""}`}>
      <div className="openfinance-info">
        <span className="openfinance-icon"><PlugZap size={18} /></span>

        {connection ? (
          <span>
            <strong>Open Finance: {connection.connector_name ?? "banco"} conectado</strong>
            <small>
              {connection.account_label ? `${connection.account_label} · ` : ""}
              última sincronização {formatDateTime(connection.last_sync_at)}
              {connection.consent_expires_at ? ` · autorização até ${formatDateBR(connection.consent_expires_at.slice(0, 10))}` : ""}
            </small>
            {connection.last_error && <small className="openfinance-error">Último erro: {connection.last_error}</small>}
            {consentSoon && <small className="openfinance-error">A autorização do banco vence logo: clique em Reconectar.</small>}
          </span>
        ) : (
          <span>
            <strong>Open Finance</strong>
            <small>Conecte o banco para os lançamentos chegarem sozinhos, sem importar arquivo.</small>
          </span>
        )}
      </div>

      <div className="openfinance-actions">
        {connection ? (
          <>
            {canCreate && (
              <button
                type="button"
                className="reconcile-action reconcile-action-primary"
                disabled={busy !== ""}
                onClick={() => void runSync(connection.id)}
              >
                <RefreshCw size={15} className={busy === "sync" ? "openfinance-spin" : ""} />
                {busy === "sync" ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                className="reconcile-action"
                disabled={busy !== ""}
                onClick={() => void openWidget(connection.item_id)}
              >
                <Landmark size={15} /> Reconectar
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="reconcile-action reconcile-action-danger"
                disabled={busy !== ""}
                onClick={() => void handleDisconnect()}
              >
                <Link2Off size={15} /> Desconectar
              </button>
            )}
          </>
        ) : (
          canCreate && (
            <button
              type="button"
              className="reconcile-action reconcile-action-primary"
              disabled={busy !== ""}
              onClick={() => void openWidget()}
            >
              <Landmark size={15} /> {busy === "connect" ? "Abrindo..." : "Conectar banco"}
            </button>
          )
        )}
      </div>

      {errorMessage && <div className="openfinance-message">{errorMessage}</div>}

      {choice && (
        <Modal
          title="Qual conta do banco ligar?"
          subtitle={`${choice.connectorName} → ${account.name}`}
          onClose={() => setChoice(null)}
          width={560}
        >
          <div className="arc-form">
            {choice.accounts.length === 0 ? (
              <div className="arc-form-error">
                Esta conexão não tem conta corrente ou poupança. Conecte outro banco.
              </div>
            ) : (
              <div className="batch-preview">
                {choice.accounts.map(item => (
                  <label key={item.id} className="reconcile-candidate openfinance-choice">
                    <input
                      type="radio"
                      name="openfinance-account"
                      checked={selectedAccount === item.id}
                      onChange={() => setSelectedAccount(item.id)}
                    />
                    <span className="batch-preview-name">
                      <strong>{item.name}</strong>
                      <small>{[item.number, item.subtype === "SAVINGS_ACCOUNT" ? "Poupança" : "Conta corrente"].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="reconcile-candidate-value">
                      {formatCurrency(item.balance)}
                      <small>saldo no banco</small>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <small className="arc-hint">
              Os lançamentos dos últimos 90 dias desta conta entram como "a conciliar" em {account.name}. Depois, é só sincronizar.
            </small>

            {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

            <div className="arc-form-actions">
              <button type="button" className="arc-button arc-button-secondary" onClick={() => setChoice(null)} disabled={busy === "save"}>
                Cancelar
              </button>
              <button
                type="button"
                className="arc-button arc-button-primary"
                onClick={() => void handleChoose()}
                disabled={busy === "save" || !selectedAccount}
              >
                {busy === "save" ? "Ligando..." : "Ligar e sincronizar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default OpenFinancePanel;
