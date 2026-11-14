import type { IssTaxation, ServiceTaxFields } from "./service";

export type ServiceInvoiceStatus = "rascunho" | "processando" | "autorizada" | "rejeitada" | "cancelada";

export const INVOICE_STATUS_LABELS: Record<ServiceInvoiceStatus, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada"
};

/** Nota de serviço (NFS-e). Valores calculados pelo banco de dados. */
export interface ServiceInvoice {
  id: string;
  company_id: string;

  status: ServiceInvoiceStatus;
  environment: "homologacao" | "producao";

  series: string | null;
  dps_number: number | null;
  nfse_number: string | null;
  access_key: string | null;
  verification_code: string | null;

  issue_date: string;
  competence_date: string;

  client_id: string;
  clients?: { id: string; name: string } | null;

  service_id: string | null;
  service_code: string;
  national_tax_code: string;
  municipal_tax_code: string | null;
  nbs_code: string | null;
  description: string;

  amount: number;
  unconditional_discount: number;
  deductions: number;

  iss_taxation: IssTaxation;
  iss_rate: number;
  iss_withheld: boolean;
  pis_rate: number;
  cofins_rate: number;
  csll_rate: number;
  irrf_rate: number;
  inss_rate: number;

  unit: string;
  pis_cofins_cst: string | null;
  pis_withheld: boolean;
  cofins_withheld: boolean;
  csll_withheld: boolean;
  approx_tax_federal: number;
  approx_tax_state: number;
  approx_tax_municipal: number;
  simples_optant: boolean;
  simples_rate: number;
  ibs_cbs_ind_op: string | null;
  ibs_cbs_cst: string | null;
  ibs_cbs_class_trib: string | null;

  tax_base: number;
  iss_amount: number;
  pis_amount: number;
  cofins_amount: number;
  csll_amount: number;
  irrf_amount: number;
  inss_amount: number;
  net_amount: number;

  notes: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  authorized_at: string | null;
  canceled_at: string | null;
  pdf_url: string | null;
  xml_url: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface ServiceInvoiceFormData extends ServiceTaxFields {
  issueDate: string;
  competenceDate: string;
  clientId: string;

  serviceId: string;
  serviceCode: string;
  nationalTaxCode: string;
  municipalTaxCode: string;
  nbsCode: string;
  description: string;

  amount: number;
  unconditionalDiscount: number;
  deductions: number;

  issTaxation: IssTaxation;
  issRate: number;
  issWithheld: boolean;

  notes: string;
}
