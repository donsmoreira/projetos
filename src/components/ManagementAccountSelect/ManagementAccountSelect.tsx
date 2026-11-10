import {
  useEffect,
  useMemo,
  useState
} from "react";

import { Link } from "react-router-dom";

import { listManagementAccounts } from "../../services/managementAccountsService";

import type {
  ManagementAccount,
  ManagementAccountType
} from "../../types/managementAccount";

import {
  buildAccountTree,
  flattenAccountTree
} from "../../utils/accountTree";

type ManagementAccountSelectProps = {
  id: string;
  /** Contas a pagar: "despesa" · Contas a receber: "receita" */
  type: ManagementAccountType;
  value: string;
  onChange: (accountId: string, path: string) => void;
  required?: boolean;
};

const INDENT = "    ";

/**
 * Lista só as contas gerenciais do tipo certo, em árvore.
 * Contas que têm subcontas aparecem como título (não dá para escolher):
 * o lançamento vai sempre na conta mais detalhada.
 */
function ManagementAccountSelect({
  id,
  type,
  value,
  onChange,
  required
}: ManagementAccountSelectProps) {
  const [accounts, setAccounts] =
    useState<ManagementAccount[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    listManagementAccounts()
      .then(data => {
        if (active) {
          setAccounts(data.filter(account => account.type === type));
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as contas gerenciais."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [type]);

  const options = useMemo(
    () => flattenAccountTree(buildAccountTree(accounts)),
    [accounts]
  );

  const parentIds = useMemo(
    () => new Set(
      accounts
        .map(account => account.parent_id)
        .filter((parentId): parentId is string => Boolean(parentId))
    ),
    [accounts]
  );

  const typeLabel = type === "despesa" ? "despesa" : "receita";

  if (!loading && !errorMessage && options.length === 0) {
    return (
      <div className="management-account-empty">
        Nenhuma conta gerencial de {typeLabel} cadastrada.{" "}
        <Link to="/contas-gerenciais">Cadastrar contas gerenciais</Link>
      </div>
    );
  }

  return (
    <>
      <select
        id={id}
        value={value}
        onChange={event => {
          const option = options.find(
            item => item.account.id === event.target.value
          );

          onChange(event.target.value, option?.path ?? "");
        }}
        disabled={loading}
        required={required}
      >
        <option value="">
          {loading
            ? "Carregando contas..."
            : `Selecione a conta de ${typeLabel}`}
        </option>

        {options.map(option => {
          const isGroup =
            parentIds.has(option.account.id) &&
            option.account.id !== value;

          return (
            <option
              key={option.account.id}
              value={option.account.id}
              disabled={isGroup}
            >
              {`${INDENT.repeat(option.depth)}${isGroup ? "▸ " : ""}${option.account.name}`}
            </option>
          );
        })}
      </select>

      {errorMessage && (
        <small className="management-account-error">
          {errorMessage}
        </small>
      )}
    </>
  );
}

export default ManagementAccountSelect;
