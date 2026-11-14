import { useMemo, useState } from "react";

import { CheckCheck } from "lucide-react";

import Modal from "../../../components/Modal/Modal";

import {
  reconcileStatementLine,
  reconcileStatementLineAsNew
} from "../../../services/statementService";
import type { StatementLine } from "../../../types/statement";
import { formatCurrency } from "../../../utils/currency";
import { formatDateBR } from "../../../utils/entryBatch";
import { planBulkReconcile } from "../../../utils/reconciliation";
import type { ReconcileData } from "../../../utils/reconciliation";

type BulkReconcileModalProps = {
  lines: StatementLine[];
  data: ReconcileData;
  canLink: boolean;
  canSettlePayables: boolean;
  canSettleReceivables: boolean;
  canCreate: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
};

const KIND_LABEL = {
  transaction: "Movimentação",
  payable: "Pagar",
  receivable: "Receber"
} as const;

/** Concilia de uma vez todos os lançamentos "a conciliar" do período. */
function BulkReconcileModal({
  lines,
  data,
  canLink,
  canSettlePayables,
  canSettleReceivables,
  canCreate,
  onClose,
  onDone
}: BulkReconcileModalProps) {
  const [createMissing, setCreateMissing] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const plan = useMemo(
    () =>
      planBulkReconcile(lines, data, {
        createMissing,
        canLink,
        canSettlePayables,
        canSettleReceivables,
        canCreate
      }),
    [lines, data, createMissing, canLink, canSettlePayables, canSettleReceivables, canCreate]
  );

  const withSuggestion = plan.filter(item => item.action === "suggestion");
  const skipped = plan.filter(item => item.action === "skip");
  const toRun = plan.filter(item => item.action !== "skip");
  const withoutSuggestion = plan.filter(item => item.action !== "suggestion").length;

  async function handleRun() {
    setRunning(true);
    setErrors([]);
    setProgress(0);

    const problems: string[] = [];
    let done = 0;

    // Um por vez: cada um passa pelas mesmas regras da conciliação manual
    for (const item of toRun) {
      try {
        if (item.action === "suggestion" && item.candidate) {
          await reconcileStatementLine(item.line.id, item.candidate.kind, item.candidate.id, true);
        } else {
          await reconcileStatementLineAsNew(item.line.id, item.line.description);
        }
        done += 1;
      } catch (error) {
        problems.push(
          `${formatDateBR(item.line.posted_date)} · ${item.line.description}: ${
            error instanceof Error ? error.message : "não foi possível conciliar"
          }`
        );
      }

      setProgress(current => current + 1);
    }

    setErrors(problems);
    setRunning(false);

    const message =
      `${done} lançamento(s) conciliado(s)` +
      (problems.length > 0 ? ` · ${problems.length} com problema (continuam a conciliar)` : "") +
      (skipped.length > 0 ? ` · ${skipped.length} sem sugestão ficaram a conciliar` : "") +
      ".";

    if (problems.length === 0) {
      await onDone(message);
    }
  }

  return (
    <Modal
      title="Conciliar todos"
      subtitle={`${lines.length} lançamento(s) a conciliar no período`}
      onClose={running ? () => undefined : onClose}
      width={680}
    >
      <div className="arc-form">
        <div className="reconcile-cards reconcile-bulk-cards">
          <div className="reconcile-card">
            <span>Com sugestão</span>
            <strong>{withSuggestion.length}</strong>
            <small>ligados ou baixados pela sugestão</small>
          </div>
          <div className="reconcile-card">
            <span>Sem sugestão</span>
            <strong>{withoutSuggestion}</strong>
            <small>{createMissing && canCreate ? "lançados como avulso" : "ficam a conciliar"}</small>
          </div>
        </div>

        {canCreate && withoutSuggestion > 0 && (
          <label className="reconcile-check">
            <input
              type="checkbox"
              checked={createMissing}
              onChange={event => setCreateMissing(event.target.checked)}
              disabled={running}
            />
            Lançar como avulso os {withoutSuggestion} sem sugestão (trazer todas as movimentações do banco)
          </label>
        )}

        <div className="batch-preview reconcile-candidates">
          {plan.map(item => (
            <div key={item.line.id} className="batch-preview-row">
              <span className="batch-preview-name">
                <strong>{item.line.description}</strong>
                <small>
                  {formatDateBR(item.line.posted_date)} ·{" "}
                  {item.action === "suggestion" && item.candidate
                    ? `${KIND_LABEL[item.candidate.kind]}: ${item.candidate.description}${
                        item.candidate.kind !== "transaction" && item.candidate.party ? ` · ${item.candidate.party}` : ""
                      }`
                    : item.action === "avulso"
                      ? "Lançamento avulso"
                      : "Fica a conciliar"}
                </small>
              </span>
              <span className={`batch-preview-result ${item.line.amount < 0 ? "reconcile-out" : "reconcile-in"}`}>
                {formatCurrency(item.line.amount)}
              </span>
            </div>
          ))}
        </div>

        <small className="arc-hint">
          Contas a pagar/receber sugeridas são baixadas na data e no valor do extrato. Cada movimentação ou conta é usada uma vez só.
          Tudo pode ser desfeito depois, lançamento por lançamento.
        </small>

        {running && (
          <div className="reconcile-progress" role="status">
            <div style={{ width: `${toRun.length ? (progress / toRun.length) * 100 : 0}%` }} />
            <span>Conciliando {progress} de {toRun.length}...</span>
          </div>
        )}

        {errors.length > 0 && (
          <div className="arc-form-error">
            <strong>Alguns não foram conciliados (continuam a conciliar):</strong>
            <ul className="reconcile-error-list">
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={running}>
            {errors.length > 0 ? "Fechar" : "Cancelar"}
          </button>
          {errors.length === 0 && (
            <button
              type="button"
              className="arc-button arc-button-primary"
              onClick={() => void handleRun()}
              disabled={running || toRun.length === 0}
            >
              <CheckCheck size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {running ? "Conciliando..." : `Conciliar ${toRun.length} lançamento(s)`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default BulkReconcileModal;
