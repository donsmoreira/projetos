import { supabase } from "./supabase";
import { getAuthenticatedUser } from "./auth";

import type {
  CreditCard,
  CreditCardFormData
} from "../types/creditCard";

function normalizeCreditCard(
  card: Record<string, unknown>
): CreditCard {
  const limitTotal =
    Number(card.limit_total || 0);

  const availableLimit =
    Number(card.available_limit || 0);

  return {
    ...card,

    limit_total:
      limitTotal,

    available_limit:
      availableLimit,

    used_limit:
      Math.max(
        limitTotal - availableLimit,
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
    .select("*")
    .eq("active", true)
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(error.message);
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

      bank:
        card.bank || null,

      brand:
        card.brand || null,

      final_digits:
        card.finalDigits || null,

      holder_name:
        card.holderName || null,

      limit_total:
        Number(card.limitTotal || 0),

      available_limit:
        Number(card.availableLimit || 0),

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
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
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

      bank:
        card.bank || null,

      brand:
        card.brand || null,

      final_digits:
        card.finalDigits || null,

      holder_name:
        card.holderName || null,

      limit_total:
        Number(card.limitTotal || 0),

      available_limit:
        Number(card.availableLimit || 0),

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
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
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
    throw new Error(error.message);
  }
}