import { Building2 } from "lucide-react";

import type { CompanyMembership } from "../../types/company";

type CompanyChecklistProps = {
  /** Empresas que podem ser marcadas (as que você administra) */
  companies: CompanyMembership[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

/** Caixinhas das empresas em que o usuário vai operar. */
function CompanyChecklist({ companies, selected, onChange, disabled }: CompanyChecklistProps) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter(item => item !== id)
        : [...selected, id]
    );
  }

  return (
    <div className="settings-company-checks">
      {companies.map(item => (
        <label key={item.company.id}>
          <input
            type="checkbox"
            checked={selected.includes(item.company.id)}
            disabled={disabled}
            onChange={() => toggle(item.company.id)}
          />
          <Building2 size={14} />
          {item.company.trade_name || item.company.name}
        </label>
      ))}
    </div>
  );
}

export default CompanyChecklist;
