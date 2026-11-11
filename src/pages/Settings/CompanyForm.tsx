import { useState } from "react";
import type { FormEvent } from "react";

import AddressSection from "../../components/AddressSection/AddressSection";
import { documentKind, formatDocument } from "../../utils/document";
import { validateCompanyForm } from "./companyFormData";

import type { AddressFormData } from "../../types/address";
import type {
  CompanyFormData,
  PersonType,
  TaxRegime
} from "../../types/company";
import { TAX_REGIME_LABELS } from "../../types/company";

import "./Settings.css";

type CompanyFormProps = {
  initial: CompanyFormData;
  canEdit: boolean;
  submitLabel: string;
  savingLabel: string;
  /** Salva; devolve a mensagem de sucesso (ou "" se a tela vai mudar) */
  onSubmit: (form: CompanyFormData) => Promise<string>;
};

/** Cadastro completo da empresa: usado para criar uma nova e para alterar. */
function CompanyForm({
  initial,
  canEdit,
  submitLabel,
  savingLabel,
  onSubmit
}: CompanyFormProps) {
  const [form, setForm] = useState<CompanyFormData>(initial);
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

    const problem = validateCompanyForm(form);

    if (problem) {
      setErrorMessage(problem);
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSavedMessage(await onSubmit(form));
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
            {saving ? savingLabel : submitLabel}
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

export default CompanyForm;
