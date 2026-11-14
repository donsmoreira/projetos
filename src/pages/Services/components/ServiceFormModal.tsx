import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import Modal from "../../../components/Modal/Modal";
import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import CodeSearch from "../../../components/CodeSearch/CodeSearch";
import ManagementAccountSelect from "../../../components/ManagementAccountSelect/ManagementAccountSelect";

import { useCompany } from "../../../hooks/useCompany";
import { loadNfseTables } from "../../../data/nfse";
import type { NfseTables } from "../../../data/nfse";
import { createService, updateService } from "../../../services/servicesService";
import type { IssTaxation, Service, ServiceFormData } from "../../../types/service";
import { ISS_TAXATION_LABELS, PIS_COFINS_CST, SERVICE_UNITS } from "../../../types/service";
import { formatCnaeCode, formatNationalCode, formatNbs } from "../../../utils/serviceFormat";
import { taxFieldsFromRow, taxFieldsProblem } from "../../../utils/serviceTax";
import { classTribOptions, cstOptions, indOpOptions, lc116Item, nbsMatchesItem, nbsOptions } from "../../../utils/nfseOptions";

type ServiceFormModalProps = {
  service: Service | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function emptyForm(service: Service | null, companyIsSimples: boolean): ServiceFormData {
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
    ...taxFieldsFromRow(service, { simplesOptant: companyIsSimples }),
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

/** Cadastro do serviço com os dados da NFS-e do padrão nacional. */
function ServiceFormModal({ service, onClose, onSaved }: ServiceFormModalProps) {
  const { active } = useCompany();
  const companyRegime = active?.company?.tax_regime ?? null;
  const companyIsSimples = companyRegime === "simples" || companyRegime === "simples_mei";

  const [form, setForm] = useState<ServiceFormData>(() => emptyForm(service, companyIsSimples));
  const [tables, setTables] = useState<NfseTables | null>(null);
  const [tablesError, setTablesError] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let alive = true;

    loadNfseTables()
      .then(data => {
        if (alive) setTables(data);
      })
      .catch(() => {
        if (alive) setTablesError("Não foi possível carregar as tabelas da NFS-e. Recarregue a página.");
      });

    return () => {
      alive = false;
    };
  }, []);

  const nbsList = useMemo(() => (tables ? nbsOptions(tables, form.nationalTaxCode) : null), [tables, form.nationalTaxCode]);
  const indOpList = useMemo(() => (tables ? indOpOptions(tables) : null), [tables]);
  const cstList = useMemo(() => (tables ? cstOptions(tables) : null), [tables]);
  const classList = useMemo(() => (tables ? classTribOptions(tables, form.ibsCbsCst) : null), [tables, form.ibsCbsCst]);

  const item = lc116Item(form.nationalTaxCode);
  const nbsOk = tables ? nbsMatchesItem(tables, form.nbsCode, form.nationalTaxCode) : null;

  function update<K extends keyof ServiceFormData>(key: K, value: ServiceFormData[K]) {
    setErrorMessage("");
    setForm(current => ({ ...current, [key]: value }));
  }

  function rateInput(key: keyof ServiceFormData, max: number, disabled = false) {
    return (
      <input
        id={`svc-${key}`}
        type="number"
        min={0}
        max={max}
        step="0.01"
        inputMode="decimal"
        disabled={disabled}
        value={Number(form[key]) || 0}
        onChange={event => update(key, Math.round(Number(event.target.value || 0) * 100) / 100 as never)}
      />
    );
  }

  function chooseCst(cst: string) {
    setErrorMessage("");
    setForm(current => ({
      ...current,
      ibsCbsCst: cst,
      // a classificação precisa ser do mesmo CST
      ibsCbsClassTrib: current.ibsCbsClassTrib.startsWith(cst) && cst ? current.ibsCbsClassTrib : ""
    }));
  }

  function chooseClassTrib(code: string) {
    setErrorMessage("");
    setForm(current => ({ ...current, ibsCbsClassTrib: code, ibsCbsCst: code ? code.slice(0, 3) : current.ibsCbsCst }));
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
    if (!form.ibsCbsIndOp) return setErrorMessage("Escolha o código indicador de operação (IBS/CBS).");
    if (!form.ibsCbsCst) return setErrorMessage("Escolha o CST do IBS/CBS.");
    if (!form.ibsCbsClassTrib) return setErrorMessage("Escolha a classificação tributária do IBS/CBS.");

    const taxProblem = taxFieldsProblem(form);
    if (taxProblem) return setErrorMessage(taxProblem);

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

  const unitKnown = SERVICE_UNITS.some(([code]) => code === form.unit);

  return (
    <Modal
      title={service ? "Editar serviço" : "Cadastrar serviço"}
      subtitle="Dados usados na nota de serviço (NFS-e padrão nacional)."
      onClose={onClose}
      width={820}
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
            <Label htmlFor="svc-unit" required>Unidade de medida</Label>
            <select id="svc-unit" value={form.unit} onChange={event => update("unit", event.target.value)}>
              {!unitKnown && <option value={form.unit}>{form.unit}</option>}
              {SERVICE_UNITS.map(([code, label]) => (
                <option key={code} value={code}>{code} - {label}</option>
              ))}
            </select>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-price" required>Valor unitário (R$)</Label>
            <CurrencyInput id="svc-price" value={form.unitPrice} onChange={value => update("unitPrice", value)} />
          </div>
        </div>

        {tablesError && <div className="arc-form-error">{tablesError}</div>}

        <div className="svc-section-title">Tributação municipal (ISS)</div>
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

          <div className="arc-field arc-field-full">
            <Label htmlFor="svc-nbs">Código NBS (Nomenclatura Brasileira de Serviços)</Label>
            <CodeSearch
              id="svc-nbs"
              value={form.nbsCode.replace(/\D/g, "")}
              options={nbsList}
              onChange={code => update("nbsCode", formatNbs(code))}
              placeholder="Buscar NBS por código ou descrição"
              highlightLabel={item ? `item ${item.slice(0, 2)}.${item.slice(2)}` : undefined}
            />
            {nbsOk === false ? (
              <small className="svc-warning">
                Esta NBS não está ligada ao item {item.slice(0, 2)}.{item.slice(2)} na tabela da Receita. A nota pode ser rejeitada.
              </small>
            ) : (
              <small className="arc-hint">
                Lista oficial da NFS-e (Anexo VIII da Receita). As ligadas ao seu código de tributação nacional aparecem primeiro.
              </small>
            )}
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
            <small className="arc-hint">De 0% a 5%.</small>
          </div>

          <label className="svc-check">
            <input
              type="checkbox"
              checked={form.issWithheld}
              onChange={event => update("issWithheld", event.target.checked)}
            />
            ISS retido pelo tomador
          </label>
        </div>

        <div className="svc-section-title">
          Tributos federais <span className="svc-optional">opcionais</span>
        </div>
        <div className="arc-form-grid svc-grid-3">
          <div className="arc-field">
            <Label htmlFor="svc-piscst">CST do PIS/COFINS</Label>
            <select id="svc-piscst" value={form.pisCofinsCst} onChange={event => update("pisCofinsCst", event.target.value)}>
              <option value="">Não informar</option>
              {PIS_COFINS_CST.map(([code, label]) => (
                <option key={code} value={code}>{code} - {label}</option>
              ))}
            </select>
          </div>

          <div className="arc-field">
            <label htmlFor="svc-pisRate">Alíquota do PIS (%)</label>
            {rateInput("pisRate", 100)}
          </div>

          <div className="arc-field">
            <label htmlFor="svc-cofinsRate">Alíquota da COFINS (%)</label>
            {rateInput("cofinsRate", 100)}
          </div>

          <div className="arc-field">
            <label htmlFor="svc-csllRate">Alíquota da CSLL (%)</label>
            {rateInput("csllRate", 100)}
          </div>

          <div className="arc-field">
            <label htmlFor="svc-irrfRate">Alíquota do IRRF (%)</label>
            {rateInput("irrfRate", 100)}
          </div>

          <div className="arc-field">
            <label htmlFor="svc-inssRate">Contribuição previdenciária - INSS (%)</label>
            {rateInput("inssRate", 100)}
          </div>
        </div>

        <div className="svc-retention">
          <span>O cliente (tomador) vai reter:</span>
          <label className="svc-check">
            <input type="checkbox" checked={form.pisWithheld} onChange={event => update("pisWithheld", event.target.checked)} />
            PIS
          </label>
          <label className="svc-check">
            <input type="checkbox" checked={form.cofinsWithheld} onChange={event => update("cofinsWithheld", event.target.checked)} />
            COFINS
          </label>
          <label className="svc-check">
            <input type="checkbox" checked={form.csllWithheld} onChange={event => update("csllWithheld", event.target.checked)} />
            CSLL
          </label>
        </div>
        <small className="arc-hint">
          PIS, COFINS e CSLL só são descontados do valor líquido quando marcados como retidos. IRRF e INSS informados são sempre retenção.
          Confirme com o contador.
        </small>

        <div className="svc-section-title">
          Tributos aproximados (Lei 12.741/2012) <span className="svc-optional">opcionais</span>
        </div>
        <div className="arc-form-grid svc-grid-3">
          <div className="arc-field">
            <label htmlFor="svc-approxTaxFederal">Federal (%)</label>
            {rateInput("approxTaxFederal", 100)}
          </div>
          <div className="arc-field">
            <label htmlFor="svc-approxTaxState">Estadual (%)</label>
            {rateInput("approxTaxState", 100)}
          </div>
          <div className="arc-field">
            <label htmlFor="svc-approxTaxMunicipal">Municipal (%)</label>
            {rateInput("approxTaxMunicipal", 100)}
          </div>
        </div>
        <small className="arc-hint">Percentuais da tabela do IBPT para este serviço. Aparecem na nota como "valor aproximado dos tributos".</small>

        <div className="svc-section-title">Simples Nacional</div>
        <div className="arc-form-grid svc-grid-3">
          <label className="svc-check svc-span-2">
            <input
              type="checkbox"
              checked={form.simplesOptant}
              onChange={event => update("simplesOptant", event.target.checked)}
            />
            O prestador é optante pelo Simples Nacional
          </label>

          <div className="arc-field">
            <Label htmlFor="svc-simplesRate" required={form.simplesOptant}>Alíquota do Simples Nacional (%)</Label>
            {rateInput("simplesRate", 100, !form.simplesOptant)}
          </div>
        </div>
        <small className="arc-hint">
          {companyRegime
            ? `No cadastro da empresa o enquadramento é "${companyIsSimples ? "Simples Nacional" : "fora do Simples"}". `
            : ""}
          A alíquota efetiva do Simples é a da faixa informada pelo contador.
        </small>

        <div className="svc-section-title">Reforma tributária (IBS/CBS)</div>
        <div className="arc-form-grid">
          <div className="arc-field arc-field-full">
            <Label htmlFor="svc-indop" required>Código indicador de operação (cIndOp)</Label>
            <CodeSearch
              id="svc-indop"
              value={form.ibsCbsIndOp}
              options={indOpList}
              onChange={code => update("ibsCbsIndOp", code)}
              placeholder="Buscar indicador de operação"
            />
            <small className="arc-hint">Diz onde a operação acontece (define o local de incidência do IBS). Tabela oficial: Anexo VII.</small>
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-ibscst" required>CST do IBS/CBS</Label>
            <CodeSearch id="svc-ibscst" value={form.ibsCbsCst} options={cstList} onChange={chooseCst} placeholder="Buscar CST" />
          </div>

          <div className="arc-field">
            <Label htmlFor="svc-classtrib" required>Classificação tributária (cClassTrib)</Label>
            <CodeSearch
              id="svc-classtrib"
              value={form.ibsCbsClassTrib}
              options={classList}
              onChange={chooseClassTrib}
              placeholder={form.ibsCbsCst ? `Buscar classificação do CST ${form.ibsCbsCst}` : "Buscar classificação"}
            />
          </div>
        </div>
        <small className="arc-hint">
          Só aparecem os códigos aceitos na NFS-e. Escolher a classificação já preenche o CST. Na dúvida, o mais comum é CST 000 /
          classificação 000001 (tributação integral). Confirme com o contador.
        </small>

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
