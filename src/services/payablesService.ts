import { supabase } from "./supabase";
import type { BatchSettleData, RenegotiationData } from "../types/entryBatch";
import { translateCompanyError } from "./companyService";
import { getAuthenticatedUser } from "./auth";
import { addMonthsToDate } from "../utils/date";

import type {
  Payable,
  PayableBankAccount,
  PayableFormData,
  PayablePaymentData
} from "../types/payable";

function normalizePayable(
  payable: Record<string, unknown>
): Payable {
  return {
    ...payable,

    original_value:
      Number(payable.original_value || 0),

    interest:
      Number(payable.interest || 0),

    penalty:
      Number(payable.penalty || 0),

    paid_value:
      payable.paid_value === null
        ? null
        : Number(payable.paid_value || 0),

    installment_index:
      Number(payable.installment_index || 1),

    installment_count:
      Number(payable.installment_count || 1)
  } as Payable;
}

export async function listPayables(): Promise<Payable[]> {
  const { data, error } = await supabase
    .from("payables")
    .select(`
      *,
      suppliers (
        id,
        name
      ),
      bank_accounts (
        id,
        name,
        bank,
        account_type
      ),
      management_accounts (
        id,
        name,
        parent_id,
        type
      )
    `)
    .order("due_date", {
      ascending: true
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []).map(normalizePayable);
}

export async function createPayables(
  payable: PayableFormData
): Promise<Payable[]> {
  const user = await getAuthenticatedUser();

  const installmentCount =
    Math.max(
      Number(
        payable.isContract
          ? payable.contractMonths || 1
          : payable.installmentCount || 1
      ),
      1
    );

  const installmentGroupId =
    crypto.randomUUID();

  const records = Array.from(
    { length: installmentCount },
    (_, index) => {
      const formattedDueDate =
        addMonthsToDate(
          payable.dueDate,
          index
        );

      return {
        user_id: user.id,

        supplier_id:
          payable.supplierId,

        description:
          installmentCount > 1
            ? payable.isContract
              ? `${payable.description} (contrato ${index + 1}/${installmentCount})`
              : `${payable.description} (${index + 1}/${installmentCount})`
            : payable.description,

        contract:
          Boolean(payable.isContract),

        category:
          payable.category || null,

        management_account_id:
          payable.managementAccountId || null,

        original_value:
          Number(payable.value || 0),

        interest:
          Number(payable.interest || 0),

        penalty:
          Number(payable.penalty || 0),

        issue_date:
          payable.issueDate,

        due_date:
          formattedDueDate,

        notes:
          payable.notes || null,

        status: "pendente",

        payment_method: null,
        payment_date: null,
        paid_value: null,
        payment_notes: null,

        bank_account_id: null,
        bank_transaction_id: null,

        card_id: null,
        card_transaction_id: null,

        installment_group_id:
          installmentGroupId,

        installment_index:
          index + 1,

        installment_count:
          installmentCount
      };
    }
  );

  const { data, error } = await supabase
    .from("payables")
    .insert(records)
    .select(`
      *,
      suppliers (
        id,
        name
      ),
      bank_accounts (
        id,
        name,
        bank,
        account_type
      ),
      management_accounts (
        id,
        name,
        parent_id,
        type
      )
    `);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []).map(normalizePayable);
}

export async function updatePayable(
  id: string,
  payable: PayableFormData
): Promise<Payable> {
  const { data, error } = await supabase
    .from("payables")
    .update({
      supplier_id:
        payable.supplierId,

      description:
        payable.description,

      category:
        payable.category || null,

      management_account_id:
        payable.managementAccountId || null,

      original_value:
        Number(payable.value || 0),

      interest:
        Number(payable.interest || 0),

      penalty:
        Number(payable.penalty || 0),

      issue_date:
        payable.issueDate,

      due_date:
        payable.dueDate,

      notes:
        payable.notes || null,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "pendente")
    .select(`
      *,
      suppliers (
        id,
        name
      ),
      bank_accounts (
        id,
        name,
        bank,
        account_type
      ),
      management_accounts (
        id,
        name,
        parent_id,
        type
      )
    `)
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalizePayable(data);
}

export async function deletePayable(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("payables")
    .delete()
    .eq("id", id)
    .eq("status", "pendente");

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}

/** Campos e ligações que as telas de contas a pagar usam. */
const PAYABLE_SELECT = `
  *,
  suppliers (
    id,
    name
  ),
  bank_accounts (
    id,
    name,
    bank,
    account_type
  ),
  management_accounts (
    id,
    name,
    parent_id,
    type
  )
`;

async function getPayable(
  id: string
): Promise<Payable> {
  const { data, error } = await supabase
    .from("payables")
    .select(PAYABLE_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalizePayable(data);
}

/**
 * Pagamento numa operação só, feita no banco (função pay_payable):
 * grava a saída na conta/caixa e marca a conta como paga juntos —
 * ou nada muda, se der erro. Valor menor que o total com keepRestOpen:
 * o banco cria outra conta pendente com o restante.
 */
export async function payPayable(
  payable: Payable,
  bankAccount: PayableBankAccount,
  payment: PayablePaymentData
): Promise<Payable> {
  const { error } = await supabase.rpc("pay_payable", {
    p_payable_id: payable.id,
    p_account_id: bankAccount.id,
    p_date: payment.paymentDate,
    p_value: Math.abs(Number(payment.paidValue || 0)),
    p_notes: payment.paymentNotes || null,
    p_keep_rest_open: payment.keepRestOpen
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return getPayable(payable.id);
}

/**
 * Estorno numa operação só, feito no banco (função reverse_payable_payment):
 * apaga a saída e volta a conta para pendente juntos.
 */
export async function reversePayablePayment(
  payable: Payable
): Promise<Payable> {
  const { error } = await supabase.rpc("reverse_payable_payment", {
    p_payable_id: payable.id
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return getPayable(payable.id);
}

/**
 * Baixa em lote (função pay_payables_batch): várias contas numa operação só.
 * Valor menor que a soma só com contas do mesmo fornecedor (o banco confere).
 */
export async function payPayablesBatch(
  ids: string[],
  data: BatchSettleData
): Promise<void> {
  const { error } = await supabase.rpc("pay_payables_batch", {
    p_payable_ids: ids,
    p_account_id: data.accountId,
    p_date: data.date,
    p_value: Math.abs(Number(data.value || 0)),
    p_notes: data.notes.trim() || null,
    p_keep_rest_open: data.keepRestOpen
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}

/** Renegocia contas pendentes do mesmo fornecedor: as antigas viram "renegociada". */
export async function renegotiatePayables(
  ids: string[],
  data: RenegotiationData
): Promise<string> {
  const { data: renegotiationId, error } = await supabase.rpc("renegotiate_payables", {
    p_payable_ids: ids,
    p_installments: data.installments,
    p_first_due: data.firstDueDate,
    p_increase: Number(data.increase || 0),
    p_discount: Number(data.discount || 0),
    p_description: data.description.trim() || null,
    p_management_account_id: data.managementAccountId || null,
    p_notes: data.notes.trim() || null,
    p_category: data.category.trim() || null,
    p_down_payment: Number(data.downPayment || 0),
    p_down_account_id: data.downPayment > 0 ? data.downAccountId || null : null,
    p_down_date: data.downPayment > 0 ? data.downDate || null : null
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return String(renegotiationId);
}

/** Desfaz a renegociação: apaga as novas e reabre as antigas. */
export async function undoPayablesRenegotiation(
  renegotiationId: string
): Promise<void> {
  const { error } = await supabase.rpc("undo_payables_renegotiation", {
    p_renegotiation_id: renegotiationId
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}