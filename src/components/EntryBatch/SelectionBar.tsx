import { CircleDollarSign, Handshake } from "lucide-react";

import { formatCurrency } from "../../utils/currency";

import "./EntryBatch.css";

type SelectionBarProps = {
  count: number;
  total: number;
  settleLabel: string;
  onSettle?: () => void;
  onRenegotiate?: () => void;
  onClear: () => void;
};

/** Aparece em cima da lista quando há contas marcadas. */
function SelectionBar({ count, total, settleLabel, onSettle, onRenegotiate, onClear }: SelectionBarProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="selection-bar" role="region" aria-label="Contas marcadas">
      <span className="selection-bar-info">
        <strong>{count}</strong> conta{count > 1 ? "s" : ""} marcada{count > 1 ? "s" : ""} · total <strong>{formatCurrency(total)}</strong>
      </span>

      {onSettle && (
        <button type="button" className="selection-bar-button selection-bar-button-primary" onClick={onSettle}>
          <CircleDollarSign size={16} />
          {settleLabel}
        </button>
      )}

      {onRenegotiate && (
        <button type="button" className="selection-bar-button" onClick={onRenegotiate}>
          <Handshake size={16} />
          Renegociar
        </button>
      )}

      <button type="button" className="selection-bar-clear" onClick={onClear}>
        Desmarcar
      </button>
    </div>
  );
}

export default SelectionBar;
