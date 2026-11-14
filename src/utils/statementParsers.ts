/**
 * Leitura de extratos bancários em arquivo: OFX (padrão dos bancos) e CSV.
 * Tudo acontece no navegador; só as linhas prontas vão para o banco de dados.
 */

export type ParsedStatementLine = {
  /** Identificador único da linha no banco (evita importar duas vezes) */
  externalId: string;
  /** AAAA-MM-DD */
  date: string;
  /** Positivo = entrada, negativo = saída */
  amount: number;
  description: string;
};

export type ParsedStatement = {
  source: "ofx" | "csv";
  lines: ParsedStatementLine[];
  /** Número da conta que veio no arquivo (OFX), para conferir */
  accountId: string;
  /** Saldo informado pelo banco no fim do arquivo (OFX), se houver */
  ledgerBalance: number | null;
  ledgerDate: string;
};

/** Lê o arquivo respeitando a codificação (bancos costumam usar Windows-1252). */
export async function readStatementFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 600)).toUpperCase();

  // UTF-8 com BOM ou declarado no cabeçalho
  if (
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    /CHARSET:\s*UTF-?8|ENCODING="UTF-?8"|ENCODING:\s*UTF-?8/.test(head)
  ) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  // Sem declaração: tenta UTF-8; se tiver caractere inválido, usa Windows-1252
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

/** Valor de uma tag OFX (funciona no formato antigo, sem fechamento, e no XML). */
function ofxTag(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match ? match[1].trim() : "";
}

/** "20261114120000[-3:BRT]" → "2026-11-14" */
function ofxDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/** "-1.234,56" ou "-1234.56" → -1234.56 */
export function parseMoney(value: string): number {
  let text = value.trim().replace(/[R$\s]/g, "");

  if (!text) {
    return NaN;
  }

  let negative = false;

  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }

  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma > lastDot) {
    // 1.234,56
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma >= 0) {
    // 1,234.56
    text = text.replace(/,/g, "");
  } else if (lastComma >= 0 && lastDot < 0) {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return NaN;
  }

  return Math.round((negative ? -number : number) * 100) / 100;
}

export function parseOfx(text: string): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const lines: ParsedStatementLine[] = [];
  const seen = new Map<string, number>();

  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(ofxTag(block, "DTPOSTED"));
    const amount = parseMoney(ofxTag(block, "TRNAMT"));
    const name = ofxTag(block, "NAME");
    const memo = ofxTag(block, "MEMO");
    const fitId = ofxTag(block, "FITID");
    const checkNum = ofxTag(block, "CHECKNUM");

    if (!date || !Number.isFinite(amount) || amount === 0) {
      continue;
    }

    const description =
      [name, memo && memo !== name ? memo : ""].filter(Boolean).join(" · ") ||
      ofxTag(block, "TRNTYPE") ||
      "Lançamento do extrato";

    // Sem FITID (raro): monta um com data, valor e descrição
    let key = fitId ? `ofx:${fitId}` : `ofx:${date}|${amount.toFixed(2)}|${description}|${checkNum}`;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);

    if (count > 0) {
      key = `${key}#${count + 1}`;
    }

    lines.push({ externalId: key, date, amount, description });
  }

  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text)?.[1] ?? "";
  const ledgerAmount = parseMoney(ofxTag(ledger, "BALAMT"));

  return {
    source: "ofx",
    lines,
    accountId: ofxTag(text, "ACCTID"),
    ledgerBalance: Number.isFinite(ledgerAmount) ? ledgerAmount : null,
    ledgerDate: ofxDate(ofxTag(ledger, "DTASOF"))
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Separa um CSV em linhas e colunas (aceita ; , ou tab e campos entre aspas). */
export function splitCsv(text: string): string[][] {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = [";", ",", "\t"].map(sep => ({ sep, n: sample.split(sep).length }));
  const separator = counts.sort((a, b) => b.n - a.n)[0].sep;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(cell.trim());
      cell = "";
      if (row.some(value => value !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) {
    rows.push(row);
  }

  return rows;
}

/** "14/11/2026", "14/11/26", "2026-11-14" → "2026-11-14" ("" se não entender) */
export function parseDateBR(value: string): string {
  const text = value.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(text);

  if (!match) {
    return "";
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type CsvMapping = {
  /** Índices das colunas (-1 = não usar) */
  date: number;
  description: number;
  /** Valor único com sinal (-1 se usar entrada/saída separadas) */
  amount: number;
  credit: number;
  debit: number;
  /** A primeira linha é o cabeçalho */
  hasHeader: boolean;
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Adivinha as colunas pelo cabeçalho (data, histórico, valor, crédito, débito). */
export function guessCsvMapping(rows: string[][]): CsvMapping {
  const header = (rows[0] ?? []).map(normalizeHeader);
  const find = (...words: string[]) =>
    header.findIndex(cell => words.some(word => cell.includes(word)));

  const date = find("data", "date", "dt ");
  const description = find("historico", "descricao", "lancamento", "description", "memo", "detalhe");
  const credit = find("credito", "entrada", "credit");
  const debit = find("debito", "saida", "debit");
  const amount = find("valor", "amount", "montante", "quantia");
  const hasHeader = date >= 0 || description >= 0 || amount >= 0;

  return {
    date: date >= 0 ? date : 0,
    description: description >= 0 ? description : 1,
    amount: credit >= 0 && debit >= 0 ? -1 : amount >= 0 ? amount : 2,
    credit: credit >= 0 && debit >= 0 ? credit : -1,
    debit: credit >= 0 && debit >= 0 ? debit : -1,
    hasHeader
  };
}

/** Código curto e estável para um texto (FNV-1a) */
function hashText(text: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

export type CsvParseResult = {
  lines: ParsedStatementLine[];
  /** Linhas puladas (sem data ou sem valor), com o número da linha no arquivo */
  skipped: number[];
};

export function parseCsv(rows: string[][], mapping: CsvMapping): CsvParseResult {
  const lines: ParsedStatementLine[] = [];
  const skipped: number[] = [];
  const seen = new Map<string, number>();
  const start = mapping.hasHeader ? 1 : 0;

  for (let index = start; index < rows.length; index++) {
    const row = rows[index];
    const date = parseDateBR(row[mapping.date] ?? "");
    let amount: number;

    if (mapping.amount >= 0) {
      amount = parseMoney(row[mapping.amount] ?? "");
    } else {
      const credit = parseMoney(row[mapping.credit] ?? "");
      const debit = parseMoney(row[mapping.debit] ?? "");
      amount =
        (Number.isFinite(credit) ? Math.abs(credit) : 0) -
        (Number.isFinite(debit) ? Math.abs(debit) : 0);
      amount = Math.round(amount * 100) / 100;
    }

    const description = (row[mapping.description] ?? "").trim() || "Lançamento do extrato";

    if (!date || !Number.isFinite(amount) || amount === 0) {
      skipped.push(index + 1);
      continue;
    }

    // Mesma data, valor e descrição no mesmo arquivo: numera (são lançamentos diferentes)
    const base = `${date}|${amount.toFixed(2)}|${description.toLowerCase()}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    lines.push({
      externalId: `csv:${hashText(base)}:${count}`,
      date,
      amount,
      description
    });
  }

  return { lines, skipped };
}
