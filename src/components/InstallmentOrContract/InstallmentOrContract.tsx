import { formatCurrency } from "../../utils/currency";

import "./InstallmentOrContract.css";

type InstallmentOrContractProps = {
  /** Prefixo das classes do formulário ("payable" ou "receivable") */
  prefix: "payable" | "receivable";
  installmentCount: number;
  isContract: boolean;
  contractMonths: number;
  /** Valor + juros + multa de cada conta criada */
  valuePerEntry: number;
  /** Editando uma conta existente: nada disso muda */
  disabled: boolean;
  onInstallmentCountChange: (value: number) => void;
  onContractChange: (isContract: boolean) => void;
  onContractMonthsChange: (months: number) => void;
};

const MAX_CONTRACT_MONTHS = 120;

/**
 * Parcelas OU contrato: usando um, o outro fica bloqueado.
 * Contrato = uma conta por mês com o valor mensal, pela duração em meses.
 */
function InstallmentOrContract({
  prefix,
  installmentCount,
  isContract,
  contractMonths,
  valuePerEntry,
  disabled,
  onInstallmentCountChange,
  onContractChange,
  onContractMonthsChange
}: InstallmentOrContractProps) {
  const field = `${prefix}-field`;
  const usingInstallments = !isContract && installmentCount > 1;
  const count = isContract ? contractMonths : installmentCount;

  return (
    <>
      <div className={field}>
        <label htmlFor={`${prefix}-installments`}>Quantidade de parcelas</label>
        <input
          id={`${prefix}-installments`}
          type="number"
          min="1"
          step="1"
          value={isContract ? 1 : installmentCount}
          onChange={event => onInstallmentCountChange(Math.max(Number(event.target.value || 1), 1))}
          disabled={disabled || isContract}
          title={isContract ? "Desmarque \"Isso é um contrato?\" para parcelar" : undefined}
        />
        {isContract && !disabled && <small className="contract-hint">Bloqueado: a conta é um contrato.</small>}
      </div>

      <div className={`${field} contract-field`}>
        <label className="contract-check">
          <input
            type="checkbox"
            checked={isContract}
            onChange={event => onContractChange(event.target.checked)}
            disabled={disabled || usingInstallments}
          />
          Isso é um contrato?
        </label>

        {isContract ? (
          <>
            <label htmlFor={`${prefix}-contract-months`} className="contract-months-label">
              Quanto tempo em meses?
            </label>
            <input
              id={`${prefix}-contract-months`}
              type="number"
              min="2"
              max={MAX_CONTRACT_MONTHS}
              step="1"
              value={contractMonths || ""}
              onChange={event => onContractMonthsChange(Math.floor(Number(event.target.value || 0)))}
              disabled={disabled}
              placeholder="24"
              required
            />
          </>
        ) : (
          usingInstallments && !disabled && (
            <small className="contract-hint">Bloqueado: a conta está parcelada (volte as parcelas para 1).</small>
          )
        )}
      </div>

      {!disabled && count > 1 && valuePerEntry > 0 && (
        <div className={`${field} ${prefix}-field-full`}>
          <small className="contract-summary">
            {isContract
              ? `Contrato: ${count} contas mensais de ${formatCurrency(valuePerEntry)} (total ${formatCurrency(Math.round(valuePerEntry * 100) * count / 100)}), uma por mês a partir do primeiro vencimento.`
              : `Serão criadas ${count} parcelas de ${formatCurrency(valuePerEntry)} (total ${formatCurrency(Math.round(valuePerEntry * 100) * count / 100)}), uma por mês.`}
          </small>
        </div>
      )}
    </>
  );
}

export default InstallmentOrContract;
