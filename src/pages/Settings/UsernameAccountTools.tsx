import { useEffect, useState } from "react";

import { KeyRound } from "lucide-react";

import { useCompany } from "../../hooks/useCompany";
import {
  listUserCompanyIds,
  resetUsernamePassword,
  setUserCompanies
} from "../../services/userAdminService";

import type { CompanyMember, CompanyPermissions } from "../../types/company";

import CompanyChecklist from "./CompanyChecklist";

type UsernameAccountToolsProps = {
  member: CompanyMember;
  /** Permissões que valem nas empresas novas (as da grade deste usuário) */
  permissions: CompanyPermissions;
  onDone: (message: string) => Promise<void>;
};

/** Para usuários com nome de usuário: trocar a senha e as empresas em que operam. */
function UsernameAccountTools({ member, permissions, onDone }: UsernameAccountToolsProps) {
  const { companies } = useCompany();
  const adminCompanies = companies.filter(item => item.permissions.isAdmin);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [original, setOriginal] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    listUserCompanyIds(member.userId)
      .then(ids => {
        if (!cancelled) {
          const mine = ids.filter(id => adminCompanies.some(item => item.company.id === id));
          setOriginal(mine);
          setSelected(mine);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as empresas.");
        }
      });

    return () => {
      cancelled = true;
    };
    // Recarrega só ao trocar de usuário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.userId]);

  async function run(key: string, action: () => Promise<void>, message: string) {
    try {
      setBusy(key);
      setErrorMessage("");
      await action();
      await onDone(message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  }

  function handlePassword() {
    if (password.length < 8) {
      setErrorMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirm) {
      setErrorMessage("A confirmação não é igual à senha.");
      return;
    }

    void run("password", async () => {
      await resetUsernamePassword(member.userId, password);
      setPassword("");
      setConfirm("");
    }, "Senha trocada. Avise a pessoa da senha nova.");
  }

  function handleCompanies() {
    if (selected.length === 0) {
      setErrorMessage("Marque pelo menos uma empresa. Para tirar o acesso de vez, use Remover.");
      return;
    }

    void run("companies", async () => {
      await setUserCompanies(member.userId, selected, permissions);
      setOriginal(selected);
    }, "Empresas do usuário salvas.");
  }

  const companiesChanged =
    original !== null &&
    (original.length !== selected.length || original.some(id => !selected.includes(id)));

  return (
    <div className="settings-account-tools">
      <div className="settings-account-tool">
        <strong>Trocar senha</strong>
        <div className="settings-inline-form">
          <div className="settings-field">
            <label htmlFor={`pw-${member.userId}`}>Senha nova</label>
            <input
              id={`pw-${member.userId}`}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="settings-field">
            <label htmlFor={`pw2-${member.userId}`}>Confirmar</label>
            <input
              id={`pw2-${member.userId}`}
              type="password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button
            type="button"
            className="settings-button settings-button-secondary"
            disabled={Boolean(busy) || !password}
            onClick={handlePassword}
          >
            <KeyRound size={14} />
            {busy === "password" ? "Trocando..." : "Trocar senha"}
          </button>
        </div>
      </div>

      <div className="settings-account-tool">
        <strong>Empresas em que opera</strong>
        {original === null ? (
          <small>Carregando...</small>
        ) : (
          <>
            <CompanyChecklist
              companies={adminCompanies}
              selected={selected}
              onChange={setSelected}
              disabled={Boolean(busy)}
            />
            <small>
              Nas empresas novas, ele entra com as permissões da grade acima.
            </small>
            {companiesChanged && (
              <div>
                <button
                  type="button"
                  className="settings-button settings-button-small"
                  disabled={Boolean(busy)}
                  onClick={handleCompanies}
                >
                  {busy === "companies" ? "Salvando..." : "Salvar empresas"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
    </div>
  );
}

export default UsernameAccountTools;
