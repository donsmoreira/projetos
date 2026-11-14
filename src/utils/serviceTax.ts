import type { ServiceTaxFields } from "../types/service";

/** Colunas de tributação iguais no serviço e na nota (service_invoices) */
export type TaxRow = {
  unit?: string | null;
  pis_cofins_cst?: string | null;
  pis_rate?: number | null;
  cofins_rate?: number | null;
  pis_withheld?: boolean | null;
  cofins_withheld?: boolean | null;
  csll_withheld?: boolean | null;
  csll_rate?: number | null;
  irrf_rate?: number | null;
  inss_rate?: number | null;
  approx_tax_federal?: number | null;
  approx_tax_state?: number | null;
  approx_tax_municipal?: number | null;
  simples_optant?: boolean | null;
  simples_rate?: number | null;
  ibs_cbs_ind_op?: string | null;
  ibs_cbs_cst?: string | null;
  ibs_cbs_class_trib?: string | null;
};

export const TAX_NUMBER_COLUMNS = [
  "pis_rate", "cofins_rate", "csll_rate", "irrf_rate", "inss_rate",
  "approx_tax_federal", "approx_tax_state", "approx_tax_municipal", "simples_rate"
];

const num = (value: number | null | undefined) => Number(value ?? 0);
const digits = (value: string) => value.replace(/\D/g, "");
const rate = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export function taxFieldsFromRow(row: TaxRow | null | undefined, defaults?: Partial<ServiceTaxFields>): ServiceTaxFields {
  return {
    unit: row?.unit || defaults?.unit || "UN",
    pisCofinsCst: row?.pis_cofins_cst ?? defaults?.pisCofinsCst ?? "",
    pisRate: num(row?.pis_rate),
    cofinsRate: num(row?.cofins_rate),
    pisWithheld: row?.pis_withheld ?? false,
    cofinsWithheld: row?.cofins_withheld ?? false,
    csllWithheld: row?.csll_withheld ?? false,
    csllRate: num(row?.csll_rate),
    irrfRate: num(row?.irrf_rate),
    inssRate: num(row?.inss_rate),
    approxTaxFederal: num(row?.approx_tax_federal),
    approxTaxState: num(row?.approx_tax_state),
    approxTaxMunicipal: num(row?.approx_tax_municipal),
    simplesOptant: row ? row.simples_optant === true : defaults?.simplesOptant ?? false,
    simplesRate: num(row?.simples_rate),
    ibsCbsIndOp: row?.ibs_cbs_ind_op ?? "",
    ibsCbsCst: row?.ibs_cbs_cst ?? "",
    ibsCbsClassTrib: row?.ibs_cbs_class_trib ?? ""
  };
}

export function taxFieldsToDb(form: ServiceTaxFields) {
  return {
    unit: (form.unit || "UN").toUpperCase(),
    pis_cofins_cst: digits(form.pisCofinsCst) || null,
    pis_rate: rate(form.pisRate),
    cofins_rate: rate(form.cofinsRate),
    pis_withheld: form.pisWithheld,
    cofins_withheld: form.cofinsWithheld,
    csll_withheld: form.csllWithheld,
    csll_rate: rate(form.csllRate),
    irrf_rate: rate(form.irrfRate),
    inss_rate: rate(form.inssRate),
    approx_tax_federal: rate(form.approxTaxFederal),
    approx_tax_state: rate(form.approxTaxState),
    approx_tax_municipal: rate(form.approxTaxMunicipal),
    simples_optant: form.simplesOptant,
    simples_rate: form.simplesOptant ? rate(form.simplesRate) : 0,
    ibs_cbs_ind_op: digits(form.ibsCbsIndOp) || null,
    ibs_cbs_cst: digits(form.ibsCbsCst) || null,
    ibs_cbs_class_trib: digits(form.ibsCbsClassTrib) || null
  };
}

/** Problemas de preenchimento da tributação (mensagem para a tela) */
export function taxFieldsProblem(form: ServiceTaxFields): string {
  const pct: [number, string][] = [
    [form.pisRate, "PIS"], [form.cofinsRate, "COFINS"], [form.csllRate, "CSLL"],
    [form.irrfRate, "IRRF"], [form.inssRate, "contribuição previdenciária"],
    [form.approxTaxFederal, "tributos aproximados federais"], [form.approxTaxState, "tributos aproximados estaduais"],
    [form.approxTaxMunicipal, "tributos aproximados municipais"], [form.simplesRate, "Simples Nacional"]
  ];

  for (const [value, label] of pct) {
    if (Number(value) < 0 || Number(value) > 100) return `A alíquota de ${label} vai de 0% a 100%.`;
  }

  if (form.pisWithheld && !(form.pisRate > 0)) return "Marcou PIS retido: informe a alíquota do PIS.";
  if (form.cofinsWithheld && !(form.cofinsRate > 0)) return "Marcou COFINS retida: informe a alíquota da COFINS.";
  if (form.csllWithheld && !(form.csllRate > 0)) return "Marcou CSLL retida: informe a alíquota da CSLL.";
  if (!form.csllWithheld && form.csllRate > 0) return "A CSLL só vai na nota quando é retida: marque a retenção da CSLL ou zere a alíquota.";
  if (form.simplesOptant && !(form.simplesRate > 0)) return "Informe a alíquota do Simples Nacional.";

  if (form.ibsCbsClassTrib && form.ibsCbsCst && !form.ibsCbsClassTrib.startsWith(form.ibsCbsCst)) {
    return "A classificação tributária precisa ser do CST escolhido.";
  }

  return "";
}

/**
 * Código tpRetPisCofins da NFS-e nacional a partir das marcações de retenção.
 * 0 nenhum · 3 todos · 4 PIS+COFINS · 5 só PIS · 6 só COFINS · 7 COFINS+CSLL · 8 só CSLL · 9 PIS+CSLL
 */
export function pisCofinsRetentionCode(pis: boolean, cofins: boolean, csll: boolean): number {
  const key = `${pis ? 1 : 0}${cofins ? 1 : 0}${csll ? 1 : 0}`;
  const map: Record<string, number> = { "000": 0, "111": 3, "110": 4, "100": 5, "010": 6, "011": 7, "001": 8, "101": 9 };
  return map[key];
}
