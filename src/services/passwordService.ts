import { createClient } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { MIN_PASSWORD_LENGTH, translateAuthError } from "../utils/authErrors";

/**
 * Confere a senha atual sem mexer na sessão aberta: entra com um cliente
 * temporário (que não guarda nada no navegador) e encerra só aquela sessão.
 */
async function checkCurrentPassword(email: string, password: string): Promise<boolean> {
  const verifier = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "razao-finance-verify-password"
      }
    }
  );

  const { error } = await verifier.auth.signInWithPassword({ email, password });

  if (error) {
    const code = (error as { code?: string }).code ?? "";

    if (code === "invalid_credentials" || error.message === "Invalid login credentials") {
      return false;
    }

    throw new Error(translateAuthError(error));
  }

  // Encerra só a sessão de conferência (a do sistema continua aberta)
  await verifier.auth.signOut({ scope: "local" });

  return true;
}

/** Usuário logado troca a própria senha: confere a atual e grava a nova. */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<void> {
  if (!currentPassword) {
    throw new Error("Informe a senha atual.");
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  if (newPassword !== confirmPassword) {
    throw new Error("A confirmação não é igual à nova senha.");
  }

  if (newPassword === currentPassword) {
    throw new Error("A nova senha precisa ser diferente da senha atual.");
  }

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;

  if (!email) {
    throw new Error("Sua sessão expirou. Entre de novo no sistema.");
  }

  const ok = await checkCurrentPassword(email, currentPassword);

  if (!ok) {
    throw new Error("Senha atual incorreta.");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw new Error(translateAuthError(error));
  }
}
