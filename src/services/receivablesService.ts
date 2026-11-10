import { supabase } from "./supabase";
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
    throw new Error(error.message);
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
    throw new Error(error.message);
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
    throw new Error(error.message);
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
    throw new Error(error.message);
  }
}

export async function receiveReceivable(
  receivable: Receivable,
  bankAccount: ReceivableBankAccount,
  receipt: ReceivableReceiptData
): Promise<Receivable> {
  const user = await getAuthenticatedUser();

  const receivedValue =
    Math.abs(
      Number(receipt.receivedValue || 0)
    );

  const {
    data: transaction,
    error: transactionError
  } = await supabase
    .from("bank_transactions")
    .insert({
      user_id:
        user.id,

      bank_account_id:
        bankAccount.id,

      receivable_id:
        receivable.id,

      transaction_date:
        receipt.receiptDate,

      description:
        `Recebimento: ${receivable.description}`,

      value:
        receivedValue,

      transaction_type:
        "receivable_receipt",

      reference_type:
        "receivable",

      reference_id:
        receivable.id
    })
    .select()
    .single();

  if (transactionError) {
    throw new Error(
      transactionError.message
    );
  }

  const { data, error } = await supabase
    .from("receivables")
    .update({
      status:
        "recebido",

      payment_method:
        bankAccount.account_type === "caixa"
          ? "caixa"
          : "banco",

      payment_date:
        receipt.receiptDate,

      receipt_date:
        receipt.receiptDate,

      received_value:
        receivedValue,

      payment_notes:
        receipt.receiptNotes || null,

      bank_account_id:
        bankAccount.id,

      bank_transaction_id:
        transaction.id,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", receivable.id)
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
    await supabase
      .from("bank_transactions")
      .delete()
      .eq("id", transaction.id);

    throw new Error(error.message);
  }

  return normalizeReceivable(data);
}

export async function reverseReceivableReceipt(
  receivable: Receivable
): Promise<Receivable> {
  if (receivable.bank_transaction_id) {
    const {
      error: transactionError
    } = await supabase
      .from("bank_transactions")
      .delete()
      .eq(
        "id",
        receivable.bank_transaction_id
      );

    if (transactionError) {
      throw new Error(
        transactionError.message
      );
    }
  }

  const { data, error } = await supabase
    .from("receivables")
    .update({
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

      updated_at:
        new Date().toISOString()
    })
    .eq("id", receivable.id)
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
    throw new Error(error.message);
  }

  return normalizeReceivable(data);
}