import {
  useCallback,
  useEffect,
  useState
} from "react";

import { Copy, KeyRound, Trash2, UserMinus } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../hooks/useCompany";
import {
  createInvite,
  listCompanyMembers,
  listPendingInvites,
  removeMember,
  revokeInvite,
  updateMemberPermissions
} from "../../services/companyService";

import type {
  CompanyInvite,
  CompanyMember,
  CompanyPermissions
} from "../../types/company";
import { NO_PERMISSIONS } from "../../types/company";

import "./Settings.css";

const PERMISSION_COLUMNS: { key: keyof CompanyPermissions; label: string; hint: string }[] = [
  { key: "isAdmin", label: "Administrador", hint: "Pode tudo, configura a empresa e os usuários" },
  { key: "canCreate", label: "Cadastrar", hint: "Incluir clientes, contas, lançamentos..." },
  { key: "canUpdate", label: "Alterar", hint: "Editar o que já existe" },
  { key: "canDelete", label: "Excluir", hint: "Apagar cadastros e lançamentos" },
  { key: "canSettle", label: "Baixar", hint: "Pagar, receber e estornar" }
];

function samePermissions(a: CompanyPermissions, b: CompanyPermissions) {
  return PERMISSION_COLUMNS.every(column => a[column.key] === b[column.key]);
}

/** Administrador marca tudo; as outras só valem sem administrador. */
function togglePermission(
  current: CompanyPermissions,
  key: keyof CompanyPermissions
): CompanyPermissions {
  const next = { ...current, [key]: !current[key] };

  if (key === "isAdmin" && next.isAdmin) {
    return { isAdmin: true, canCreate: true, canUpdate: true, canDelete: true, canSettle: true };
  }

  return next;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function describe(permissions: CompanyPermissions) {
  if (permissions.isAdmin) {
    return "Administrador";
  }

  const list = PERMISSION_COLUMNS
    .filter(column => column.key !== "isAdmin" && permissions[column.key])
    .map(column => column.label.toLowerCase());

  return list.length ? list.join(", ") : "só visualizar";
}

/** Configurações → Usuários e permissões */
function UsersSettings() {
  const { user } = useAuth();
  const { active, permissions, reload } = useCompany();
  const isAdmin = permissions.isAdmin;
  const companyId = active?.company.id ?? "";

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CompanyPermissions>>({});
  const [invites, setInvites] = useState<CompanyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const [invitePermissions, setInvitePermissions] =
    useState<CompanyPermissions>({ ...NO_PERMISSIONS, canCreate: true, canUpdate: true, canSettle: true });
  const [newCode, setNewCode] = useState("");

  const fetchAll = useCallback(async () => {
    const [memberList, inviteList] = await Promise.all([
      listCompanyMembers(),
      isAdmin && companyId ? listPendingInvites(companyId) : Promise.resolve([])
    ]);

    return { memberList, inviteList };
  }, [isAdmin, companyId]);

  const apply = useCallback((data: { memberList: CompanyMember[]; inviteList: CompanyInvite[] }) => {
    setMembers(data.memberList);
    setDrafts(Object.fromEntries(data.memberList.map(member => [member.userId, { ...member }])));
    setInvites(data.inviteList);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchAll()
      .then(data => {
        if (!cancelled) {
          apply(data);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os usuários.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  async function act(key: string, action: () => Promise<void>, success = "") {
    try {
      setBusy(key);
      setErrorMessage("");
      setInfoMessage("");
      await action();
      apply(await fetchAll());
      await reload();

      if (success) {
        setInfoMessage(success);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  }

  function handleRemove(member: CompanyMember) {
    const self = member.userId === user?.id;
    const question = self
      ? "Deseja sair desta empresa? Você perde o acesso aos dados dela."
      : `Remover ${member.fullName || member.email} desta empresa?`;

    if (!window.confirm(question)) {
      return;
    }

    void act(`remove-${member.userId}`, async () => {
      await removeMember(member.userId);

      if (self) {
        window.location.assign("/");
      }
    }, "Usuário removido.");
  }

  async function handleCreateInvite() {
    await act("invite", async () => {
      const code = await createInvite(invitePermissions);
      setNewCode(code);
    });
  }

  const inviteMessage = newCode
    ? `Você foi convidado para a empresa "${active?.company.trade_name || active?.company.name}" no Razão Finance ARC. ` +
      `Acesse ${window.location.origin}, entre com sua conta e use o código ${newCode}. O código vale 7 dias.`
    : "";

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>Usuários e permissões</h2>
          <p>
            Quem tem acesso à empresa aberta e o que cada pessoa pode fazer. Todos podem visualizar.
          </p>
        </div>
      </section>

      <section className="settings-card">
        <h3>Usuários da empresa</h3>

        {loading ? (
          <div className="settings-note">Carregando usuários...</div>
        ) : (
          <div className="settings-table-wrapper">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  {PERMISSION_COLUMNS.map(column => (
                    <th key={column.key} className="settings-check-cell" title={column.hint}>
                      {column.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>

              <tbody>
                {members.map(member => {
                  const draft = drafts[member.userId] ?? member;
                  const changed = !samePermissions(draft, member);
                  const self = member.userId === user?.id;

                  return (
                    <tr key={member.userId}>
                      <td>
                        <span className="settings-user-cell">
                          <strong>
                            {member.fullName || member.email}
                            {self ? " (você)" : ""}
                          </strong>
                          {member.fullName && <small>{member.email}</small>}
                        </span>
                      </td>

                      {PERMISSION_COLUMNS.map(column => (
                        <td key={column.key} className="settings-check-cell">
                          <input
                            type="checkbox"
                            checked={draft[column.key]}
                            disabled={!isAdmin || Boolean(busy) || (column.key !== "isAdmin" && draft.isAdmin)}
                            aria-label={`${column.label}: ${member.fullName || member.email}`}
                            onChange={() =>
                              setDrafts(current => ({
                                ...current,
                                [member.userId]: togglePermission(draft, column.key)
                              }))
                            }
                          />
                        </td>
                      ))}

                      <td>
                        <div className="settings-row-actions">
                          {isAdmin && changed && (
                            <button
                              type="button"
                              className="settings-button settings-button-small"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                void act(
                                  `save-${member.userId}`,
                                  () => updateMemberPermissions(member.userId, draft),
                                  "Permissões salvas."
                                )
                              }
                            >
                              Salvar
                            </button>
                          )}

                          {(isAdmin || self) && (
                            <button
                              type="button"
                              className="settings-button settings-button-danger settings-button-small"
                              disabled={Boolean(busy)}
                              onClick={() => handleRemove(member)}
                              title={self ? "Sair da empresa" : "Remover da empresa"}
                            >
                              <UserMinus size={14} />
                              {self ? "Sair" : "Remover"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isAdmin && (
          <div className="settings-note">
            Só administradores podem mudar permissões e convidar pessoas.
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="settings-card">
          <h3>Convidar usuário</h3>
          <p>
            Escolha o que a pessoa vai poder fazer e gere um código. Mande o código para ela (por
            WhatsApp, por exemplo). Ela entra com a conta dela e digita o código. Vale 7 dias e uma vez só.
          </p>

          <div className="settings-permissions">
            {PERMISSION_COLUMNS.map(column => (
              <label key={column.key} title={column.hint}>
                <input
                  type="checkbox"
                  checked={invitePermissions[column.key]}
                  disabled={column.key !== "isAdmin" && invitePermissions.isAdmin}
                  onChange={() => setInvitePermissions(current => togglePermission(current, column.key))}
                />
                {column.label}
              </label>
            ))}
          </div>

          <div className="settings-actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="settings-button"
              disabled={Boolean(busy)}
              onClick={() => void handleCreateInvite()}
            >
              <KeyRound size={15} />
              {busy === "invite" ? "Gerando..." : "Gerar código de convite"}
            </button>
          </div>

          {newCode && (
            <div className="settings-code">
              <strong>{newCode}</strong>

              <button
                type="button"
                className="settings-button settings-button-secondary settings-button-small"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteMessage);
                  setInfoMessage("Mensagem do convite copiada. É só colar no WhatsApp.");
                }}
              >
                <Copy size={14} />
                Copiar mensagem
              </button>

              <p>{inviteMessage}</p>
            </div>
          )}

          {invites.length > 0 && (
            <div className="settings-table-wrapper">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Permissões</th>
                    <th>Vale até</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invites.map(invite => {
                    const expired = new Date(invite.expiresAt) < new Date();

                    return (
                      <tr key={invite.id}>
                        <td><strong>{invite.code}</strong></td>
                        <td>{describe(invite)}</td>
                        <td>{expired ? "Vencido" : formatDate(invite.expiresAt)}</td>
                        <td>
                          <div className="settings-row-actions">
                            <button
                              type="button"
                              className="settings-button settings-button-danger settings-button-small"
                              disabled={Boolean(busy)}
                              onClick={() => void act(`revoke-${invite.id}`, () => revokeInvite(invite.id), "Convite cancelado.")}
                            >
                              <Trash2 size={14} />
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
      {infoMessage && <div className="settings-message settings-message-ok">{infoMessage}</div>}
    </div>
  );
}

export default UsersSettings;
