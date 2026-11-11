import { formatCep } from "./address";
import { documentDigits, isValidCnpj } from "./document";

import type { AddressFormData } from "../types/address";
import type { TaxRegime } from "../types/company";

/** Dados da empresa na Receita Federal, já no formato do formulário. */
export type CnpjResult = {
  name: string;
  tradeName: string;
  /** "" quando a Receita não diz (não é Simples nem MEI: Regime Normal ou Não contribuinte) */
  taxRegime: TaxRegime | "";
  /** Inscrição estadual ativa no estado da empresa ("" se não houver ou a consulta não trouxer) */
  stateRegistration: string;
  phone: string;
  email: string;
  address: AddressFormData;
  /** Situação cadastral: ATIVA, BAIXADA, SUSPENSA, INAPTA, NULA */
  status: string;
  /** Data de abertura em dd/mm/aaaa */
  openedOn: string;
  /** Atividade principal (CNAE) */
  activity: string;
  /** Serviço que respondeu */
  source: "CNPJ.ws" | "BrasilAPI";
};

function text(value: string | number | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/** "55" + "91177046" → "(55) 9117-7046" */
export function formatPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");

  if (digits.length < 10) {
    return digits;
  }

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = rest.length - 4;

  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Inscrição estadual: no RS fica 034/0140968; nos outros estados, só os números. */
export function formatStateRegistration(value: string, state: string): string {
  const digits = value.replace(/\D/g, "");

  if (state === "RS" && digits.length === 10) {
    return `${digits.slice(0, 3)}/${digits.slice(3)}`;
  }

  return digits || value.trim();
}

/** "2023-06-22" → "22/06/2023" */
function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** "RUA" + "PINHEIRO MACHADO" → "RUA PINHEIRO MACHADO" (sem repetir se já vier junto) */
function streetName(type: string, street: string): string {
  if (!type || street.toUpperCase().startsWith(`${type.toUpperCase()} `)) {
    return street;
  }

  return `${type} ${street}`;
}

function taxRegimeFrom(mei: boolean, simples: boolean): TaxRegime | "" {
  if (mei) {
    return "simples_mei";
  }

  return simples ? "simples" : "";
}

// ---------------------------------------------------------------------------
// CNPJ.ws (consulta pública): traz também a inscrição estadual
// ---------------------------------------------------------------------------

type CnpjWsResponse = {
  razao_social?: string;
  simples?: { simples?: string; mei?: string } | null;
  estabelecimento?: {
    nome_fantasia?: string | null;
    situacao_cadastral?: string;
    data_inicio_atividade?: string;
    atividade_principal?: { subclasse?: string; descricao?: string } | null;
    tipo_logradouro?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cep?: string | null;
    cidade?: { nome?: string } | null;
    estado?: { sigla?: string } | null;
    ddd1?: string | null;
    telefone1?: string | null;
    email?: string | null;
    inscricoes_estaduais?: {
      inscricao_estadual?: string;
      ativo?: boolean;
      estado?: { sigla?: string } | null;
    }[];
  };
};

export function cnpjResultFromCnpjWs(data: CnpjWsResponse): CnpjResult {
  const place = data.estabelecimento ?? {};
  const state = text(place.estado?.sigla).toUpperCase();
  const activity = place.atividade_principal;

  // Inscrição ativa do próprio estado; se não houver, qualquer ativa
  const registrations = (place.inscricoes_estaduais ?? []).filter(item => item.ativo);
  const registration =
    registrations.find(item => item.estado?.sigla === state) ?? registrations[0];

  return {
    name: text(data.razao_social),
    tradeName: text(place.nome_fantasia),
    taxRegime: taxRegimeFrom(data.simples?.mei === "Sim", data.simples?.simples === "Sim"),
    stateRegistration: registration?.inscricao_estadual
      ? formatStateRegistration(registration.inscricao_estadual, state)
      : "",
    phone: formatPhone(`${text(place.ddd1)}${text(place.telefone1)}`),
    email: text(place.email).toLowerCase(),
    address: {
      zipCode: formatCep(place.cep),
      street: streetName(text(place.tipo_logradouro), text(place.logradouro)),
      number: text(place.numero),
      complement: text(place.complemento),
      neighborhood: text(place.bairro),
      city: text(place.cidade?.nome),
      state
    },
    status: text(place.situacao_cadastral).toUpperCase(),
    openedOn: formatDate(place.data_inicio_atividade),
    activity: [text(activity?.subclasse), text(activity?.descricao)].filter(Boolean).join(" - "),
    source: "CNPJ.ws"
  };
}

// ---------------------------------------------------------------------------
// BrasilAPI: reserva, se o CNPJ.ws falhar (não traz inscrição estadual)
// ---------------------------------------------------------------------------

type BrasilApiResponse = {
  razao_social?: string;
  nome_fantasia?: string;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
  ddd_telefone_1?: string;
  email?: string | null;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  descricao_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
};

export function cnpjResultFromBrasilApi(data: BrasilApiResponse): CnpjResult {
  return {
    name: text(data.razao_social),
    tradeName: text(data.nome_fantasia),
    taxRegime: taxRegimeFrom(Boolean(data.opcao_pelo_mei), Boolean(data.opcao_pelo_simples)),
    stateRegistration: "",
    phone: formatPhone(data.ddd_telefone_1),
    email: text(data.email).toLowerCase(),
    address: {
      zipCode: formatCep(data.cep),
      street: streetName(text(data.descricao_tipo_de_logradouro), text(data.logradouro)),
      number: text(data.numero),
      complement: text(data.complemento),
      neighborhood: text(data.bairro),
      city: text(data.municipio),
      state: text(data.uf).toUpperCase()
    },
    status: text(data.descricao_situacao_cadastral).toUpperCase(),
    openedOn: formatDate(data.data_inicio_atividade),
    activity: [text(data.cnae_fiscal), text(data.cnae_fiscal_descricao)].filter(Boolean).join(" - "),
    source: "BrasilAPI"
  };
}

// ---------------------------------------------------------------------------

class NotFound extends Error {}
class Busy extends Error {}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 404) {
      throw new NotFound();
    }

    if (response.status === 429) {
      throw new Busy();
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Consulta o CNPJ na base pública da Receita Federal (gratuita).
 * Tenta o CNPJ.ws e, se falhar, a BrasilAPI. Devolve null se o CNPJ não existir.
 */
export async function lookupCnpj(value: string): Promise<CnpjResult | null> {
  const digits = documentDigits(value);

  if (digits.length !== 14 || !isValidCnpj(digits)) {
    return null;
  }

  let notFound = 0;
  let busy = 0;

  try {
    return cnpjResultFromCnpjWs(
      await fetchJson(`https://publica.cnpj.ws/cnpj/${digits}`) as CnpjWsResponse
    );
  } catch (error) {
    if (error instanceof NotFound) notFound += 1;
    if (error instanceof Busy) busy += 1;
  }

  try {
    return cnpjResultFromBrasilApi(
      await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`) as BrasilApiResponse
    );
  } catch (error) {
    if (error instanceof NotFound) notFound += 1;
    if (error instanceof Busy) busy += 1;
  }

  if (notFound > 0 && busy === 0) {
    return null;
  }

  if (busy > 0) {
    throw new Error(
      "Muitas consultas de CNPJ em pouco tempo. Aguarde um minuto e clique em Buscar na Receita."
    );
  }

  throw new Error(
    "Não foi possível consultar a Receita agora. Preencha os dados manualmente ou tente mais tarde."
  );
}
