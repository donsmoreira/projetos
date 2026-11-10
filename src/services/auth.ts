import { supabase } from "./supabase";

export async function getAuthenticatedUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Usuário não autenticado.");
  }

  return user;
}
