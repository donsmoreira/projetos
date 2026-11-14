import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

import { Building2, FileText, UserRound, Wallet } from "lucide-react";

import Modal from "../../../components/Modal/Modal";
import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

import { listClients } from "../../../services/clientsService";
import { listServices } from "../../../services/servicesService";
import { listBankAccounts } from "../../../services/bankAccountsService";
import { saveServiceInvoice } from "../../../services/serviceInvoicesService";

import type { Client } from "../../../types/client";
import type { Company } from "../../../types/company";
import { SPECIAL_TAX_REGIME_LABELS, TAX_REGIME_LABELS } from "../../../types/company";
import type { IssTaxation, Service } from "../../../types/service";
import { ISS_TAXATION_LABELS } from "../../../types/service";
import type { BankAccount } from "../../../types/bankAccount";
import type { PaymentTerm, ServiceInvoice, ServiceInvoiceFormData } from "../../../types/serviceInvoice";
import { PAYMENT_METHODS } from "../../../types/serviceInvoice";
import { accountKindFor, firstDueDateFor, paymentMissing, previewPaymentPlan } from "../../../utils/invoicePayment";
import { formatDateBR } from "../../../utils/entryBatch";

import { formatCurrency } from "../../../utils/currency";
import { formatDocument } from "../../../utils/document";
import { formatCityState } from "../../../utils/address";
import { todayISO } from "../../../utils/entryBatch";
import { computeInvoiceTotals, providerMissing, takerMissing } from "../../../utils/nfseCalc";
import { formatNationalCode, formatNbs } from "../../../utils/serviceFormat";
import { taxFieldsFromRow, taxFieldsProblem } from "../../../utils/serviceTax";

type Tab = "prestador" | "tomador" | "servico" | "pagamento";

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
    ...taxFieldsFromRow(invoice),
    paymentTerm: invoice?.payment_term ?? "a_vista",
    paymentMethod: invoice?.payment_method ?? "pix",
    paymentAccountId: invoice?.payment_account_id ?? "",
    installments: invoice?.installments ?? 1,
    firstDueDate: invoice?.first_due_date ?? "",
    cardInterestMode: invoice?.card_interest_mode ?? "sem_juros",
    cardInterestRate: invoice?.card_interest_rate ?? 0,
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

/** [alíquota, rótulo, marcação de retido (quando é opcional)] */
const RATES: [keyof ServiceInvoiceFormData, string, (keyof ServiceInvoiceFormData) | null][] = [
  ["pisRate", "PIS", "pisWithheld"],
  ["cofinsRate", "COFINS", "cofinsWithheld"],
  ["csllRate", "CSLL", "csllWithheld"],
  ["irrfRate", "IRRF retido", null],
  ["inssRate", "INSS retido", null]
];

/** Montar a NFS-e: prestador (empresa), tomador (cliente) e serviço. Salva como rascunho. */
function InvoiceFormModal({ company, invoice, onClose, onSaved }: InvoiceFormModalProps) {
  const [tab, setTab] = useState<Tab>(invoice ? "servico" : "tomador");
  const [form, setForm] = useState<ServiceInvoiceFormData>(() => formFromInvoice(invoice));
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([listClients(), listServices(), listBankAccounts()])
      .then(([clientData, serviceData, accountData]) => {
        if (!active) return;
        setClients(clientData);
        setServices(serviceData);
        setAccounts(accountData);
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
  const paymentProblems = loading ? [] : paymentMissing(form, accounts);
  const paymentPlan = previewPaymentPlan(form, totals.net);
  const accountOptions = accounts.filter(item => item.account_type === accountKindFor(form.paymentMethod));

  function choosePaymentTerm(term: PaymentTerm) {
    setErrorMessage("");
    setForm(current => {
      if (current.paymentTerm === term) return current;
      const method = PAYMENT_METHODS[term][0][0];
      return { ...current, paymentTerm: term, paymentMethod: method, installments: 1, firstDueDate: "", ...accountReset(current, method) };
    });
  }

  function choosePaymentMethod(method: ServiceInvoiceFormData["paymentMethod"]) {
    setErrorMessage("");
    setForm(current => ({
      ...current,
      paymentMethod: method,
      installments: method === "credito" ? Math.min(current.installments, 24) : current.installments,
      ...accountReset(current, method)
    }));
  }

  /** Trocou entre dinheiro (caixa) e os outros (banco): limpa a conta se ela não serve mais */
  function accountReset(current: ServiceInvoiceFormData, method: ServiceInvoiceFormData["paymentMethod"]) {
    const account = accounts.find(item => item.id === current.paymentAccountId);
    return account && account.account_type !== accountKindFor(method) ? { paymentAccountId: "" } : {};
  }

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
            ...taxFieldsFromRow(service)
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

    const taxProblem = taxFieldsProblem(form);
    if (taxProblem) {
      setTab("servico");
      return setErrorMessage(taxProblem);
    }

    // No rascunho a conta que recebe pode ficar para depois; o resto precisa estar certo
    const paymentErrors = paymentMissing(form, accounts).filter(item => !item.includes("que recebe"));
    if (paymentErrors.length > 0) {
      setTab("pagamento");
      return setErrorMessage(`Forma de pagamento: informe ${paymentErrors.join(", ")}.`);
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
            ["servico", "Serviço", <FileText key="s" size={15} />, !form.serviceCode],
            ["pagamento", "Forma de pagamento", <Wallet key="f" size={15} />, paymentProblems.length > 0]
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
              <div className="svc-codes-line">
                <span>Código {form.serviceCode} ({form.unit})</span>
                <span>Tributação nacional {form.nationalTaxCode}</span>
                {form.municipalTaxCode && <span>Municipal {form.municipalTaxCode}</span>}
                {form.nbsCode && <span>NBS {form.nbsCode}</span>}
                {form.pisCofinsCst && <span>CST PIS/COFINS {form.pisCofinsCst}</span>}
                {form.ibsCbsIndOp && <span>cIndOp {form.ibsCbsIndOp}</span>}
                {form.ibsCbsClassTrib && <span>IBS/CBS: CST {form.ibsCbsCst} · cClassTrib {form.ibsCbsClassTrib}</span>}
                {form.simplesOptant && <span>Simples Nacional {form.simplesRate.toLocaleString("pt-BR")}%</span>}
                {(form.approxTaxFederal > 0 || form.approxTaxState > 0 || form.approxTaxMunicipal > 0) && (
                  <span>
                    Tributos aproximados: fed. {form.approxTaxFederal.toLocaleString("pt-BR")}% · est.{" "}
                    {form.approxTaxState.toLocaleString("pt-BR")}% · mun. {form.approxTaxMunicipal.toLocaleString("pt-BR")}%
                  </span>
                )}
              </div>
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
              {RATES.map(([key, label, withheldKey]) => (
                <div key={key} className="arc-field">
                  <label htmlFor={`nfse-${key}`}>{label} (%)</label>
                  {rateInput(key, 100)}
                  {withheldKey && (
                    <label className="svc-check">
                      <input
                        type="checkbox"
                        checked={Boolean(form[withheldKey])}
                        onChange={event => update(withheldKey, event.target.checked as never)}
                      />
                      Retido
                    </label>
                  )}
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

        {/* FORMA DE PAGAMENTO: vira conta(s) a receber quando a nota for autorizada */}
        {tab === "pagamento" && (
          <>
            <div className="nfse-pay-choice" role="radiogroup" aria-label="À vista ou a prazo">
              {([["a_vista", "À vista"], ["a_prazo", "A prazo"]] as [PaymentTerm, string][]).map(([term, label]) => (
                <button
                  key={term}
                  type="button"
                  role="radio"
                  aria-checked={form.paymentTerm === term}
                  className={form.paymentTerm === term ? "is-active" : ""}
                  onClick={() => choosePaymentTerm(term)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="nfse-pay-methods" role="radiogroup" aria-label="Forma de pagamento">
              {PAYMENT_METHODS[form.paymentTerm].map(([method, label, hint]) => (
                <label key={method} className={`nfse-pay-method ${form.paymentMethod === method ? "is-active" : ""}`}>
                  <input
                    type="radio"
                    name="nfse-payment-method"
                    checked={form.paymentMethod === method}
                    onChange={() => choosePaymentMethod(method)}
                  />
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </label>
              ))}
            </div>

            <div className="arc-form-grid svc-grid-3">
              <div className="arc-field">
                <label htmlFor="nfse-pay-account">
                  {form.paymentMethod === "dinheiro" ? "Caixa que recebe" : "Conta bancária que recebe"}{" "}
                  <span className="svc-required">obrigatório para emitir</span>
                </label>
                <select
                  id="nfse-pay-account"
                  value={form.paymentAccountId}
                  onChange={event => update("paymentAccountId", event.target.value)}
                >
                  <option value="">{loading ? "Carregando..." : "Selecione"}</option>
                  {accountOptions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.bank ? ` · ${item.bank}` : ""}
                    </option>
                  ))}
                </select>
                {!loading && accountOptions.length === 0 && (
                  <small className="arc-hint">
                    Nenhum {form.paymentMethod === "dinheiro" ? "caixa" : "banco"} cadastrado.{" "}
                    <Link to={form.paymentMethod === "dinheiro" ? "/caixa" : "/bancos"} onClick={onClose}>Cadastrar</Link>
                  </small>
                )}
              </div>

              {form.paymentTerm === "a_prazo" && (
                <>
                  <div className="arc-field">
                    <label htmlFor="nfse-installments">
                      Número de parcelas <span className="svc-required">obrigatório</span>
                    </label>
                    <input
                      id="nfse-installments"
                      type="number"
                      min={1}
                      max={form.paymentMethod === "credito" ? 24 : 60}
                      step={1}
                      inputMode="numeric"
                      value={form.installments || ""}
                      onChange={event => update("installments", Math.floor(Number(event.target.value || 0)))}
                    />
                    <small className="arc-hint">{form.paymentMethod === "credito" ? "De 1 a 24 vezes." : "De 1 a 60 parcelas."}</small>
                  </div>

                  <div className="arc-field">
                    <label htmlFor="nfse-first-due">
                      {form.paymentMethod === "credito" ? "1º repasse da maquininha" : "1º vencimento"}{" "}
                      <span className="svc-optional">opcional</span>
                    </label>
                    <input
                      id="nfse-first-due"
                      type="date"
                      value={form.firstDueDate}
                      onChange={event => update("firstDueDate", event.target.value)}
                    />
                    <small className="arc-hint">Vazio = {formatDateBR(firstDueDateFor(form))} (um mês depois da emissão). As outras, de mês em mês.</small>
                  </div>
                </>
              )}
            </div>

            {form.paymentMethod === "credito" && (
              <div className="nfse-pay-interest">
                <div className="svc-section-title">
                  Juros do parcelamento (maquininha) <span className="nfse-soon">em breve</span>
                </div>
                <div className="arc-form-grid svc-grid-3">
                  <div className="arc-field">
                    <label htmlFor="nfse-interest-mode">Quem paga os juros</label>
                    <select id="nfse-interest-mode" value={form.cardInterestMode} disabled>
                      <option value="sem_juros">Sem juros</option>
                      <option value="cliente">Cliente (repassa os juros)</option>
                      <option value="empresa">Empresa (absorve a taxa)</option>
                    </select>
                  </div>
                  <div className="arc-field">
                    <label htmlFor="nfse-interest-rate">Taxa do parcelamento (%)</label>
                    <input id="nfse-interest-rate" type="number" value={form.cardInterestRate} disabled readOnly />
                  </div>
                </div>
                <small className="arc-hint">
                  O cálculo dos juros da maquininha será ligado depois. Por enquanto o parcelamento no cartão é sem juros.
                </small>
              </div>
            )}

            <div className="nfse-pay-plan">
              <div className="nfse-pay-plan-title">
                O que vai para o Contas a Receber quando a nota for autorizada
              </div>
              {totals.net > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>{form.paymentTerm === "a_vista" ? "Data" : "Vencimento"}</th>
                      <th className="svc-number">Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPlan.map(row => (
                      <tr key={row.installment}>
                        <td>{row.installment}/{paymentPlan.length}</td>
                        <td>{formatDateBR(row.dueDate)}</td>
                        <td className="svc-number">{formatCurrency(row.value)}</td>
                        <td>{row.received ? "Já recebida" : "Pendente"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <small className="arc-hint">Preencha o serviço e o valor para ver as parcelas.</small>
              )}
              <small className="arc-hint">
                Valor líquido da nota {formatCurrency(totals.net)} (já sem as retenções).{" "}
                {form.paymentTerm === "a_vista"
                  ? "Entra como recebida na conta escolhida, na data da emissão."
                  : "Os centavos que sobram da divisão ficam na 1ª parcela."}
              </small>
            </div>

            {paymentProblems.length > 0 && (
              <ul className="nfse-warnings">
                <li>Para emitir, falta escolher: <strong>{paymentProblems.join(", ")}</strong>.</li>
              </ul>
            )}
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
