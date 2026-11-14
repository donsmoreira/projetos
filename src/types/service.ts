/** Tributação do ISSQN na NFS-e nacional (tribISSQN) */
export type IssTaxation = "tributavel" | "imunidade" | "exportacao" | "nao_incidencia";

export const ISS_TAXATION_LABELS: Record<IssTaxation, string> = {
  tributavel: "Operação tributável",
  imunidade: "Imunidade",
  exportacao: "Exportação de serviço",
  nao_incidencia: "Não incidência"
};

/** Unidades de medida mais usadas em serviços (padrão: UN) */
export const SERVICE_UNITS: [string, string][] = [
  ["UN", "Unidade"],
  ["SERV", "Serviço"],
  ["HR", "Hora"],
  ["MIN", "Minuto"],
  ["DIA", "Diária"],
  ["SEM", "Semana"],
  ["MES", "Mês"],
  ["ANO", "Ano"],
  ["VISITA", "Visita"],
  ["PROJ", "Projeto"],
  ["ETAPA", "Etapa"],
  ["VB", "Verba"],
  ["PCT", "Pacote"],
  ["KIT", "Kit"],
  ["PC", "Peça"],
  ["CX", "Caixa"],
  ["KM", "Quilômetro"],
  ["M", "Metro"],
  ["M2", "Metro quadrado"],
  ["M3", "Metro cúbico"],
  ["KG", "Quilograma"],
  ["TON", "Tonelada"],
  ["L", "Litro"],
  ["PAG", "Página"],
  ["LAUDO", "Laudo"],
  ["AULA", "Aula"],
  ["CONS", "Consulta"],
  ["SESSAO", "Sessão"],
  ["LIC", "Licença"],
  ["USU", "Usuário"]
];

/** CST do PIS/COFINS aceitos na NFS-e nacional (tribFed/piscofins/CST) */
export const PIS_COFINS_CST: [string, string][] = [
  ["00", "Nenhum"],
  ["01", "Operação tributável com alíquota básica"],
  ["02", "Operação tributável com alíquota diferenciada"],
  ["03", "Operação tributável com alíquota por unidade de medida de produto"],
  ["04", "Operação tributável monofásica - revenda a alíquota zero"],
  ["05", "Operação tributável por substituição tributária"],
  ["06", "Operação tributável a alíquota zero"],
  ["07", "Operação isenta da contribuição"],
  ["08", "Operação sem incidência da contribuição"],
  ["09", "Operação com suspensão da contribuição"],
  ["49", "Outras operações de saída"],
  ["50", "Com direito a crédito - vinculada exclusivamente a receita tributada no mercado interno"],
  ["51", "Com direito a crédito - vinculada exclusivamente a receita não tributada no mercado interno"],
  ["52", "Com direito a crédito - vinculada exclusivamente a receita de exportação"],
  ["53", "Com direito a crédito - vinculada a receitas tributadas e não tributadas no mercado interno"],
  ["54", "Com direito a crédito - vinculada a receitas tributadas no mercado interno e de exportação"],
  ["55", "Com direito a crédito - vinculada a receitas não tributadas no mercado interno e de exportação"],
  ["56", "Com direito a crédito - vinculada a receitas tributadas e não tributadas no mercado interno e de exportação"],
  ["60", "Crédito presumido - aquisição vinculada exclusivamente a receita tributada no mercado interno"],
  ["61", "Crédito presumido - aquisição vinculada exclusivamente a receita não tributada no mercado interno"],
  ["62", "Crédito presumido - aquisição vinculada exclusivamente a receita de exportação"],
  ["63", "Crédito presumido - aquisição vinculada a receitas tributadas e não tributadas no mercado interno"],
  ["64", "Crédito presumido - aquisição vinculada a receitas tributadas no mercado interno e de exportação"],
  ["65", "Crédito presumido - aquisição vinculada a receitas não tributadas no mercado interno e de exportação"],
  ["66", "Crédito presumido - aquisição vinculada a receitas tributadas e não tributadas no mercado interno e de exportação"],
  ["67", "Crédito presumido - outras operações"],
  ["70", "Operação de aquisição sem direito a crédito"],
  ["71", "Operação de aquisição com isenção"],
  ["72", "Operação de aquisição com suspensão"],
  ["73", "Operação de aquisição a alíquota zero"],
  ["74", "Operação de aquisição sem incidência da contribuição"],
  ["75", "Operação de aquisição por substituição tributária"],
  ["98", "Outras operações de entrada"],
  ["99", "Outras operações"]
];

/** Serviço cadastrado (dados para a NFS-e do padrão nacional). */
export interface Service {
  id: string;
  company_id: string;

  code: string;
  description: string;
  unit: string;
  unit_price: number;

  national_tax_code: string;
  municipal_tax_code: string | null;
  nbs_code: string | null;
  cnae: string | null;

  iss_taxation: IssTaxation;
  iss_rate: number;
  iss_withheld: boolean;

  pis_cofins_cst: string | null;
  pis_rate: number;
  cofins_rate: number;
  pis_withheld: boolean;
  cofins_withheld: boolean;
  csll_withheld: boolean;
  csll_rate: number;
  irrf_rate: number;
  /** contribuição previdenciária (INSS) retida */
  inss_rate: number;

  approx_tax_federal: number;
  approx_tax_state: number;
  approx_tax_municipal: number;

  simples_optant: boolean;
  simples_rate: number;

  ibs_cbs_ind_op: string | null;
  ibs_cbs_cst: string | null;
  ibs_cbs_class_trib: string | null;

  management_account_id: string | null;
  category: string | null;

  notes: string | null;
  active: boolean;

  created_at?: string;
  updated_at?: string;
}

/** Campos de tributação que o serviço passa para a nota */
export interface ServiceTaxFields {
  unit: string;

  pisCofinsCst: string;
  pisRate: number;
  cofinsRate: number;
  pisWithheld: boolean;
  cofinsWithheld: boolean;
  csllWithheld: boolean;
  csllRate: number;
  irrfRate: number;
  inssRate: number;

  approxTaxFederal: number;
  approxTaxState: number;
  approxTaxMunicipal: number;

  simplesOptant: boolean;
  simplesRate: number;

  ibsCbsIndOp: string;
  ibsCbsCst: string;
  ibsCbsClassTrib: string;
}

export interface ServiceFormData extends ServiceTaxFields {
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

  managementAccountId: string;
  category: string;

  notes: string;
}
