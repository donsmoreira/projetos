import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

import { Building2, FileText, UserRound } from "lucide-react";

import Modal from "../../../components/Modal/Modal";
import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

import { listClients } from "../../../services/clientsService";
import { listServices } from "../../../services/servicesService";
import { saveServiceInvoice } from "../../../services/serviceInvoicesService";

import type { Client } from "../../../types/client";
import type { Company } from "../../../types/company";
import { SPECIAL_TAX_REGIME_LABELS, TAX_REGIME_LABELS } from "../../../types/company";
import type { IssTaxation, Service } from "../../../types/service";
import { ISS_TAXATION_LABELS } from "../../../types/service";
import type { ServiceInvoice, ServiceInvoiceFormData } from "../../../types/serviceInvoice";

import { formatCurrency } from "../../../utils/currency";
import { formatDocument } from "../../../utils/document";
import { formatCityState } from "../../../utils/address";
import { todayISO } from "../../../utils/entryBatch";
import { computeInvoiceTotals, providerMissing, takerMissing } from "../../../utils/nfseCalc";
import { formatNationalCode, formatNbs } from "../../../utils/serviceFormat";

type Tab = "prestador" | "tomador" | "servico";

type InvoiceFormModalProps = {
  company: Company;
  invoice: ServiceInvoice | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function formFromInvoice(invoice: ServiceInvoice | null): ServiceInvoiceFormData {
  return {
    issueDate: invoice?.issue_date ?? todayISO(),
    competenceDate: invoice?.competence_date ?? todayISO(),
    clientId: invoice?.client_id ?? "",
    serviceId: invoice?.service_id ?? "",
    serviceCode: invoice?.service_code ?? "",
    nationalTaxCode: formatNationalCode(invoice?.national_tax_code),
    municipalTaxCode: invoice?.municipal_tax_code ?? "",
    nbsCode: formatNbs(invoice?.nbs_code),
    description: invoice?.description ?? "",
    amount: invoice?.amount ?? 0,
    unconditionalDiscount: invoice?.unconditional_discount ?? 0,
    deductions: invoice?.deductions ?? 0,
    issTaxation: invoice?.iss_taxation ?? "tributavel",
    issRate: invoice?.iss_rate ?? 0,
    issWithheld: invoice?.iss_withheld ?? false,
    pisRate: invoice?.pis_rate ?? 0,
    cofinsRate: invoice?.cofins_rate ?? 0,
    csllRate: invoice?.csll_rate ?? 0,
    irrfRate: invoice?.irrf_rate ?? 0,
    inssRate: invoice?.inss_rate ?? 0,
    notes: invoice?.notes ?? ""
  };
}

function Field({ label, value, missing }: { label: string; value: string | null | undefined; missing?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={missing ? "is-missing" : ""} title={value ?? ""}>
        {value?.trim() ? value : missing ? "Falta preencher" : "—"}
      </strong>
    </div>
  );
}

const RATES: [keyof ServiceInvoiceFormData, string][] = [
  ["pisRate", "PIS"],
  ["cofinsRate", "COFINS"],
  ["csllRate", "CSLL"],
  ["irrfRate", "IRRF"],
  ["inssRate", "INSS"]
];

/** Montar a NFS-e: prestador (empresa), tomador (cliente) e serviço. Salva como rascunho. */
function InvoiceFormModal({ company, invoice, onClose, onSaved }: InvoiceFormModalProps) {
  const [tab, setTab] = useState<Tab>(invoice ? "servico" : "tomador");
  const [form, setForm] = useState<ServiceInvoiceFormData>(() => formFromInvoice(invoice));
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([listClients(), listServices()])
      .then(([clientData, serviceData]) => {
        if (!active) return;
        setClients(clientData);
        setServices(serviceData);
      })
      .catch(error => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os cadastros.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const client = clients.find(item => item.id === form.clientId) ?? null;
  const totals = useMemo(() => computeInvoiceTotals(form), [form]);
  const providerProblems = providerMissing(company);
  const takerProblems = form.clientId ? takerMissing(client) : [];

  function update<K extends keyof ServiceInvoiceFormData>(key: K, value: ServiceInvoiceFormData[K]) {
    setErrorMessage("");
    setForm(current => ({ ...current, [key]: value }));
  }

  // Escolheu o serviço: puxa tudo do cadastro (descrição e valor continuam editáveis)
  function chooseService(serviceId: string) {
    const service = services.find(item => item.id === serviceId);

    setErrorMessage("");
    setForm(current =>
      service
        ? {
            ...current,
            serviceId: service.id,
            serviceCode: service.code,
            nationalTaxCode: formatNationalCode(service.national_tax_code),
            municipalTaxCode: service.municipal_tax_code ?? "",
            nbsCode: formatNbs(service.nbs_code),
            description: service.description,
            amount: service.unit_price,
            issTaxation: service.iss_taxation,
            issRate: service.iss_rate,
            issWithheld: service.iss_withheld,
            pisRate: service.pis_rate,
            cofinsRate: service.cofins_rate,
            csllRate: service.csll_rate,
            irrfRate: service.irrf_rate,
            inssRate: service.inss_rate
          }
        : { ...current, serviceId: "" }
    );
  }

  function rateInput(key: keyof ServiceInvoiceFormData, max: number) {
    return (
      <input
        id={`nfse-${key}`}
        type="number"
        min={0}
        max={max}
        step="0.01"
        inputMode="decimal"
        value={Number(form[key]) || 0}
        onChange={event => update(key, (Math.round(Number(event.target.value || 0) * 100) / 100) as never)}
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.clientId) {
      setTab("tomador");
      return setErrorMessage("Escolha o cliente (tomador).");
    }

    if (!form.serviceCode || form.nationalTaxCode.replace(/\D/g, "").length !== 6) {
      setTab("servico");
      return setErrorMessage("Escolha o serviço (com código de tributação nacional).");
    }

    if (!form.description.trim()) {
      setTab("servico");
      return setErrorMessage("Informe a descrição do serviço.");
    }

    if (!form.issueDate || !form.competenceDate) {
      return setErrorMessage("Informe a data de emissão e a competência.");
    }

    if (totals.problem) {
      setTab("servico");
      return setErrorMessage(totals.problem);
    }

    try {
      setSaving(true);
      setErrorMessage("");
      await saveServiceInvoice(invoice?.id ?? null, form, company.nfse_environment ?? "homologacao");
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar a nota.");
    } finally {
      setSaving(false);
    }
  }

  const activeClients = clients.filter(item => item.active !== false || item.id === form.clientId);
  const activeServices = services.filter(item => item.active || item.id === form.serviceId);

  return (
    <Modal
      title={invoice ? "Editar NFS-e (rascunho)" : "Montar NFS-e"}
      subtitle={`Ambiente: ${company.nfse_environment === "producao" ? "Produção (notas reais)" : "Homologação (testes, sem valor fiscal)"}`}
      onClose={onClose}
      width={820}
    >
      <form className="arc-form" onSubmit={handleSubmit}>
        <div className="arc-form-grid">
          <div className="arc-field">
            <label htmlFor="nfse-issue">Data de emissão</label>
            <input id="nfse-issue" type="date" value={form.issueDate} onChange={event => update("issueDate", event.target.value)} required />
          </div>
          <div className="arc-field">
            <label htmlFor="nfse-competence">Competência (data do serviço)</label>
            <input
              id="nfse-competence"
              type="date"
              value={form.competenceDate}
              onChange={event => update("competenceDate", event.target.value)}
              required
            />
          </div>
        </div>

        <div className="nfse-tabs" role="tablist">
          {([
            ["prestador", "Prestador", <Building2 key="p" size={15} />, providerProblems.length > 0],
            ["tomador", "Tomador", <UserRound key="t" size={15} />, !form.clientId || takerProblems.length > 0],
            ["servico", "Serviço", <FileText key="s" size={15} />, !form.serviceCode]
          ] as [Tab, string, ReactNode, boolean][]).map(([key, label, icon, warn]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
            >
              {icon} {label} {warn && <span className="nfse-tab-warn" title="Falta informação" />}
            </button>
          ))}
        </div>

        {loading && <small className="arc-hint">Carregando cadastros...</small>}

        {/* PRESTADOR: vem do cadastro da empresa */}
        {tab === "prestador" && (
          <>
            <div className="nfse-party">
              <Field label="Razão social / nome" value={company.name} />
              <Field label="CPF / CNPJ" value={formatDocument(company.document)} missing={!company.document} />
              <Field label="Inscrição municipal" value={company.municipal_registration} missing={!company.municipal_registration} />
              <Field label="Enquadramento" value={company.tax_regime ? TAX_REGIME_LABELS[company.tax_regime] : ""} />
              <Field
                label="Regime especial"
                value={company.special_tax_regime ? SPECIAL_TAX_REGIME_LABELS[company.special_tax_regime] : "Nenhum"}
              />
              <Field label="CNAE principal" value={company.cnae} />
              <Field
                label="Endereço"
                value={[company.street, company.address_number, company.neighborhood].filter(Boolean).join(", ")}
                missing={!company.street}
              />
              <Field
                label="Cidade (código IBGE)"
                value={`${formatCityState(company.city, company.state)}${company.city_code ? ` · ${company.city_code}` : ""}`}
                missing={!company.city_code}
              />
              <Field label="Série / próximo número" value={`${company.nfse_series ?? "1"} / ${company.nfse_next_number ?? 1}`} />
              <Field label="E-mail" value={company.email} />
            </div>

            {providerProblems.length > 0 ? (
              <ul className="nfse-warnings">
                <li>
                  Para emitir, complete no cadastro da empresa: <strong>{providerProblems.join(", ")}</strong>.{" "}
                  <Link to={`/configuracoes/empresas/${company.id}`} onClick={onClose}>Abrir o cadastro da empresa</Link>
                </li>
              </ul>
            ) : (
              <small className="arc-hint">Os dados do prestador vêm do cadastro da empresa e vão na nota como estiverem na hora da emissão.</small>
            )}
          </>
        )}

        {/* TOMADOR: vem do cadastro de clientes */}
        {tab === "tomador" && (
          <>
            <div className="arc-field">
              <label htmlFor="nfse-client">
                Cliente (tomador) <span className="svc-required">obrigatório</span>
              </label>
              <select id="nfse-client" value={form.clientId} onChange={event => update("clientId", event.target.value)}>
                <option value="">{loading ? "Carregando..." : "Selecione o cliente"}</option>
                {activeClients.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.document ? ` · ${formatDocument(item.document)}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {client && (
              <div className="nfse-party">
                <Field label="Nome / razão social" value={client.name} />
                <Field label="CPF / CNPJ" value={formatDocument(client.document)} missing={!client.document} />
                <Field label="Inscrição municipal" value={client.municipal_registration} />
                <Field label="E-mail" value={client.email} missing={!client.email} />
                <Field
                  label="Endereço"
                  value={[client.street, client.address_number, client.neighborhood].filter(Boolean).join(", ")}
                />
                <Field
                  label="Cidade (código IBGE)"
                  value={`${formatCityState(client.city, client.state)}${client.city_code ? ` · ${client.city_code}` : ""}`}
                  missing={!client.city_code}
                />
              </div>
            )}

            {client && takerProblems.length > 0 && (
              <ul className="nfse-warnings">
                <li>
                  Recomendado completar no cadastro do cliente: <strong>{takerProblems.join(", ")}</strong>.{" "}
                  <Link to="/clientes" onClick={onClose}>Abrir Clientes</Link>
                </li>
              </ul>
            )}
          </>
        )}

        {/* SERVIÇO: vem do cadastro de serviços; descrição e valor editáveis */}
        {tab === "servico" && (
          <>
            <div className="arc-field">
              <label htmlFor="nfse-service">
                Serviço <span className="svc-required">obrigatório</span>
              </label>
              <select id="nfse-service" value={form.serviceId} onChange={event => chooseService(event.target.value)}>
                <option value="">{loading ? "Carregando..." : "Selecione o serviço"}</option>
                {activeServices.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.description} · {formatCurrency(item.unit_price)}
                  </option>
                ))}
              </select>
              {services.length === 0 && !loading && (
                <small className="arc-hint">
                  Nenhum serviço cadastrado. <Link to="/servicos/cadastro" onClick={onClose}>Cadastrar serviços</Link>
                </small>
              )}
            </div>

            {form.serviceCode && (
              <small className="arc-hint">
                Código {form.serviceCode} · tributação nacional {form.nationalTaxCode}
                {form.municipalTaxCode ? ` · municipal ${form.municipalTaxCode}` : ""}
                {form.nbsCode ? ` · NBS ${form.nbsCode}` : ""}
              </small>
            )}

            <div className="arc-field">
              <label htmlFor="nfse-description">
                Descrição do serviço na nota <span className="svc-required">obrigatório</span>
              </label>
              <textarea
                id="nfse-description"
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={event => update("description", event.target.value)}
              />
              <small className="arc-hint">Vem do cadastro e pode ser alterada só nesta nota.</small>
            </div>

            <div className="arc-form-grid svc-grid-3">
              <div className="arc-field">
                <label htmlFor="nfse-amount">
                  Valor do serviço (R$) <span className="svc-required">obrigatório</span>
                </label>
                <CurrencyInput id="nfse-amount" value={form.amount} onChange={value => update("amount", value)} />
              </div>

              <div className="arc-field">
                <label htmlFor="nfse-discount">
                  Desconto incondicional (R$) <span className="svc-optional">opcional</span>
                </label>
                <CurrencyInput
                  id="nfse-discount"
                  value={form.unconditionalDiscount}
                  onChange={value => update("unconditionalDiscount", value)}
                />
              </div>

              <div className="arc-field">
                <label htmlFor="nfse-deductions">
                  Deduções (R$) <span className="svc-optional">opcional</span>
                </label>
                <CurrencyInput id="nfse-deductions" value={form.deductions} onChange={value => update("deductions", value)} />
              </div>

              <div className="arc-field">
                <label htmlFor="nfse-taxation">Tributação do ISS</label>
                <select
                  id="nfse-taxation"
                  value={form.issTaxation}
                  onChange={event => update("issTaxation", event.target.value as IssTaxation)}
                >
                  {(Object.keys(ISS_TAXATION_LABELS) as IssTaxation[]).map(key => (
                    <option key={key} value={key}>{ISS_TAXATION_LABELS[key]}</option>
                  ))}
                </select>
              </div>

              <div className="arc-field">
                <label htmlFor="nfse-issRate">Alíquota do ISS (%)</label>
                {rateInput("issRate", 5)}
              </div>

              <label className="svc-check">
                <input type="checkbox" checked={form.issWithheld} onChange={event => update("issWithheld", event.target.checked)} />
                ISS retido pelo tomador
              </label>
            </div>

            <div className="arc-form-grid svc-grid-5">
              {RATES.map(([key, label]) => (
                <div key={key} className="arc-field">
                  <label htmlFor={`nfse-${key}`}>{label} retido (%)</label>
                  {rateInput(key, 100)}
                </div>
              ))}
            </div>

            <div className="nfse-totals">
              <div>
                <span>Base de cálculo</span>
                <strong>{formatCurrency(totals.taxBase)}</strong>
              </div>
              <div>
                <span>ISS {form.issWithheld ? "(retido)" : ""}</span>
                <strong>{formatCurrency(totals.iss)}</strong>
              </div>
              <div>
                <span>Retenções federais</span>
                <strong>{formatCurrency(totals.federal)}</strong>
              </div>
              <div className="is-net">
                <span>Valor líquido</span>
                <strong>{formatCurrency(totals.net)}</strong>
              </div>
            </div>

            <div className="arc-field">
              <label htmlFor="nfse-notes">
                Informações complementares <span className="svc-optional">opcional</span>
              </label>
              <textarea id="nfse-notes" rows={2} value={form.notes} onChange={event => update("notes", event.target.value)} />
            </div>
          </>
        )}

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="arc-button arc-button-primary" disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar rascunho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default InvoiceFormModal;
