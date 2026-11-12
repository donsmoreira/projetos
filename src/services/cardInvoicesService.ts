import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { CardPurchaseRow, CardSettlementRow } from "../utils/cardInvoices";

function fail(error: { message: string }): never {
  throw new Error(translateCompanyError(error.message));
}

/** Todas as parcelas de compras de um cartão. */
export async function listCardPurchases(cardId: string): Promise<CardPurchaseRow[]> {
  const { data, error } = await supabase
    .from("card_transactions")
    .select("id, transaction_date, description, value, settled, installment_group_id, installment_index, installment_count, invoice_month, purchase_total, settlement_id, management_accounts (name)")
    .eq("card_id", cardId)
    .order("transaction_date", { ascending: false });

  if (error) {
    fail(error);
  }

  return (data ?? []).map(row => {
    const account = Array.isArray(row.management_accounts) ? row.management_accounts[0] : row.management_accounts;

    return {
      id: row.id,
      transaction_date: row.transaction_date,
      description: row.description,
      value: Number(row.value || 0),
      settled: Boolean(row.settled),
      installment_group_id: row.installment_group_id,
      installment_index: Number(row.installment_index || 1),
      installment_count: Number(row.installment_count || 1),
      invoice_month: row.invoice_month,
      purchase_total: row.purchase_total === null ? null : Number(row.purchase_total),
      settlement_id: row.settlement_id,
      management_account_name: (account as { name?: string } | null)?.name ?? null
    };
  });
}

/** Pagamentos de fatura de um cartão. */
export async function listCardSettlements(cardId: string): Promise<CardSettlementRow[]> {
  const { data, error } = await supabase
    .from("card_settlements")
    .select("id, settlement_date, value, invoice_month, bank_account_id, notes")
    .eq("card_id", cardId)
    .order("settlement_date", { ascending: false });

  if (error) {
    fail(error);
  }

  return (data ?? []).map(row => ({ ...row, value: Number(row.value || 0) }));
}

/** Lança a compra: o banco divide nas parcelas e coloca cada uma na fatura certa. */
export async function createCardPurchase(data: {
  cardId: string;
  date: string;
  description: string;
  total: number;
  installments: number;
  managementAccountId: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("create_card_purchase", {
    p_card_id: data.cardId,
    p_date: data.date,
    p_description: data.description.trim(),
    p_total: data.total,
    p_installments: data.installments,
    p_management_account_id: data.managementAccountId || null
  });

  if (error) {
    fail(error);
  }
}

/** Exclui a compra inteira (todas as parcelas). */
export async function deleteCardPurchase(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_card_purchase", { p_group_id: groupId });

  if (error) {
    fail(error);
  }
}

/** Paga (baixa) o que está em aberto na fatura, pela conta ou caixa. */
export async function payCardInvoice(data: {
  cardId: string;
  invoiceMonth: string;
  accountId: string;
  date: string;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc("pay_card_invoice", {
    p_card_id: data.cardId,
    p_invoice_month: data.invoiceMonth,
    p_account_id: data.accountId,
    p_date: data.date,
    p_notes: data.notes
  });

  if (error) {
    fail(error);
  }
}

/** Estorna um pagamento de fatura (a saída da conta/caixa é desfeita). */
export async function reverseCardPayment(settlementId: string): Promise<void> {
  const { error } = await supabase.rpc("reverse_card_payment", { p_settlement_id: settlementId });

  if (error) {
    fail(error);
  }
}
