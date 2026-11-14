import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteBankAccount,
  listAccountsWithBalance
} from "../../services/bankAccountsService";

import type {
  AccountWithBalance,
  BankAccount
} from "../../types/bankAccount";

import {
  formatAccountBank,
  formatAccountLabel
} from "../../utils/bank";

import SearchBar from "./components/SearchBar";
import BankAccountTable from "./components/BankAccountTable";
import BankAccountModal from "./components/BankAccountModal";

import { usePermissions } from "../../hooks/useCompany";

import "./BankAccounts.css";
import { appAlert } from "../../components/Dialog/dialog";
import { confirmDelete } from "../../services/deleteGuard";

function BankAccounts() {
  const permissions = usePermissions("contas_bancarias");

  const [accounts, setAccounts] =
    useState<AccountWithBalance[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [selectedAccount, setSelectedAccount] =
    useState<BankAccount | null>(null);

  async function loadAccounts() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await listAccountsWithBalance("banco");

      setAccounts(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as contas bancárias.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
      return accounts;
    }

    return accounts.filter(account => {
      const fields = [
        formatAccountBank(account),
        account.bank,
        account.agency,
        account.account_number
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [accounts, searchTerm]);

  function handleNewAccount() {
    setSelectedAccount(null);
    setIsModalOpen(true);
  }

  function handleEditAccount(
    account: BankAccount
  ) {
    setSelectedAccount(account);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setSelectedAccount(null);
  }

  async function handleDeleteAccount(
    account: BankAccount
  ) {
    const confirmed =
      await confirmDelete(
        "bank_accounts",
        account.id,
        `Tem certeza que deseja excluir a conta "${formatAccountLabel(account)}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteBankAccount(account.id);
      await loadAccounts();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a conta bancária.";

      await appAlert(message);
    }
  }

  async function handleAccountSaved() {
    await loadAccounts();
    handleCloseModal();
  }

  return (
    <div className="bank-accounts-page">
      <section className="bank-accounts-header">
        <div>
          <h2>Controle Bancário</h2>

          <p>
            Suas contas bancárias com o saldo atual de cada uma.
          </p>
        </div>

        {permissions.canCreate && (
<button
          type="button"
          className="bank-accounts-new-button"
          onClick={handleNewAccount}
        >
          Nova conta
        </button>
)}
      </section>

      <section className="bank-accounts-content">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
        />

        {loading && (
          <div className="bank-accounts-state">
            Carregando contas bancárias...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="bank-accounts-state bank-accounts-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <BankAccountTable
            accounts={filteredAccounts}
            onEdit={permissions.canUpdate ? handleEditAccount : undefined}
            onDelete={permissions.canDelete ? handleDeleteAccount : undefined}
          />
        )}
      </section>

      <BankAccountModal
        open={isModalOpen}
        account={selectedAccount}
        onClose={handleCloseModal}
        onSaved={handleAccountSaved}
      />
    </div>
  );
}

export default BankAccounts;