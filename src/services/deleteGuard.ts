import { supabase } from "./supabase";

import { appAlert, appConfirm } from "../components/Dialog/dialog";

/** Cadastros que o banco confere antes de excluir */
export type GuardedTable =
  | "clients"
  | "suppliers"
  | "bank_accounts"
  | "credit_cards";

/**
 * Motivo que impede a exclusão (contas em aberto, movimentação...) ou null se pode excluir.
 * Se a conferência falhar (ex.: SQL ainda não rodado), devolve null: o banco
 * continua barrando na hora de excluir.
 */
export async function getDeleteBlockReason(
  table: GuardedTable,
  id: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("delete_block_reason", {
    p_table: table,
    p_id: id
  });

  if (error) {
    return null;
  }

  return typeof data === "string" && data.trim() ? data : null;
}

/**
 * Antes de excluir: se houver impedimento, só avisa (sem perguntar).
 * Se puder excluir, pergunta "Tem certeza?" com Sim / Não.
 * Devolve true quando a pessoa confirmou.
 */
export async function confirmDelete(
  table: GuardedTable,
  id: string,
  question: string
): Promise<boolean> {
  const reason = await getDeleteBlockReason(table, id);

  if (reason) {
    await appAlert(reason, {
      title: "Exclusão não permitida",
      confirmLabel: "Entendi",
      tone: "danger"
    });
    return false;
  }

  return appConfirm(question, {
    title: "Excluir",
    confirmLabel: "Sim",
    cancelLabel: "Não",
    tone: "danger"
  });
}
