import { useRef, useState } from "react";

import { lookupCnpj } from "../utils/cnpjLookup";
import type { CnpjResult } from "../utils/cnpjLookup";
import { documentDigits, isValidCnpj } from "../utils/document";

export type CnpjLookupState = {
  lookingUp: boolean;
  error: string;
  result: CnpjResult | null;
};

/**
 * Busca do CNPJ na Receita para formulários.
 * `onResult` recebe os dados e decide o que preencher.
 */
export function useCnpjLookup(onResult: (result: CnpjResult) => void) {
  const [state, setState] = useState<CnpjLookupState>({
    lookingUp: false,
    error: "",
    result: null
  });

  /** CNPJ da consulta mais recente: resposta de consulta antiga é ignorada */
  const lastLookup = useRef("");

  async function search(document: string) {
    const digits = documentDigits(document);
    lastLookup.current = digits;

    setState({ lookingUp: true, error: "", result: null });

    try {
      const result = await lookupCnpj(digits);

      if (lastLookup.current !== digits) {
        return;
      }

      if (!result) {
        setState({
          lookingUp: false,
          error: "CNPJ não encontrado na Receita. Preencha os dados manualmente.",
          result: null
        });
        return;
      }

      setState({ lookingUp: false, error: "", result });
      onResult(result);
    } catch (error) {
      if (lastLookup.current === digits) {
        setState({
          lookingUp: false,
          error: error instanceof Error ? error.message : "Não foi possível consultar a Receita.",
          result: null
        });
      }
    }
  }

  /** Chame a cada mudança do CPF/CNPJ: ao completar um CNPJ válido, busca sozinho. */
  function handleDocumentChange(document: string) {
    const digits = documentDigits(document);

    if (digits.length === 14 && isValidCnpj(digits)) {
      if (digits !== lastLookup.current) {
        void search(digits);
      }
      return;
    }

    lastLookup.current = "";
    setState({ lookingUp: false, error: "", result: null });
  }

  return { ...state, search, handleDocumentChange };
}
