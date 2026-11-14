import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

/** Dados públicos do certificado digital da empresa (o arquivo nunca volta para o site). */
export interface CertificateInfo {
  kind: "A1";
  subject_name: string;
  document: string | null;
  issuer: string | null;
  valid_from: string;
  valid_until: string;
  file_name: string | null;
  uploaded_at: string;
}

export async function getCertificateInfo(companyId: string): Promise<CertificateInfo | null> {
  const { data, error } = await supabase.rpc("company_certificate_info", { p_company_id: companyId });

  if (error) {
    // SQL ainda não rodado: sem certificado
    if (/company_certificate_info/.test(error.message)) {
      return null;
    }

    throw new Error(translateCompanyError(error.message));
  }

  const rows = (data ?? []) as CertificateInfo[];
  return rows[0] ?? null;
}

async function callCertificateFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("nfse-certificate", { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string } | null;

      if (payload?.error) {
        throw new Error(payload.error);
      }
    }

    throw new Error(
      "Não foi possível falar com a função do certificado. Confira se a função \"nfse-certificate\" foi publicada no Supabase."
    );
  }

  return data as T;
}

/** Arquivo → texto base64 (sem o prefixo data:) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };

    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Envia o A1 e a senha para o servidor, que confere e guarda criptografado. */
export async function uploadCertificate(companyId: string, file: File, password: string): Promise<void> {
  if (!/\.(pfx|p12)$/i.test(file.name)) {
    throw new Error("Só é aceito certificado A1: arquivo .pfx ou .p12.");
  }

  if (file.size > 300_000) {
    throw new Error("Arquivo grande demais para um certificado A1.");
  }

  await callCertificateFunction({
    action: "upload",
    companyId,
    fileName: file.name,
    fileBase64: await fileToBase64(file),
    password
  });
}

export async function removeCertificate(companyId: string): Promise<void> {
  await callCertificateFunction({ action: "remove", companyId });
}
