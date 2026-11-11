import { Search } from "lucide-react";

import type { CnpjLookupState } from "../../hooks/useCnpjLookup";
import { documentDigits, documentKind, isValidCnpj } from "../../utils/document";

import "./CnpjLookup.css";

type CnpjLookupHintProps = {
  document: string;
  lookup: CnpjLookupState & { search: (document: string) => Promise<void> };
  /** Texto quando o campo está vazio */
  emptyHint?: string;
  /** Texto quando é CPF */
  cpfHint?: string;
};

/** Linha abaixo do campo CPF/CNPJ: tipo reconhecido, "buscando" e botão Buscar na Receita. */
export function CnpjLookupHint({ document, lookup, emptyHint, cpfHint }: CnpjLookupHintProps) {
  const kind = documentKind(document);
  const cnpjOk = kind === "cnpj" && isValidCnpj(documentDigits(document));

  return (
    <>
      <small className="cnpj-lookup-hint">
        {kind === "cnpj" && lookup.lookingUp && "Buscando na Receita..."}
        {kind === "cnpj" && !lookup.lookingUp && cnpjOk && "CNPJ: pessoa jurídica."}
        {kind === "cnpj" && !cnpjOk && "CNPJ inválido: confira os números."}
        {kind === "cpf" && (cpfHint ?? "CPF: pessoa física.")}
        {kind === "incompleto" && "Continue digitando..."}
        {kind === "vazio" && (emptyHint ?? "Com CNPJ, os dados vêm da Receita.")}
      </small>

      {cnpjOk && !lookup.lookingUp && (
        <button
          type="button"
          className="cnpj-lookup-button"
          onClick={() => void lookup.search(document)}
        >
          <Search size={13} />
          Buscar na Receita
        </button>
      )}
    </>
  );
}

type CnpjLookupMessageProps = {
  lookup: CnpjLookupState;
  /** Mostra o aviso de regime tributário (só no cadastro da empresa) */
  showTaxRegimeHint?: boolean;
};

/** Faixa com o resultado da consulta (ou o erro). */
export function CnpjLookupMessage({ lookup, showTaxRegimeHint }: CnpjLookupMessageProps) {
  const { error, result } = lookup;

  if (error) {
    return <div className="cnpj-lookup-message is-error">{error}</div>;
  }

  if (!result) {
    return null;
  }

  const active = result.status === "ATIVA";

  return (
    <div className={`cnpj-lookup-message ${active ? "is-ok" : "is-error"}`}>
      <strong>Dados preenchidos pela Receita.</strong>{" "}
      Situação: {result.status || "não informada"}
      {result.openedOn && ` · aberta em ${result.openedOn}`}
      {result.activity && ` · ${result.activity}`}.
      {!active && " Atenção: este CNPJ não está ativo."}
      {showTaxRegimeHint && !result.taxRegime &&
        " Escolha o regime tributário (a Receita não informa se é Regime Normal ou Não contribuinte)."}
      {!result.stateRegistration &&
        " A inscrição estadual não veio na consulta: se houver, digite."}
      {" "}Confira os dados antes de salvar.
    </div>
  );
}
