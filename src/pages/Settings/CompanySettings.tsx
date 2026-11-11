import { useState } from "react";
import type { FormEvent } from "react";

import { Link, useParams } from "react-router-dom";

import { ArrowLeft, Building2 } from "lucide-react";

import AddressSection from "../../components/AddressSection/AddressSection";
import { useCompany } from "../../hooks/useCompany";
import { updateCompany } from "../../services/companyService";
import { addressFromDb, validateAddress } from "../../utils/address";
import {
  documentKind,
  formatDocument,
  validateDocument
} from "../../utils/document";

import type { AddressFormData } from "../../types/address";
import type {
  Company,
  CompanyFormData,
  PersonType,
  TaxRegime
} from "../../types/company";
import { TAX_REGIME_LABELS } from "../../types/company";

import "./Settings.css";

function formFromCompany(company: Company): CompanyFormData {
  return {
    document: formatDocument(company.document),
    personType: company.person_type ?? "",
    name: company.name,
    tradeName: company.trade_name ?? "",
    taxRegime: company.tax_regime ?? "",
    stateRegistration: company.state_registration ?? "",
    municipalRegistration: company.municipal_registration ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    website: company.website ?? "",
    address: addressFromDb(company)
  };
}

function CompanyForm({
  company,
  canEdit,
  onSaved
}: {
  company: Company;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<CompanyFormData>(() => formFromCompany(company));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const kind = documentKind(form.document);
  const isCnpj = kind === "cnpj";
  const isCpf = kind === "cpf";

  function update<K extends keyof CompanyFormData>(field: K, value: CompanyFormData[K]) {
    setSavedMessage("");
    setForm(current => ({ ...current, [field]: value }));
  }

  function updateAddress(change: (current: AddressFormData) => AddressFormData) {
    setSavedMessage("");
    setForm(current => ({ ...current, address: change(current.address) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const documentError = validateDocument(form.document);

    if (documentError) {
      setErrorMessage(documentError);
      return;
    }

    if (isCpf && !form.personType) {
      setErrorMessage("Com CPF, escolha se é pessoa física (PF) ou jurídica (PJ).");
      return;
    }

    if (!form.name.trim()) {
      setErrorMessage(isCnpj ? "Informe a razão social." : "Informe o nome.");
      return;
    }

    if (isCnpj && !form.taxRegime) {
      setErrorMessage("Escolha o regime tributário.");
      return;
    }

    const addressError = validateAddress(form.address);

    if (addressError) {
      setErrorMessage(addressError);
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      await updateCompany(company.id, form);
      await onSaved();
      setSavedMessage("Dados da empresa salvos.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="settings-page">
      <fieldset disabled={!canEdit || saving} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
        <div className="settings-page">
          <section className="settings-card">
            <h3>Identificação</h3>
            <p>
              Digite o CPF ou o CNPJ: o sistema reconhece pelo número de dígitos (11 = CPF, 14 = CNPJ).
            </p>

            <div className="settings-grid">
              <div className="settings-field">
                <label htmlFor="company-document">CPF ou CNPJ</label>
                <input
                  id="company-document"
                  type="text"
                  inputMode="numeric"
                  value={form.document}
                  onChange={event => update("document", formatDocument(event.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxLength={18}
                />
                <small>
                  {isCnpj && "CNPJ: pessoa jurídica."}
                  {isCpf && "CPF: escolha ao lado se é PF ou PJ."}
                  {kind === "incompleto" && "Continue digitando..."}
                  {kind === "vazio" && "Obrigatório."}
                </small>
              </div>

              {isCpf ? (
                <div className="settings-field">
                  <label htmlFor="company-person-type">Tipo</label>
                  <select
                    id="company-person-type"
                    value={form.personType}
                    onChange={event => update("personType", event.target.value as PersonType | "")}
                  >
                    <option value="">Escolha...</option>
                    <option value="PF">Pessoa física (PF)</option>
                    <option value="PJ">Pessoa jurídica (PJ)</option>
                  </select>
                </div>
              ) : (
                <div className="settings-field">
                  <label>Tipo</label>
                  <span className={`settings-badge ${isCnpj ? "" : "settings-badge-muted"}`}>
                    {isCnpj ? "Pessoa jurídica (PJ)" : "Definido pelo documento"}
                  </span>
                </div>
              )}

              <div className="settings-field settings-field-full">
                <label htmlFor="company-name">{isCnpj ? "Razão social" : "Nome"}</label>
                <input
                  id="company-name"
                  type="text"
                  value={form.name}
                  onChange={event => update("name", event.target.value)}
                />
              </div>

              {isCnpj && (
                <>
                  <div className="settings-field settings-field-full">
                    <label htmlFor="company-trade-name">Nome fantasia</label>
                    <input
                      id="company-trade-name"
                      type="text"
                      value={form.tradeName}
                      onChange={event => update("tradeName", event.target.value)}
                    />
                    <small>É o nome que aparece no topo do sistema, se preenchido.</small>
                  </div>

                  <div className="settings-field settings-field-full">
                    <label htmlFor="company-tax-regime">Regime tributário</label>
                    <select
                      id="company-tax-regime"
                      value={form.taxRegime}
                      onChange={event => update("taxRegime", event.target.value as TaxRegime | "")}
                    >
                      <option value="">Escolha...</option>
                      {(Object.keys(TAX_REGIME_LABELS) as TaxRegime[]).map(regime => (
                        <option key={regime} value={regime}>
                          {TAX_REGIME_LABELS[regime]}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {(isCnpj || (isCpf && form.personType === "PJ")) && (
                <>
                  <div className="settings-field">
                    <label htmlFor="company-ie">Inscrição estadual</label>
                    <input
                      id="company-ie"
                      type="text"
                      value={form.stateRegistration}
                      onChange={event => update("stateRegistration", event.target.value)}
                    />
                  </div>

                  <div className="settings-field">
                    <label htmlFor="company-im">Inscrição municipal</label>
                    <input
                      id="company-im"
                      type="text"
                      value={form.municipalRegistration}
                      onChange={event => update("municipalRegistration", event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="settings-card">
            <h3>Contato</h3>

            <div className="settings-grid">
              <div className="settings-field">
                <label htmlFor="company-phone">Telefone / WhatsApp</label>
                <input
                  id="company-phone"
                  type="tel"
                  value={form.phone}
                  onChange={event => update("phone", event.target.value)}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="company-email">E-mail</label>
                <input
                  id="company-email"
                  type="email"
                  value={form.email}
                  onChange={event => update("email", event.target.value)}
                />
              </div>

              <div className="settings-field settings-field-full">
                <label htmlFor="company-website">Site</label>
                <input
                  id="company-website"
                  type="text"
                  value={form.website}
                  onChange={event => update("website", event.target.value)}
                  placeholder="www.suaempresa.com.br"
                />
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-grid">
              <AddressSection
                value={form.address}
                onChange={updateAddress}
                classPrefix="settings"
                idPrefix="company"
              />
            </div>
          </section>
        </div>
      </fieldset>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
      {savedMessage && <div className="settings-message settings-message-ok">{savedMessage}</div>}

      {canEdit ? (
        <div className="settings-actions">
          <button type="submit" className="settings-button" disabled={saving}>
            {saving ? "Salvando..." : "Salvar dados da empresa"}
          </button>
        </div>
      ) : (
        <div className="settings-note">
          Só administradores podem alterar os dados da empresa.
        </div>
      )}
    </form>
  );
}

/** Configurações → Empresas → Cadastro de uma empresa (/configuracoes/empresas/:id) */
function CompanySettings() {
  const { id } = useParams();
  const { companies, active, reload } = useCompany();

  const membership = companies.find(item => item.company.id === id);

  const backLink = (
    <Link
      to="/configuracoes/empresas"
      className="settings-button settings-button-secondary settings-button-small"
    >
      <ArrowLeft size={14} />
      Empresas
    </Link>
  );

  if (!membership) {
    return (
      <div className="settings-page">
        <section className="settings-header">
          <div>
            <h2>Empresa não encontrada</h2>
            <p>Ela não existe ou você não participa dela.</p>
          </div>
          {backLink}
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

        {backLink}
      </section>

      {/* key: ao trocar de empresa, o formulário recomeça com os dados dela */}
      <CompanyForm
        key={company.id}
        company={company}
        canEdit={permissions.isAdmin}
        onSaved={reload}
      />
    </div>
  );
}

export default CompanySettings;
