/** Tributação do ISSQN na NFS-e nacional (tribISSQN) */
export type IssTaxation = "tributavel" | "imunidade" | "exportacao" | "nao_incidencia";

export const ISS_TAXATION_LABELS: Record<IssTaxation, string> = {
  tributavel: "Operação tributável",
  imunidade: "Imunidade",
  exportacao: "Exportação de serviço",
  nao_incidencia: "Não incidência"
};

/** Serviço cadastrado (dados para a NFS-e do padrão nacional). */
export interface Service {
  id: string;
  company_id: string;

  code: string;
  description: string;
  unit_price: number;

  national_tax_code: string;
  municipal_tax_code: string | null;
  nbs_code: string | null;
  cnae: string | null;

  iss_taxation: IssTaxation;
  iss_rate: number;
  iss_withheld: boolean;

  pis_rate: number;
  cofins_rate: number;
  csll_rate: number;
  irrf_rate: number;
  inss_rate: number;

  management_account_id: string | null;
  category: string | null;

  notes: string | null;
  active: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface ServiceFormData {
  code: string;
  description: string;
  unitPrice: number;

  nationalTaxCode: string;
  municipalTaxCode: string;
  nbsCode: string;
  cnae: string;

  issTaxation: IssTaxation;
  issRate: number;
  issWithheld: boolean;

  pisRate: number;
  cofinsRate: number;
  csllRate: number;
  irrfRate: number;
  inssRate: number;

  managementAccountId: string;
  category: string;

  notes: string;
}
