import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";
import { getAuthenticatedUser } from "./auth";

import type {
  CreditCard,
  CreditCardFormData
} from "../types/creditCard";

const CARD_SELECT = `
  *,
  bank_accounts (
    id,
    name,
    bank
  ),
  card_transactions (
    value,
    settled
  )
`;

type ValueRow = {
  value: number | string | null;
  settled?: boolean | null;
};

function sumValues(rows: ValueRow[] | undefined) {
  return (rows ?? []).reduce(
    (total, row) =>
      total + Number(row.value || 0),
    0
  );
}

function normalizeCreditCard(
  card: Record<string, unknown>
): CreditCard {
  const {
    card_transactions,
    bank_accounts,
    ...cardData
  } = card as Record<string, unknown> & {
    card_transactions?: ValueRow[];
    bank_accounts?: unknown;
  };

  const limitTotal =
    Number(cardData.credit_limit || 0);

  // Utilizado = parcelas ainda não pagas (de todas as faturas, inclusive as futuras)
  const usedLimit = Math.max(
    Math.round(
      sumValues((card_transactions ?? []).filter(row => !row.settled)) * 100
    ) / 100,
    0
  );

  return {
    ...cardData,

    bank_accounts:
      Array.isArray(bank_accounts)
        ? bank_accounts[0] ?? null
        : bank_accounts ?? null,

    limit_total:
      limitTotal,

    used_limit:
      usedLimit,

    available_limit:
      Math.max(
        limitTotal - usedLimit,
        0
      ),

    closing_day:
      card.closing_day === null
        ? null
        : Number(card.closing_day || 0),

    due_day:
      card.due_day === null
        ? null
        : Number(card.due_day || 0),

    active:
      Boolean(card.active)
  } as CreditCard;
}

export async function listCreditCards(): Promise<
  CreditCard[]
> {
  const { data, error } = await supabase
    .from("credit_cards")
    .select(CARD_SELECT)
    .eq("active", true)
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []).map(
    normalizeCreditCard
  );
}

export async function createCreditCard(
  card: CreditCardFormData
): Promise<CreditCard> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("credit_cards")
    .insert({
      user_id:
        user.id,

      name:
        card.name,

      bank_account_id:
        card.bankAccountId || null,

      brand:
        card.brand || null,

      final_digits:
        card.finalDigits || null,

      holder_name:
        card.holderName || null,

      credit_limit:
        Number(card.limitTotal || 0),

      closing_day:
        Number(card.closingDay || 0) || null,

      due_day:
        Number(card.dueDay || 0) || null,

      color:
        card.color || null,

      notes:
        card.notes || null,

      active:
        true
    })
    .select(CARD_SELECT)
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalizeCreditCard(data);
}

export async function updateCreditCard(
  id: string,
  card: CreditCardFormData
): Promise<CreditCard> {
  const { data, error } = await supabase
    .from("credit_cards")
    .update({
      name:
        card.name,

      bank_account_id:
        card.bankAccountId || null,

      brand:
        card.brand || null,

      final_digits:
        card.finalDigits || null,

      holder_name:
        card.holderName || null,

      credit_limit:
        Number(card.limitTotal || 0),

      closing_day:
        Number(card.closingDay || 0) || null,

      due_day:
        Number(card.dueDay || 0) || null,

      color:
        card.color || null,

      notes:
        card.notes || null,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", id)
    .select(CARD_SELECT)
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalizeCreditCard(data);
}

export async function deleteCreditCard(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("credit_cards")
    .update({
      active:
        false,

      updated_at:
        new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}