import { formatCurrency } from "../../utils/currency";

import "./PartialSettlement.css";

type PartialSettlementProps = {
  /** Total da conta (valor + juros + multa) */
  total: number;
  /** Valor digitado na baixa */
  value: number;
  keepRestOpen: boolean;
  onChange: (keepRestOpen: boolean) => void;
  /** "pago" ou "recebido", para os textos */
  verb: "pago" | "recebido";
};

function toCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

/** Diferença em centavos entre o total da conta e o valor informado (0 se não faltar nada). */
function missingCents(total: number, value: number) {
  return Math.max(toCents(total) - toCents(value), 0);
}

/**
 * Aparece na baixa quando o valor informado é menor que o total:
 * pergunta se o restante fica em aberto (baixa parcial) ou se é desconto.
 */
function PartialSettlement({ total, value, keepRestOpen, onChange, verb }: PartialSettlementProps) {
  const missing = missingCents(total, value);

  if (missing === 0 || toCents(value) <= 0) {
    return null;
  }

  const rest = formatCurrency(missing / 100);

  return (
    <fieldset className="partial-settlement">
      <legend>
        Valor {verb} menor que o total da conta ({formatCurrency(total)}). Faltam <strong>{rest}</strong>.
      </legend>

      <label className="partial-settlement-option">
        <input
          type="radio"
          name="partial-settlement"
          checked={keepRestOpen}
          onChange={() => onChange(true)}
        />
        <span>
          <strong>Baixa parcial</strong>
          <small>Os {rest} continuam em aberto numa nova conta, com o mesmo vencimento.</small>
        </span>
      </label>

      <label className="partial-settlement-option">
        <input
          type="radio"
          name="partial-settlement"
          checked={!keepRestOpen}
          onChange={() => onChange(false)}
        />
        <span>
          <strong>Quitar com desconto</strong>
          <small>A conta fica quitada e os {rest} não serão cobrados.</small>
        </span>
      </label>
    </fieldset>
  );
}

export default PartialSettlement;
