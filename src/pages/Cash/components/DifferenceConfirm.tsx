import { AlertTriangle } from "lucide-react";

import { formatCurrency } from "../../../utils/currency";

type DifferenceConfirmProps = {
  /** "abrir" ou "fechar" */
  action: "abrir" | "fechar";
  expected: number;
  counted: number;
  difference: number;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

/** Pergunta se quer mesmo abrir/fechar o caixa com sobra ou falta. */
function DifferenceConfirm({
  action,
  expected,
  counted,
  difference,
  submitting,
  onBack,
  onConfirm
}: DifferenceConfirmProps) {
  const kind = difference > 0 ? "sobra" : "falta";

  return (
    <div className={`cash-confirm cash-confirm-${kind}`} role="alertdialog" aria-live="assertive">
      <strong>
        <AlertTriangle size={16} />
        Diferença no caixa: {kind} de {formatCurrency(Math.abs(difference))}
      </strong>

      <p>
        Esperado {formatCurrency(expected)} · contado {formatCurrency(counted)}.
        {" "}Quer mesmo {action} o caixa com essa diferença? Ela será lançada como
        {" "}<b>Quebra de caixa</b> ({kind}) e aparece no relatório de quebra de caixa.
      </p>

      <div className="cash-confirm-actions">
        <button
          type="button"
          className="arc-button arc-button-secondary"
          onClick={onBack}
          disabled={submitting}
        >
          Não, voltar e recontar
        </button>

        <button
          type="button"
          className="arc-button arc-button-primary"
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting
            ? action === "abrir" ? "Abrindo..." : "Fechando..."
            : `Sim, ${action} com diferença`}
        </button>
      </div>
    </div>
  );
}

export default DifferenceConfirm;
