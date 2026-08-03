import { supabaseClient } from "./config.js";

export async function getCurrentUser() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Erro ao verificar sessão:", error);
    return null;
  }

  return session?.user ?? null;
}
export async function signIn(email, password) {
  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signUp(email, password, fullName) {
  const { data, error } =
    await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendPasswordReset(email) {
  const redirectUrl =
    `${window.location.origin}${window.location.pathname}`;

  const { error } =
    await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

  if (error) {
    throw new Error(error.message);
  }
}
