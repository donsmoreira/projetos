import { useMemo, useState } from "react";

import { Ban, Link2, PlusCircle, Search } from "lucide-react";

import Modal from "../../../components/Modal/Modal";
import PartialSettlement from "../../../components/PartialSettlement/PartialSettlement";

import {
  reconcileStatementLine,
  reconcileStatementLineAsNew,
  setStatementLineIgnored
} from "../../../services/statementService";
import type { StatementLine } from "../../../types/statement";
import { formatCurrency } from "../../../utils/currency";
import { formatDateBR } from "../../../utils/entryBatch";
import { reconcileCandidates } from "../../../utils/reconciliation";
import type { ReconcileCandidate, ReconcileData } from "../../../utils/reconciliation";

type ReconcileModalProps = {
  line: StatementLine;
  data: ReconcileData;
  canSettlePayables: boolean;
  canSettleReceivables: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
};

const KIND_LABEL: Record<ReconcileCandidate["kind"], string> = {
  transaction: "Movimentação do sistema",
  payable: "Conta a pagar",
  receivable: "Conta a receber"
};

/** Escolhe o que a linha do extrato é no sistema. */
function ReconcileModal({
  line,
  data,
  canSettlePayables,
  canSettleReceivables,
  canCreate,
  canUpdate,
  onClose,
  onDone
}: ReconcileModalProps) {
  const isOut = line.amount < 0;
  const absValue = Math.abs(line.amount);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReconcileCandidate | null>(null);
  const [keepRestOpen, setKeepRestOpen] = useState(true);
  const [newDescription, setNewDescription] = useState(line.description);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canSettleEntries = isOut ? canSettlePayables : canSettleReceivables;

  const candidates = useMemo(() => {
    const all = reconcileCandidates(line, data).filter(candidate =>
      candidate.kind === "transaction" ? canUpdate : canSettleEntries
    );
    const term = search.trim().toLowerCase();

    return term
      ? all.filter(candidate =>
          `${candidate.description} ${candidate.party}`.toLowerCase().includes(term)
        )
      : all;
  }, [line, data, search, canUpdate, canSettleEntries]);

  async function run(action: () => Promise<void>) {
    try {
      setBusy(true);
      setErrorMessage("");
      await action();
      await onDone();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível conciliar.");
    } finally {
      setBusy(false);
    }
  }

  const partial = selected && selected.kind !== "transaction" && !selected.exact;

  return (
    <Modal
      title="Conciliar lançamento"
      subtitle={`${formatDateBR(line.posted_date)} · ${line.description} · ${formatCurrency(line.amount)}`}
      onClose={onClose}
      width={680}
    >
      <div className="arc-form">
        <div className="reconcile-section-title">
          <Link2 size={15} /> O que é este lançamento no sistema?
        </div>

        <div className="reconcile-search">
          <Search size={15} />
          <input
            type="search"
            placeholder={`Buscar ${isOut ? "conta a pagar" : "conta a receber"} ou movimentação...`}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        <div className="batch-preview reconcile-candidates">
          {candidates.length === 0 && (
            <div className="batch-preview-row">
              <small className="arc-hint">
                Nada com valor igual ou maior pendente. Use "Lançar avulso" abaixo, ou cadastre a conta e volte aqui.
              </small>
            </div>
          )}

          {candidates.slice(0, 30).map(candidate => (
            <button
              key={`${candidate.kind}:${candidate.id}`}
              type="button"
              className={`reconcile-candidate${selected?.id === candidate.id ? " is-selected" : ""}`}
              onClick={() => {
                setSelected(candidate);
                setKeepRestOpen(true);
                setErrorMessage("");
              }}
            >
              <span className="batch-preview-name">
                <strong>{candidate.description}</strong>
                <small>
                  {KIND_LABEL[candidate.kind]}
                  {candidate.kind !== "transaction" && candidate.party ? ` · ${candidate.party}` : ""}
                  {" · "}
                  {candidate.kind === "transaction" ? "data" : "vence"} {formatDateBR(candidate.date)}
                </small>
              </span>
              <span className="reconcile-candidate-value">
                {formatCurrency(Math.abs(candidate.value))}
                <small>{candidate.exact ? "valor igual" : "parcial"}</small>
              </span>
            </button>
          ))}
        </div>

        {selected && partial && (
          <PartialSettlement
            total={selected.value}
            value={absValue}
            keepRestOpen={keepRestOpen}
            onChange={setKeepRestOpen}
            verb={isOut ? "pago" : "recebido"}
          />
        )}

        {selected && (
          <div className="arc-form-actions">
            <button
              type="button"
              className="arc-button arc-button-primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  reconcileStatementLine(line.id, selected.kind, selected.id, keepRestOpen)
                )
              }
            >
              {busy
                ? "Conciliando..."
                : selected.kind === "transaction"
                  ? "Conciliar com esta movimentação"
                  : `${isOut ? "Pagar" : "Receber"} e conciliar`}
            </button>
          </div>
        )}

        {selected && selected.kind !== "transaction" && (
          <small className="arc-hint">
            A conta será {isOut ? "paga" : "recebida"} em {formatDateBR(line.posted_date)} com {formatCurrency(absValue)} nesta conta bancária.
          </small>
        )}

        {canCreate && (
          <>
            <div className="reconcile-section-title">
              <PlusCircle size={15} /> Lançar avulso (tarifa, rendimento, ajuste...)
            </div>

            <div className="reconcile-inline">
              <input
                type="text"
                value={newDescription}
                onChange={event => setNewDescription(event.target.value)}
                aria-label="Descrição do lançamento avulso"
              />
              <button
                type="button"
                className="arc-button arc-button-secondary"
                disabled={busy}
                onClick={() => void run(() => reconcileStatementLineAsNew(line.id, newDescription))}
              >
                Lançar e conciliar
              </button>
            </div>
          </>
        )}

        {canUpdate && (
          <div className="reconcile-ignore">
            <button
              type="button"
              className="reconcile-link-button"
              disabled={busy}
              onClick={() => void run(() => setStatementLineIgnored(line.id, true))}
            >
              <Ban size={14} /> Ignorar este lançamento
            </button>
            <small className="arc-hint">Para o que não entra no controle (ex.: aplicação e resgate automáticos).</small>
          </div>
        )}

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}
      </div>
    </Modal>
  );
}

export default ReconcileModal;
