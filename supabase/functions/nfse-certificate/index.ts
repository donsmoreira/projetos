// Função do Supabase (Edge Function) "nfse-certificate".
// Recebe o certificado digital A1 (.pfx/.p12) da empresa e a senha, confere a
// senha, lê titular, CPF/CNPJ e validade, e guarda o arquivo e a senha
// CRIPTOGRAFADOS (AES-GCM) na tabela company_certificates. Só administradores
// da empresa podem importar ou remover. O site nunca recebe o arquivo de volta.
//
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "nfse-certificate", colar este arquivo inteiro e clicar em Deploy.
// A chave de criptografia vem do Secret NFSE_CERT_KEY, se existir; senão, é
// derivada da chave secreta do próprio Supabase (que já existe na função).

import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";

const ALLOWED_ORIGINS = [
  "https://razao-finance-arc.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

const UUID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BASE64 = 400_000; // ~300 KB de arquivo (um A1 tem poucos KB)

class Refusal extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin":
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

/** Primeira chave de uma lista do Supabase (JSON {"default": "..."} ou texto puro) */
function firstKey(name: string): string {
  const raw = Deno.env.get(name) ?? "";

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return raw;
  }
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(serviceKey: string) {
  const secret = Deno.env.get("NFSE_CERT_KEY") || serviceKey;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}|nfse-certificate|v1`));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt"]);
}

async function encrypt(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(data))}`;
}

type CertInfo = {
  subject: string;
  document: string;
  issuer: string;
  validFrom: Date;
  validUntil: Date;
};

/** Abre o A1 com a senha e lê os dados do certificado do titular. */
function readPfx(base64: string, password: string): CertInfo {
  let p12: forge.pkcs12.Pkcs12Pfx;

  try {
    const der = forge.util.decode64(base64);
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (error) {
    const message = String((error as Error)?.message ?? "");

    if (/password|mac|invalid/i.test(message)) {
      throw new Refusal("Senha do certificado incorreta.");
    }

    throw new Refusal("Arquivo inválido. Envie o certificado A1 (.pfx ou .p12).");
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])
  ];

  if (keyBags.length === 0) {
    throw new Refusal("O arquivo não tem a chave privada. Exporte o certificado A1 completo (.pfx com a chave).");
  }

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map(bag => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));

  if (certs.length === 0) {
    throw new Refusal("Não encontrei o certificado dentro do arquivo.");
  }

  // O do titular é o que não é autoridade certificadora
  const holder =
    certs.find(cert => {
      const basic = cert.getExtension("basicConstraints") as { cA?: boolean } | null;
      return !basic?.cA;
    }) ?? certs[0];

  const subject = String(holder.subject.getField("CN")?.value ?? "");
  const issuer = String(holder.issuer.getField("CN")?.value ?? "");

  // ICP-Brasil: "NOME:CNPJ" ou "NOME:CPF" no nome comum
  const afterColon = subject.includes(":") ? digits(subject.split(":").pop()) : "";
  const document = afterColon.length === 14 || afterColon.length === 11
    ? afterColon
    : (subject.match(/\d{14}/)?.[0] ?? subject.match(/\d{11}/)?.[0] ?? "");

  return {
    subject,
    document,
    issuer,
    validFrom: holder.validity.notBefore,
    validUntil: holder.validity.notAfter
  };
}

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get("Origin"));
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    if (request.method !== "POST") {
      throw new Refusal("Método não permitido.", 405);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = firstKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = firstKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      throw new Error("Chaves do Supabase não encontradas na função.");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });
    const { data: callerData, error: callerError } = await asCaller.auth.getUser();

    if (callerError || !callerData.user) {
      throw new Refusal("Faça login de novo.", 401);
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const companyId = String(body.companyId ?? "");

    if (!UUID_RULE.test(companyId)) {
      throw new Refusal("Empresa inválida.");
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Só administrador da empresa
    const { data: member } = await admin
      .from("company_members")
      .select("is_admin")
      .eq("company_id", companyId)
      .eq("user_id", callerData.user.id)
      .maybeSingle();

    if (!member?.is_admin) {
      throw new Refusal("Só administradores da empresa podem mexer no certificado digital.", 403);
    }

    const action = String(body.action ?? "");

    if (action === "remove") {
      const { error } = await admin.from("company_certificates").delete().eq("company_id", companyId);

      if (error) throw new Error(error.message);

      return reply({ ok: true });
    }

    if (action !== "upload") {
      throw new Refusal("Ação desconhecida.");
    }

    const fileName = String(body.fileName ?? "").slice(0, 200);
    const fileBase64 = String(body.fileBase64 ?? "");
    const password = String(body.password ?? "");

    if (!/\.(pfx|p12)$/i.test(fileName)) {
      throw new Refusal("Só é aceito certificado A1: arquivo .pfx ou .p12.");
    }

    if (!fileBase64 || fileBase64.length > MAX_BASE64) {
      throw new Refusal("Arquivo vazio ou grande demais para um certificado A1.");
    }

    if (!password) {
      throw new Refusal("Informe a senha do certificado.");
    }

    const info = readPfx(fileBase64, password);
    const now = Date.now();

    if (info.validUntil.getTime() < now) {
      throw new Refusal(`Este certificado venceu em ${info.validUntil.toLocaleDateString("pt-BR")}.`);
    }

    // Confere o titular com o CPF/CNPJ da empresa (CNPJ: mesma raiz, vale para filiais)
    const { data: company } = await admin.from("companies").select("document").eq("id", companyId).maybeSingle();
    const companyDoc = digits(company?.document);

    if (companyDoc && info.document) {
      const same =
        companyDoc.length === 14 && info.document.length === 14
          ? companyDoc.slice(0, 8) === info.document.slice(0, 8)
          : companyDoc === info.document;

      if (!same) {
        throw new Refusal(
          `O certificado é de outro titular (${info.document}). Envie o certificado do CPF/CNPJ da empresa (${companyDoc}).`
        );
      }
    }

    const key = await encryptionKey(serviceKey);

    const { error } = await admin.from("company_certificates").upsert({
      company_id: companyId,
      kind: "A1",
      subject_name: info.subject.slice(0, 300),
      document: info.document || null,
      issuer: info.issuer.slice(0, 300) || null,
      valid_from: info.validFrom.toISOString(),
      valid_until: info.validUntil.toISOString(),
      file_name: fileName,
      encrypted_pfx: await encrypt(key, fileBase64),
      encrypted_password: await encrypt(key, password),
      uploaded_by: callerData.user.id,
      uploaded_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);

    return reply({
      subject: info.subject,
      document: info.document,
      validUntil: info.validUntil.toISOString()
    });
  } catch (error) {
    if (error instanceof Refusal) {
      return reply({ error: error.message }, error.status);
    }

    console.error(error);
    return reply({ error: "Erro inesperado ao tratar o certificado." }, 500);
  }
});
