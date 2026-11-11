/** Só os números do CPF/CNPJ, no máximo 14. */
export function documentDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 14);
}

export type DocumentKind = "cpf" | "cnpj" | "incompleto" | "vazio";

/** Pelo número de dígitos: 11 = CPF, 14 = CNPJ. */
export function documentKind(value: string | null | undefined): DocumentKind {
  const digits = documentDigits(value);

  if (!digits) {
    return "vazio";
  }

  if (digits.length === 11) {
    return "cpf";
  }

  if (digits.length === 14) {
    return "cnpj";
  }

  return "incompleto";
}

/**
 * Formata enquanto digita: até 11 números como CPF (000.000.000-00),
 * a partir do 12º como CNPJ (00.000.000/0000-00).
 */
export function formatDocument(value: string | null | undefined): string {
  const d = documentDigits(value);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function allSame(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

/** Confere os dígitos verificadores do CPF. */
export function isValidCpf(value: string): boolean {
  const d = documentDigits(value);

  if (d.length !== 11 || allSame(d)) {
    return false;
  }

  const check = (length: number) => {
    let sum = 0;

    for (let i = 0; i < length; i++) {
      sum += Number(d[i]) * (length + 1 - i);
    }

    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** Confere os dígitos verificadores do CNPJ. */
export function isValidCnpj(value: string): boolean {
  const d = documentDigits(value);

  if (d.length !== 14 || allSame(d)) {
    return false;
  }

  const check = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const sum = weights.reduce((total, weight, i) => total + Number(d[i]) * weight, 0);
    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** Mensagem de erro do CPF/CNPJ ("" = tudo certo). Vazio é permitido se optional. */
export function validateDocument(value: string, optional = false): string {
  const kind = documentKind(value);

  if (kind === "vazio") {
    return optional ? "" : "Informe o CPF ou o CNPJ.";
  }

  if (kind === "incompleto") {
    return "O CPF tem 11 números e o CNPJ tem 14.";
  }

  if (kind === "cpf" && !isValidCpf(value)) {
    return "CPF inválido. Confira os números.";
  }

  if (kind === "cnpj" && !isValidCnpj(value)) {
    return "CNPJ inválido. Confira os números.";
  }

  return "";
}

/** CPF formatado (000.000.000-00), só até 11 números. */
export function formatCpf(value: string | null | undefined): string {
  return formatDocument(documentDigits(value).slice(0, 11));
}
