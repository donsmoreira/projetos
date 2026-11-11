import type { TaxRegime } from "../../types/company";
import { TAX_REGIME_LABELS } from "../../types/company";

type CompanyDataFieldsProps = {
  /** Prefixo das classes do formulário (client, supplier...) */
  classPrefix: string;
  idPrefix: string;
  tradeName: string;
  taxRegime: TaxRegime | "";
  stateRegistration: string;
  onChange: (
    field: "tradeName" | "taxRegime" | "stateRegistration",
    value: string
  ) => void;
};

/** Campos de pessoa jurídica: nome fantasia, enquadramento e inscrição estadual. */
function CompanyDataFields({
  classPrefix,
  idPrefix,
  tradeName,
  taxRegime,
  stateRegistration,
  onChange
}: CompanyDataFieldsProps) {
  return (
    <>
      <div className={`${classPrefix}-field ${classPrefix}-field-full`}>
        <label htmlFor={`${idPrefix}-trade-name`}>Nome fantasia</label>
        <input
          id={`${idPrefix}-trade-name`}
          type="text"
          value={tradeName}
          onChange={event => onChange("tradeName", event.target.value)}
        />
      </div>

      <div className={`${classPrefix}-field`}>
        <label htmlFor={`${idPrefix}-tax-regime`}>Enquadramento</label>
        <select
          id={`${idPrefix}-tax-regime`}
          value={taxRegime}
          onChange={event => onChange("taxRegime", event.target.value)}
        >
          <option value="">Não informado</option>
          {(Object.keys(TAX_REGIME_LABELS) as TaxRegime[]).map(regime => (
            <option key={regime} value={regime}>
              {TAX_REGIME_LABELS[regime]}
            </option>
          ))}
        </select>
      </div>

      <div className={`${classPrefix}-field`}>
        <label htmlFor={`${idPrefix}-ie`}>Inscrição estadual</label>
        <input
          id={`${idPrefix}-ie`}
          type="text"
          value={stateRegistration}
          onChange={event => onChange("stateRegistration", event.target.value)}
        />
      </div>
    </>
  );
}

export default CompanyDataFields;
