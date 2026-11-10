import { supabase } from "./supabase";

import type {
  Payable,
  PayableBankAccount,
  PayableFormData,
  PayablePaymentData
} from "../types/payable";

async function getAuthenticatedUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Usuário não autenticado.");
  }

  return user;
}

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
        bank
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

  return (data ?? []).map(normalizePayable);
}

export async function createPayables(
  payable: PayableFormData
): Promise<Payable[]> {
  const user = await getAuthenticatedUser();

  const installmentCount =
    Math.max(
      Number(payable.installmentCount || 1),
      1
    );

  const installmentGroupId =
    crypto.randomUUID();

  const records = Array.from(
    { length: installmentCount },
    (_, index) => {
      const dueDate =
        new Date(`${payable.dueDate}T12:00:00`);

      dueDate.setMonth(
        dueDate.getMonth() + index
      );

      const formattedDueDate =
        dueDate
          .toISOString()
          .split("T")[0];

      return {
        user_id: user.id,

        supplier_id:
          payable.supplierId,

        description:
          installmentCount > 1
            ? `${payable.description} (${index + 1}/${installmentCount})`
            : payable.description,

        category:
          payable.category || null,

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
        bank
      )
    `);

  if (error) {
    throw new Error(error.message);
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
        bank
      )
    `)
    .single();

  if (error) {
    throw new Error(error.message);
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
    throw new Error(error.message);
  }
}

export async function payPayable(
  payable: Payable,
  bankAccount: PayableBankAccount,
  payment: PayablePaymentData
): Promise<Payable> {
  const user = await getAuthenticatedUser();

  const paidValue =
    Math.abs(
      Number(payment.paidValue || 0)
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

      payable_id:
        payable.id,

      transaction_date:
        payment.paymentDate,

      description:
        `Pagamento: ${payable.description}`,

      value:
        -paidValue,

      transaction_type:
        "payable_payment",

      reference_type:
        "payable",

      reference_id:
        payable.id
    })
    .select()
    .single();

  if (transactionError) {
    throw new Error(
      transactionError.message
    );
  }

  const { data, error } = await supabase
    .from("payables")
    .update({
      status:
        "pago",

      payment_method:
        "banco",

      payment_date:
        payment.paymentDate,

      paid_value:
        paidValue,

      payment_notes:
        payment.paymentNotes || null,

      bank_account_id:
        bankAccount.id,

      bank_transaction_id:
        transaction.id,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", payable.id)
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
        bank
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

  return normalizePayable(data);
}

export async function reversePayablePayment(
  payable: Payable
): Promise<Payable> {
  if (payable.bank_transaction_id) {
    const {
      error: transactionError
    } = await supabase
      .from("bank_transactions")
      .delete()
      .eq(
        "id",
        payable.bank_transaction_id
      );

    if (transactionError) {
      throw new Error(
        transactionError.message
      );
    }
  }

  const { data, error } = await supabase
    .from("payables")
    .update({
      status:
        "pendente",

      payment_method:
        null,

      payment_date:
        null,

      paid_value:
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
    .eq("id", payable.id)
    .select(`
      *,
      suppliers (
        id,
        name
      ),
      bank_accounts (
        id,
        name,
        bank
      )
    `)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePayable(data);
}