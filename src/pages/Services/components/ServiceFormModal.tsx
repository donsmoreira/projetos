import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import Modal from "../../../components/Modal/Modal";
import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import ManagementAccountSelect from "../../../components/ManagementAccountSelect/ManagementAccountSelect";

import { createService, updateService } from "../../../services/servicesService";
import type { IssTaxation, Service, ServiceFormData } from "../../../types/service";
import { ISS_TAXATION_LABELS } from "../../../types/service";
import { formatCnaeCode, formatNationalCode, formatNbs } from "../../../utils/serviceFormat";

type ServiceFormModalProps = {
  service: Service | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function emptyForm(service: Service | null): ServiceFormData {
  return {
    code: service?.code ?? "",
    description: service?.description ?? "",
    unitPrice: service?.unit_price ?? 0,
    nationalTaxCode: formatNationalCode(service?.national_tax_code),
    municipalTaxCode: service?.municipal_tax_code ?? "",
    nbsCode: formatNbs(service?.nbs_code),
    cnae: formatCnaeCode(service?.cnae),
    issTaxation: service?.iss_taxation ?? "tributavel",
    issRate: service?.iss_rate ?? 0,
    issWithheld: service?.iss_withheld ?? false,
    pisRate: service?.pis_rate ?? 0,
    cofinsRate: service?.cofins_rate ?? 0,
    csllRate: service?.csll_rate ?? 0,
    irrfRate: service?.irrf_rate ?? 0,
    inssRate: service?.inss_rate ?? 0,
    managementAccountId: service?.management_account_id ?? "",
    category: service?.category ?? "",
    notes: service?.notes ?? ""
  };
}

/** Rótulo com a marca de obrigatório/opcional */
function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor}>
      {children}{" "}
      <span className={required ? "svc-required" : "svc-optional"}>{required ? "obrigatório" : "opcional"}</span>
    </label>
  );
}

const RATE_FIELDS: [keyof ServiceFormData, string][] = [
  ["pisRate", "PIS"],
  ["cofinsRate", "COFINS"],
  ["csllRate", "CSLL"],
  ["irrfRate", "IRRF"],
  ["inssRate", "INSS"]
];

/** Cadastro do serviço com os dados da NFS-e do padrão nacional. */
function ServiceFormModal({ service, onClose, onSaved }: ServiceFormModalProps) {
  const [form, setForm] = useState<ServiceFormData>(() => emptyForm(service));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function update<K extends keyof ServiceFormData>(key: K, value: ServiceFormData[K]) {
    setErrorMessage("");
    setForm(current => ({ ...current, [key]: value }));
  }

  function rateInput(key: keyof ServiceFormData, max: number) {
    return (
      <input
        id={`svc-${key}`}
        type="number"
        min={0}
        max={max}
        step="0.01"
        inputMode="decimal"
        value={Number(form[key]) || 0}
        onChange={event => update(key, Math.round(Number(event.target.value || 0) * 100) / 100 as never)}
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.code.trim()) return setErrorMessage("Informe o código do serviço.");
    if (!form.description.trim()) return setErrorMessage("Informe a descrição do serviço.");
    if (form.nationalTaxCode.replace(/\D/g, "").length !== 6) {
      return setErrorMessage("O código de tributação nacional precisa ter 6 números (ex.: 01.07.01).");
    }
    if (form.municipalTaxCode && form.municipalTaxCode.replace(/\D/g, "").length !== 3) {
      return setErrorMessage("O código de tributação municipal precisa ter 3 números.");
    }
    if (form.nbsCode && form.nbsCode.replace(/\D/g, "").length !== 9) {
      return setErrorMessage("O código NBS precisa ter 9 números.");
    }
    if (form.cnae && form.cnae.replace(/\D/g, "").length !== 7) {
      return setErrorMessage("O CNAE precisa ter 7 números.");
    }
    if (form.issRate < 0 || form.issRate > 5) {
      return setErrorMessage("A alíquota do ISS vai de 0% a 5%.");
    }

    try {
      setSaving(true);
      setErrorMessage("");

      if (service) {
        await updateService(service.id, form);
      } else {
        await createService(form);
      }

      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar o serviço.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={service ? "Editar serviço" : "Cadastrar serviço"}
      subtitle="Dados usados na nota de serviço (NFS-e padrão nacional)."
      onClose={onClose}
      width={760}
    >
      <form className="arc-form" onSubmit={handleSubmit}>
        <div className="svc-section-title">Identificação</div>
        <div className="arc-form-grid svc-grid-3">
          <div className="arc-field">
            <Label htmlFor="svc-code" required>Código do serviço</Label>
            <input id="svc-code" value={form.code} maxLength={30} onChange={event => update("code", event.target.value)} placeholder="Ex.: 001" />
          </div>

          <div className="arc-field svc-span-2">
            <Label htmlFor="svc-description" required>Descrição do serviço</Label>
            <input
              id="svc-description"
              value={form.description}
              maxLength={2000}
              onChange={event => update("description", event.target.value)}
              placeholder="Ex.: Manutenção de computadores"
            />
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-price" required>Valor unitário (R$)</Label>
            <CurrencyInput id="svc-price" value={form.unitPrice} onChange={value => update("unitPrice", value)} />
          </div>
        </div>

        <div className="svc-section-title">Tributação da NFS-e (padrão nacional)</div>
        <div className="arc-form-grid svc-grid-3">
          <div className="arc-field">
            <Label htmlFor="svc-national" required>Código de tributação nacional</Label>
            <input
              id="svc-national"
              inputMode="numeric"
              value={form.nationalTaxCode}
              onChange={event => update("nationalTaxCode", formatNationalCode(event.target.value))}
              placeholder="00.00.00"
              maxLength={8}
            />
            <small className="arc-hint">Item e subitem da lista da LC 116 + desdobro (ex.: 01.07.01). Confirme com o contador.</small>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-municipal">Código de tributação municipal</Label>
            <input
              id="svc-municipal"
              inputMode="numeric"
              value={form.municipalTaxCode}
              onChange={event => update("municipalTaxCode", event.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="000"
              maxLength={3}
            />
            <small className="arc-hint">Só se a prefeitura usar um código próprio.</small>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-nbs">Código NBS</Label>
            <input
              id="svc-nbs"
              inputMode="numeric"
              value={form.nbsCode}
              onChange={event => update("nbsCode", formatNbs(event.target.value))}
              placeholder="0.0000.00.00"
              maxLength={12}
            />
            <small className="arc-hint">Nomenclatura Brasileira de Serviços; usada com a reforma tributária (IBS/CBS).</small>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-cnae">CNAE do serviço</Label>
            <input
              id="svc-cnae"
              inputMode="numeric"
              value={form.cnae}
              onChange={event => update("cnae", formatCnaeCode(event.target.value))}
              placeholder="0000-0/00"
              maxLength={9}
            />
            <small className="arc-hint">Se vazio, vale o CNAE principal da empresa.</small>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-taxation" required>Tributação do ISS</Label>
            <select
              id="svc-taxation"
              value={form.issTaxation}
              onChange={event => update("issTaxation", event.target.value as IssTaxation)}
            >
              {(Object.keys(ISS_TAXATION_LABELS) as IssTaxation[]).map(key => (
                <option key={key} value={key}>{ISS_TAXATION_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-issRate" required>Alíquota do ISS (%)</Label>
            {rateInput("issRate", 5)}
            <small className="arc-hint">De 0% a 5%. Simples Nacional: a alíquota da faixa do contador.</small>
          </div>

          <label className="svc-check arc-field-full">
            <input
              type="checkbox"
              checked={form.issWithheld}
              onChange={event => update("issWithheld", event.target.checked)}
            />
            ISS retido pelo tomador (o cliente paga o ISS e desconta da nota) <span className="svc-optional">opcional</span>
          </label>
        </div>

        <div className="svc-section-title">
          Retenções federais <span className="svc-optional">opcionais</span>
        </div>
        <div className="arc-form-grid svc-grid-5">
          {RATE_FIELDS.map(([key, label]) => (
            <div key={key} className="arc-field">
              <label htmlFor={`svc-${key}`}>{label} (%)</label>
              {rateInput(key, 100)}
            </div>
          ))}
        </div>
        <small className="arc-hint">Preencha só se o cliente reter esses tributos (normalmente empresas maiores). Confirme com o contador.</small>

        <div className="svc-section-title">Financeiro</div>
        <div className="arc-field">
          <Label htmlFor="svc-account">Conta gerencial de receita</Label>
          <ManagementAccountSelect
            id="svc-account"
            type="receita"
            value={form.managementAccountId}
            onChange={(accountId, path) => {
              update("managementAccountId", accountId);
              update("category", path);
            }}
          />
        </div>

        <div className="arc-field">
          <Label htmlFor="svc-notes">Observações</Label>
          <textarea id="svc-notes" rows={2} value={form.notes} onChange={event => update("notes", event.target.value)} />
        </div>

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="arc-button arc-button-primary" disabled={saving}>
            {saving ? "Salvando..." : service ? "Salvar alterações" : "Cadastrar serviço"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ServiceFormModal;
