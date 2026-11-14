import { supabase } from "./supabase";
import type { BatchSettleData, RenegotiationData } from "../types/entryBatch";
import { translateCompanyError } from "./companyService";
import { getAuthenticatedUser } from "./auth";
import { addMonthsToDate } from "../utils/date";

import type {
  Receivable,
  ReceivableBankAccount,
  ReceivableFormData,
  ReceivableReceiptData
} from "../types/receivable";

function normalizeReceivable(
  receivable: Record<string, unknown>
): Receivable {
  return {
    ...receivable,

    original_value:
      Number(receivable.original_value || 0),

    interest:
      Number(receivable.interest || 0),

    penalty:
      Number(receivable.penalty || 0),

    received_value:
      receivable.received_value === null
        ? null
        : Number(
            receivable.received_value || 0
          ),

    installment_index:
      Number(
        receivable.installment_index || 1
      ),

    installment_count:
      Number(
        receivable.installment_count || 1
      )
  } as Receivable;
}

export async function listReceivables(): Promise<
  Receivable[]
> {
  const { data, error } = await supabase
    .from("receivables")
    .select(`
      *,
      clients (
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

  return (data ?? []).map(
    normalizeReceivable
  );
}

export async function createReceivables(
  receivable: ReceivableFormData
): Promise<Receivable[]> {
  const user = await getAuthenticatedUser();

  const installmentCount =
    Math.max(
      Number(
        receivable.installmentCount || 1
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
          receivable.dueDate,
          index
        );

      return {
        user_id: user.id,

        client_id:
          receivable.clientId,

        description:
          installmentCount > 1
            ? `${receivable.description} (${index + 1}/${installmentCount})`
            : receivable.description,

        category:
          receivable.category || null,

        management_account_id:
          receivable.managementAccountId || null,

        original_value:
          Number(receivable.value || 0),

        interest:
          Number(receivable.interest || 0),

        penalty:
          Number(receivable.penalty || 0),

        issue_date:
          receivable.issueDate,

        due_date:
          formattedDueDate,

        notes:
          receivable.notes || null,

        status:
          "pendente",

        payment_method:
          null,

        payment_date:
          null,

        receipt_date:
          null,

        received_value:
          null,

        payment_notes:
          null,

        bank_account_id:
          null,

        bank_transaction_id:
          null,

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
    .from("receivables")
    .insert(records)
    .select(`
      *,
      clients (
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

  return (data ?? []).map(
    normalizeReceivable
  );
}

export async function updateReceivable(
  id: string,
  receivable: ReceivableFormData
): Promise<Receivable> {
  const { data, error } = await supabase
    .from("receivables")
    .update({
      client_id:
        receivable.clientId,

      description:
        receivable.description,

      category:
        receivable.category || null,

      management_account_id:
        receivable.managementAccountId || null,

      original_value:
        Number(receivable.value || 0),

      interest:
        Number(receivable.interest || 0),

      penalty:
        Number(receivable.penalty || 0),

      issue_date:
        receivable.issueDate,

      due_date:
        receivable.dueDate,

      notes:
        receivable.notes || null,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "pendente")
    .select(`
      *,
      clients (
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

  return normalizeReceivable(data);
}

export async function deleteReceivable(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("receivables")
    .delete()
    .eq("id", id)
    .eq("status", "pendente");

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}

/** Campos e ligações que as telas de contas a receber usam. */
const RECEIVABLE_SELECT = `
  *,
  clients (
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

async function getReceivable(
  id: string
): Promise<Receivable> {
  const { data, error } = await supabase
    .from("receivables")
    .select(RECEIVABLE_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalizeReceivable(data);
}

/**
 * Recebimento numa operação só, feito no banco (função receive_receivable):
 * grava a entrada na conta/caixa e marca a conta como recebida juntos —
 * ou nada muda, se der erro. Valor menor que o total com keepRestOpen:
 * o banco cria outra conta pendente com o restante.
 */
export async function receiveReceivable(
  receivable: Receivable,
  bankAccount: ReceivableBankAccount,
  receipt: ReceivableReceiptData
): Promise<Receivable> {
  const { error } = await supabase.rpc("receive_receivable", {
    p_receivable_id: receivable.id,
    p_account_id: bankAccount.id,
    p_date: receipt.receiptDate,
    p_value: Math.abs(Number(receipt.receivedValue || 0)),
    p_notes: receipt.receiptNotes || null,
    p_keep_rest_open: receipt.keepRestOpen
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return getReceivable(receivable.id);
}

/**
 * Estorno numa operação só, feito no banco (função reverse_receivable_receipt):
 * apaga a entrada e volta a conta para pendente juntos. Se o dinheiro entrou
 * no caixa e já foi gasto, o banco recusa e nada muda.
 */
export async function reverseReceivableReceipt(
  receivable: Receivable
): Promise<Receivable> {
  const { error } = await supabase.rpc("reverse_receivable_receipt", {
    p_receivable_id: receivable.id
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return getReceivable(receivable.id);
}

/**
 * Baixa em lote (função receive_receivables_batch): várias contas numa operação só.
 * Valor menor que a soma só com contas do mesmo cliente (o banco confere).
 */
export async function receiveReceivablesBatch(
  ids: string[],
  data: BatchSettleData
): Promise<void> {
  const { error } = await supabase.rpc("receive_receivables_batch", {
    p_receivable_ids: ids,
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

/** Renegocia contas pendentes do mesmo cliente: as antigas viram "renegociada". */
export async function renegotiateReceivables(
  ids: string[],
  data: RenegotiationData
): Promise<string> {
  const { data: renegotiationId, error } = await supabase.rpc("renegotiate_receivables", {
    p_receivable_ids: ids,
    p_installments: data.installments,
    p_first_due: data.firstDueDate,
    p_increase: Number(data.increase || 0),
    p_discount: Number(data.discount || 0),
    p_description: data.description.trim() || null,
    p_management_account_id: data.managementAccountId || null,
    p_notes: data.notes.trim() || null,
    p_category: data.category.trim() || null
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return String(renegotiationId);
}

/** Desfaz a renegociação: apaga as novas e reabre as antigas. */
export async function undoReceivablesRenegotiation(
  renegotiationId: string
): Promise<void> {
  const { error } = await supabase.rpc("undo_receivables_renegotiation", {
    p_renegotiation_id: renegotiationId
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}