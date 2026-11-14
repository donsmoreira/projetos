import type { CodeOption } from "../components/CodeSearch/CodeSearch";
import type { NfseTables } from "../data/nfse";
import { formatNbs } from "./serviceFormat";

/** Item da LC 116 (4 dígitos) a partir do código de tributação nacional (6 dígitos) */
export function lc116Item(nationalTaxCode: string) {
  const digits = nationalTaxCode.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(0, 4) : "";
}

function itemLabel(item: string) {
  return `${item.slice(0, 2)}.${item.slice(2)}`;
}

/** NBS: as compatíveis com o item da LC 116 do serviço aparecem primeiro */
export function nbsOptions(tables: NfseTables, nationalTaxCode: string): CodeOption[] {
  const item = lc116Item(nationalTaxCode);

  return tables.nbs.map(([code, description, items]) => {
    const list = items ? items.split(",") : [];
    return {
      code,
      display: formatNbs(code),
      description,
      detail: list.length ? `Itens da LC 116: ${list.map(itemLabel).join(", ")}` : undefined,
      highlight: item ? list.includes(item) : false
    };
  });
}

/** A NBS escolhida está ligada ao item da LC 116 na tabela da Receita? */
export function nbsMatchesItem(tables: NfseTables, nbsCode: string, nationalTaxCode: string): boolean | null {
  const nbs = nbsCode.replace(/\D/g, "");
  const item = lc116Item(nationalTaxCode);
  if (!nbs || !item) return null;

  const row = tables.nbs.find(([code]) => code === nbs);
  if (!row) return false;

  return row[2].split(",").includes(item);
}

export function indOpOptions(tables: NfseTables): CodeOption[] {
  return tables.indOp.map(([code, type, feature, place]) => ({
    code,
    display: code,
    description: `${type}: ${feature}`,
    detail: `Local do fornecimento: ${place}`
  }));
}

export function cstOptions(tables: NfseTables): CodeOption[] {
  return tables.cst.map(([code, name]) => ({ code, display: code, description: name }));
}

/** Classificação tributária; com CST escolhido, mostra só as daquele CST */
export function classTribOptions(tables: NfseTables, cst: string): CodeOption[] {
  return tables.classTrib
    .filter(([, rowCst]) => !cst || rowCst === cst)
    .map(([code, rowCst, shortName, fullName]) => ({
      code,
      display: code,
      description: shortName,
      detail: `CST ${rowCst}${fullName && fullName !== shortName ? ` · ${fullName}` : ""}`
    }));
}
