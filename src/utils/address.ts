import type {
  AddressFields,
  AddressFormData
} from "../types/address";

/** As 27 unidades da federação, em ordem alfabética de sigla. */
export const BRAZIL_STATES: { uf: string; name: string }[] = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AM", name: "Amazonas" },
  { uf: "AP", name: "Amapá" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "PR", name: "Paraná" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SE", name: "Sergipe" },
  { uf: "SP", name: "São Paulo" },
  { uf: "TO", name: "Tocantins" }
];

const VALID_UFS = new Set(BRAZIL_STATES.map(state => state.uf));

/** Só os números do CEP, no máximo 8. */
export function cepDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** "99010000" → "99010-000" (enquanto digita, formata o que já tem). */
export function formatCep(value: string | null | undefined): string {
  const digits = cepDigits(value ?? "");

  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

function clean(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
}

/** Formulário → colunas do banco (vazio vira null; UF em maiúsculas). */
export function addressToDb(address: AddressFormData): AddressFields {
  const zip = cepDigits(address.zipCode);
  const uf = address.state.trim().toUpperCase();

  return {
    zip_code: zip.length === 8 ? zip : null,
    street: clean(address.street),
    address_number: clean(address.number),
    complement: clean(address.complement),
    neighborhood: clean(address.neighborhood),
    city: clean(address.city),
    state: VALID_UFS.has(uf) ? uf : null
  };
}

/** Colunas do banco → formulário. */
export function addressFromDb(
  row: Partial<AddressFields> | null | undefined
): AddressFormData {
  return {
    zipCode: formatCep(row?.zip_code),
    street: row?.street ?? "",
    number: row?.address_number ?? "",
    complement: row?.complement ?? "",
    neighborhood: row?.neighborhood ?? "",
    city: row?.city ?? "",
    state: row?.state ?? ""
  };
}

/** Erros de preenchimento do endereço (vazio = tudo certo). */
export function validateAddress(address: AddressFormData): string {
  const zip = cepDigits(address.zipCode);

  if (zip.length > 0 && zip.length < 8) {
    return "O CEP precisa ter 8 números.";
  }

  const uf = address.state.trim();

  if (uf && !VALID_UFS.has(uf.toUpperCase())) {
    return "Escolha um estado (UF) válido.";
  }

  return "";
}

/** "Passo Fundo/RS", "Passo Fundo", "RS" ou "" */
export function formatCityState(
  city: string | null | undefined,
  state: string | null | undefined
): string {
  return [city?.trim(), state?.trim()].filter(Boolean).join("/");
}

/**
 * Chave para comparar cidades sem ligar para acento e maiúsculas:
 * "São Paulo", "sao paulo" e "SÃO PAULO" são a mesma cidade.
 */
export function cityKey(city: string | null | undefined): string {
  return (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Valor do filtro de UF para "cadastros sem estado informado". */
export const NO_STATE = "__sem_uf__";

type Located = {
  city: string | null;
  state: string | null;
};

/**
 * Filtro por estado e cidade. Vazio = todos; NO_STATE = só os sem UF.
 * A cidade é comparada sem acento e sem diferenciar maiúsculas.
 */
export function matchesLocation(
  item: Located,
  state: string,
  city: string
): boolean {
  if (state === NO_STATE) {
    if (item.state) {
      return false;
    }
  } else if (state && item.state !== state) {
    return false;
  }

  return !city || cityKey(item.city) === city;
}

export type LocationOptions = {
  states: { value: string; label: string; count: number }[];
  cities: { value: string; label: string; count: number }[];
  withoutState: number;
};

/**
 * Opções dos filtros a partir dos cadastros que existem: só aparecem
 * estados e cidades que têm alguém. As cidades seguem o estado escolhido.
 */
export function buildLocationOptions(
  items: Located[],
  selectedState: string
): LocationOptions {
  const states = new Map<string, number>();
  const cities = new Map<string, { label: string; count: number }>();
  let withoutState = 0;

  for (const item of items) {
    if (item.state) {
      states.set(item.state, (states.get(item.state) ?? 0) + 1);
    } else {
      withoutState++;
    }

    const stateMatches =
      !selectedState ||
      (selectedState === NO_STATE ? !item.state : item.state === selectedState);

    const key = cityKey(item.city);

    if (stateMatches && key) {
      const current = cities.get(key);
      cities.set(key, {
        label: current?.label ?? item.city!.trim(),
        count: (current?.count ?? 0) + 1
      });
    }
  }

  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });

  return {
    states: [...states.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort(byLabel),
    cities: [...cities.entries()]
      .map(([value, info]) => ({ value, label: info.label, count: info.count }))
      .sort(byLabel),
    withoutState
  };
}

export type CepResult = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

/**
 * Busca o endereço pelo CEP no ViaCEP (serviço gratuito com a base dos Correios).
 * Retorna null se o CEP não existir. Lança erro se o serviço não responder.
 */
export async function lookupCep(value: string): Promise<CepResult | null> {
  const digits = cepDigits(value);

  if (digits.length !== 8) {
    return null;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 400) {
        return null;
      }

      throw new Error("Serviço de CEP indisponível.");
    }

    const data = await response.json() as {
      erro?: boolean | string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };

    if (data.erro) {
      return null;
    }

    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? ""
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "O serviço de CEP demorou para responder. Preencha o endereço manualmente.",
        { cause: error }
      );
    }

    if (error instanceof Error && error.message.includes("CEP")) {
      throw error;
    }

    throw new Error(
      "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
      { cause: error }
    );
  } finally {
    window.clearTimeout(timer);
  }
}
