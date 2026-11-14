/** Conta marcada na lista (pagar ou receber), no formato que as janelas de lote usam. */
export interface BatchEntry {
  id: string;
  description: string;
  /** Nome do fornecedor ou cliente */
  party: string;
  partyId: string | null;
  dueDate: string;
  /** Valor + juros + multa */
  total: number;
  managementAccountId: string | null;
  category: string | null;
  /** Desempate da ordem (igual ao banco) */
  createdAt?: string;
}

/** Baixa de várias contas numa operação só. */
export interface BatchSettleData {
  accountId: string;
  date: string;
  value: number;
  notes: string;
  /** Valor menor que a soma: true = restante em aberto; false = quita com desconto */
  keepRestOpen: boolean;
}

/** Renegociação de contas do mesmo fornecedor/cliente. */
export interface RenegotiationData {
  /** 1 = à vista */
  installments: number;
  firstDueDate: string;
  increase: number;
  discount: number;
  description: string;
  /** Vazio = manter a das contas antigas (se todas usarem a mesma) */
  managementAccountId: string;
  category: string;
  notes: string;
  /** Entrada já paga/recebida na hora (0 = sem entrada); só o restante é parcelado */
  downPayment: number;
  downAccountId: string;
  downDate: string;
}
