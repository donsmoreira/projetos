import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

/** Conta bancária do sistema ligada a uma conta do banco pelo Open Finance. */
export interface BankConnection {
  id: string;
  bank_account_id: string;
  provider: "pluggy";
  item_id: string;
  provider_account_id: string;
  connector_name: string | null;
  account_label: string | null;
  consent_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export type ProviderAccount = {
  id: string;
  name: string;
  number: string;
  subtype: string;
  balance: number;
};

export type ItemAccounts = {
  itemId: string;
  connectorName: string;
  status: string;
  consentExpiresAt: string | null;
  accounts: ProviderAccount[];
};

export type SyncResult = {
  inserted: number;
  duplicates: number;
  bankBalance: number;
  from: string;
  to: string;
};

/**
 * Chama a função "open-finance" do Supabase (as chaves da Pluggy ficam lá,
 * nunca no site).
 */
async function callOpenFinance<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("open-finance", { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string } | null;

      if (payload?.error) {
        throw new Error(payload.error);
      }
    }

    throw new Error(
      "Não foi possível falar com o Open Finance. Confira se a função \"open-finance\" foi publicada no Supabase."
    );
  }

  return data as T;
}

export async function getConnectToken(itemId?: string): Promise<string> {
  const data = await callOpenFinance<{ accessToken: string }>({
    action: "connect_token",
    ...(itemId ? { itemId } : {})
  });

  return data.accessToken;
}

export function getItemAccounts(itemId: string): Promise<ItemAccounts> {
  return callOpenFinance<ItemAccounts>({ action: "item_accounts", itemId });
}

export function syncConnection(connectionId: string): Promise<SyncResult> {
  return callOpenFinance<SyncResult>({ action: "sync", connectionId });
}

export async function listBankConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase.from("bank_connections").select("*");

  if (error) {
    // Tabela ainda não criada (SQL não rodado): sem conexões
    if (/bank_connections/.test(error.message)) {
      return [];
    }

    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []) as BankConnection[];
}

export async function saveBankConnection(input: {
  bankAccountId: string;
  itemId: string;
  providerAccountId: string;
  connectorName: string;
  accountLabel: string;
  consentExpiresAt: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("save_bank_connection", {
    p_bank_account_id: input.bankAccountId,
    p_item_id: input.itemId,
    p_provider_account_id: input.providerAccountId,
    p_connector_name: input.connectorName,
    p_account_label: input.accountLabel,
    p_consent_expires_at: input.consentExpiresAt
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return String(data);
}

export async function deleteBankConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_bank_connection", {
    p_connection_id: connectionId
  });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}
