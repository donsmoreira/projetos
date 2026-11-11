import { useRef } from "react";

import CompanyForm from "./CompanyForm";
import { BackToCompanies } from "./CompanySettings";
import { emptyCompanyForm } from "./companyFormData";
import { useCompany } from "../../hooks/useCompany";
import { createCompany, updateCompany } from "../../services/companyService";

import "./Settings.css";

/** Configurações → Empresas → Nova empresa (/configuracoes/empresas/nova) */
function NewCompanySettings() {
  const { canCreateCompany } = useCompany();

  // Se a empresa foi criada mas o resto não salvou, tentar de novo não cria outra
  const createdId = useRef<string | null>(null);

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>Nova empresa</h2>
          <p>
            Preencha os dados da empresa (ou da pessoa). Você será o administrador
            e ela já fica aberta no sistema.
          </p>
        </div>

        <BackToCompanies />
      </section>

      {canCreateCompany ? (
        <CompanyForm
          initial={emptyCompanyForm()}
          canEdit
          submitLabel="Cadastrar empresa"
          savingLabel="Cadastrando..."
          onSubmit={async form => {
            if (!createdId.current) {
              createdId.current = await createCompany(form.name.trim());
            }

            await updateCompany(createdId.current, form);

            // Recarrega o sistema já com a empresa nova aberta
            window.location.assign("/configuracoes/empresas");
            return "";
          }}
        />
      ) : (
        <div className="settings-note">Só administradores podem criar empresas.</div>
      )}
    </div>
  );
}

export default NewCompanySettings;
