import { useState } from "react";
import type { FormEvent } from "react";

import AddressSection from "../../components/AddressSection/AddressSection";
import {
  CnpjLookupHint,
  CnpjLookupMessage
} from "../../components/CnpjLookup/CnpjLookupInfo";
import { useCnpjLookup } from "../../hooks/useCnpjLookup";
import { documentKind, formatDocument } from "../../utils/document";
import { formatCnae, validateCompanyForm } from "./companyFormData";

import type { AddressFormData } from "../../types/address";
import type {
  CompanyFormData,
  NfseEnvironment,
  PersonType,
  SpecialTaxRegime,
  TaxRegime
} from "../../types/company";
import { SPECIAL_TAX_REGIME_LABELS, TAX_REGIME_LABELS } from "../../types/company";

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

  // Consulta à Receita: preenche o formulário com o que vier
  const receita = useCnpjLookup(result => {
    setSavedMessage("");
    setForm(current => ({
      ...current,
      name: result.name || current.name,
      tradeName: result.tradeName || current.tradeName,
      // Sem Simples/MEI a Receita não diz se é Regime Normal ou Não contribuinte
      taxRegime: result.taxRegime || current.taxRegime,
      stateRegistration: result.stateRegistration || current.stateRegistration,
      // Telefone e e-mail da Receita costumam ser do contador: só se estiver vazio
      phone: current.phone.trim() ? current.phone : result.phone,
      email: current.email.trim() ? current.email : result.email,
      address: result.address.zipCode || result.address.street
        ? result.address
        : current.address,
      // CNAE principal da Receita (para a NFS-e)
      cnae: result.cnae ? formatCnae(result.cnae) : current.cnae,
      cnaeDescription: result.cnae ? result.cnaeDescription : current.cnaeDescription
    }));
  });

  const kind = documentKind(form.document);
  const isCnpj = kind === "cnpj";
  const isCpf = kind === "cpf";
  /** Pessoa física: CPF com "PF" escolhido. Nos outros casos mostra os campos de empresa */
  const isPf = isCpf && form.personType === "PF";

  function update<K extends keyof CompanyFormData>(field: K, value: CompanyFormData[K]) {
    setSavedMessage("");
    setForm(current => ({ ...current, [field]: value }));
  }

  function handleDocumentChange(value: string) {
    const formatted = formatDocument(value);
    update("document", formatted);
    receita.handleDocumentChange(formatted);
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
                  onChange={event => handleDocumentChange(event.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxLength={18}
                />
                <CnpjLookupHint
                  document={form.document}
                  lookup={receita}
                  emptyHint="Obrigatório. Com CNPJ, os dados vêm da Receita."
                  cpfHint="CPF: escolha ao lado se é PF ou PJ."
                />
              </div>

              <CnpjLookupMessage lookup={receita} showTaxRegimeHint />

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
                <label htmlFor="company-name">{isPf ? "Nome" : "Razão social"}</label>
                <input
                  id="company-name"
                  type="text"
                  value={form.name}
                  onChange={event => update("name", event.target.value)}
                />
              </div>

              {/* Dados de empresa: sempre visíveis, menos para pessoa física */}
              {!isPf && (
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
                    <label htmlFor="company-tax-regime">Enquadramento (regime tributário)</label>
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
                    <small>Necessária para emitir nota de serviço (NFS-e).</small>
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

          <section className="settings-card">
            <h3>Nota fiscal de serviço (NFS-e)</h3>
            <p>
              Dados usados na emissão da nota de serviço. O certificado digital e o cadastro de serviços
              entram numa próxima etapa.
            </p>

            <div className="settings-grid">
              <div className="settings-field">
                <label htmlFor="company-cnae">CNAE principal</label>
                <input
                  id="company-cnae"
                  type="text"
                  inputMode="numeric"
                  placeholder="0000-0/00"
                  value={form.cnae}
                  onChange={event => update("cnae", formatCnae(event.target.value))}
                  maxLength={9}
                />
                <small>{form.cnaeDescription || "Vem da Receita ao buscar o CNPJ."}</small>
              </div>

              <div className="settings-field">
                <label htmlFor="company-special-regime">Regime especial de tributação</label>
                <select
                  id="company-special-regime"
                  value={form.specialTaxRegime}
                  onChange={event => update("specialTaxRegime", event.target.value as SpecialTaxRegime)}
                >
                  {(Object.keys(SPECIAL_TAX_REGIME_LABELS) as SpecialTaxRegime[]).map(regime => (
                    <option key={regime} value={regime}>
                      {SPECIAL_TAX_REGIME_LABELS[regime]}
                    </option>
                  ))}
                </select>
                <small>Regime municipal do ISS. Na dúvida, confirme com o contador.</small>
              </div>

              <div className="settings-field">
                <label htmlFor="company-nfse-series">Série da nota</label>
                <input
                  id="company-nfse-series"
                  type="text"
                  value={form.nfseSeries}
                  onChange={event => update("nfseSeries", event.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 5))}
                  maxLength={5}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="company-nfse-number">Próximo número da nota</label>
                <input
                  id="company-nfse-number"
                  type="number"
                  min={1}
                  step={1}
                  value={form.nfseNextNumber}
                  onChange={event => update("nfseNextNumber", Math.floor(Number(event.target.value) || 0))}
                />
                <small>Se a empresa já emitia notas em outro sistema, continue a numeração de lá.</small>
              </div>

              <div className="settings-field settings-field-full">
                <label>Ambiente de emissão</label>
                <div className="settings-env-choice" role="radiogroup" aria-label="Ambiente de emissão">
                  {([
                    ["homologacao", "Homologação", "Testes: notas sem valor fiscal."],
                    ["producao", "Produção", "Notas reais, com valor fiscal."]
                  ] as [NfseEnvironment, string, string][]).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`settings-env-option${form.nfseEnvironment === value ? " is-selected" : ""}${value === "producao" ? " is-production" : ""}`}
                    >
                      <input
                        type="radio"
                        name="company-nfse-environment"
                        checked={form.nfseEnvironment === value}
                        onChange={() => update("nfseEnvironment", value)}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
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
