import { Link, useParams } from "react-router-dom";

import { ArrowLeft, Building2 } from "lucide-react";

import CompanyForm from "./CompanyForm";
import { formFromCompany } from "./companyFormData";
import { useCompany } from "../../hooks/useCompany";
import { updateCompany } from "../../services/companyService";

import "./Settings.css";

/** Botão de volta para a lista de empresas */
export function BackToCompanies() {
  return (
    <Link
      to="/configuracoes/empresas"
      className="settings-button settings-button-secondary settings-button-small"
    >
      <ArrowLeft size={14} />
      Empresas
    </Link>
  );
}

/** Configurações → Empresas → Cadastro de uma empresa (/configuracoes/empresas/:id) */
function CompanySettings() {
  const { id } = useParams();
  const { companies, active, reload } = useCompany();

  const membership = companies.find(item => item.company.id === id);

  if (!membership) {
    return (
      <div className="settings-page">
        <section className="settings-header">
          <div>
            <h2>Empresa não encontrada</h2>
            <p>Ela não existe ou você não participa dela.</p>
          </div>
          <BackToCompanies />
        </section>
      </div>
    );
  }

  const { company, permissions } = membership;
  const isActive = company.id === active?.company.id;

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>{company.trade_name || company.name}</h2>
          <p>
            Cadastro da empresa (ou da pessoa).
            {isActive ? " É a empresa aberta no sistema." : ""}
          </p>
          <div className="settings-header-badges">
            <span className="settings-badge">
              <Building2 size={13} />
              {permissions.isAdmin ? "Você é administrador" : "Somente leitura"}
            </span>
          </div>
        </div>

        <BackToCompanies />
      </section>

      {/* key: ao trocar de empresa, o formulário recomeça com os dados dela */}
      <CompanyForm
        key={company.id}
        initial={formFromCompany(company)}
        canEdit={permissions.isAdmin}
        submitLabel="Salvar dados da empresa"
        savingLabel="Salvando..."
        onSubmit={async form => {
          await updateCompany(company.id, form);
          await reload();
          return "Dados da empresa salvos.";
        }}
      />
    </div>
  );
}

export default CompanySettings;
