import {
  useCallback,
  useEffect,
  useState
} from "react";

import { ChevronDown, Copy, KeyRound, Trash2, UserMinus, UserPlus } from "lucide-react";

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
import {
  describeModulePermissions,
  modulePermissionsWith,
  sameModulePermissions
} from "../../types/permissions";
import PermissionMatrix from "./PermissionMatrix";
import NewUserForm from "./NewUserForm";
import MemberAccessTools from "./MemberAccessTools";

import "./Settings.css";

function samePermissions(a: CompanyPermissions, b: CompanyPermissions) {
  return a.isAdmin === b.isAdmin && sameModulePermissions(a.modules, b.modules);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function describe(permissions: CompanyPermissions) {
  return permissions.isAdmin ? "Administrador" : describeModulePermissions(permissions.modules);
}

/** Convite novo já vem com: ver tudo, cadastrar, alterar e baixar */
function defaultInvitePermissions(): CompanyPermissions {
  return {
    isAdmin: false,
    modules: modulePermissionsWith(["view", "create", "update", "settle"])
  };
}
/** Configurações → Usuários e permissões */
function UsersSettings() {
  const { user } = useAuth();
  const { active, permissions, reload, groupId } = useCompany();
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
    useState<CompanyPermissions>(defaultInvitePermissions);
  /** Usuário com a grade de permissões aberta */
  const [openUser, setOpenUser] = useState<string | null>(null);
  /** Formulário de cadastrar usuário aberto (só aparece pelo botão) */
  const [showNewUser, setShowNewUser] = useState(false);
  /** Gerador de código de convite aberto (só aparece pelo botão) */
  const [showInvite, setShowInvite] = useState(false);
  const [newCode, setNewCode] = useState("");

  const fetchAll = useCallback(async () => {
    const [memberList, inviteList] = await Promise.all([
      companyId ? listCompanyMembers(companyId) : Promise.resolve([]),
      isAdmin && companyId ? listPendingInvites(companyId) : Promise.resolve([])
    ]);

    return { memberList, inviteList };
  }, [isAdmin, companyId]);

  const apply = useCallback((data: { memberList: CompanyMember[]; inviteList: CompanyInvite[] }) => {
    setMembers(data.memberList);
    setDrafts(Object.fromEntries(
      data.memberList.map(member => [member.userId, { isAdmin: member.isAdmin, modules: member.modules }])
    ));
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
      `Acesse ${window.location.origin}, entre com o ID EMPRESA ${groupId}, seu e-mail e senha e use o código ${newCode}. O código vale 7 dias.`
    : "";

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>Usuários e permissões</h2>
          <p>
            Quem tem acesso à empresa aberta e o que cada pessoa pode fazer em cada tela.
            Clique em Permissões para abrir a grade de um usuário.
          </p>
        </div>

        {isAdmin && (
          <div className="settings-header-actions">
            {!showInvite && (
              <button
                type="button"
                className="settings-button settings-button-secondary"
                onClick={() => {
                  setInfoMessage("");
                  setShowInvite(true);
                }}
              >
                <KeyRound size={15} />
                Convidar por código
              </button>
            )}

            {!showNewUser && (
              <button
                type="button"
                className="settings-button"
                onClick={() => {
                  setInfoMessage("");
                  setShowNewUser(true);
                }}
              >
                <UserPlus size={15} />
                Cadastrar usuário
              </button>
            )}
          </div>
        )}
      </section>

      {isAdmin && showNewUser && (
        <NewUserForm
          onCancel={() => setShowNewUser(false)}
          onCreated={async message => {
            setErrorMessage("");
            setShowNewUser(false);
            apply(await fetchAll());
            setInfoMessage(message);
          }}
        />
      )}

      <section className="settings-card">
        <h3>Usuários da empresa</h3>

        {loading ? (
          <div className="settings-note">Carregando usuários...</div>
        ) : (
          <ul className="settings-member-list">
            {members.map(member => {
              const draft = drafts[member.userId] ?? member;
              const changed = !samePermissions(draft, member);
              const self = member.userId === user?.id;
              const open = openUser === member.userId;
              const canOpen = isAdmin || self;

              return (
                <li key={member.userId} className={open ? "is-open" : ""}>
                  <div className="settings-member-row">
                    <span className="settings-user-cell">
                      <strong>
                        {member.fullName || member.email}
                        {self ? " (você)" : ""}
                      </strong>
                      {member.fullName && <small>{member.email}</small>}
                      <small className="settings-member-summary">{describe(draft)}</small>
                    </span>

                    <div className="settings-row-actions">
                      {canOpen && (
                        <button
                          type="button"
                          className="settings-button settings-button-secondary settings-button-small"
                          aria-expanded={open}
                          onClick={() => setOpenUser(open ? null : member.userId)}
                        >
                          Permissões
                          <ChevronDown size={14} className="settings-chevron" />
                        </button>
                      )}

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
                          {busy === `save-${member.userId}` ? "Salvando..." : "Salvar"}
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
                  </div>

                  {open && (
                    <PermissionMatrix
                      idPrefix={`member-${member.userId}`}
                      value={draft}
                      disabled={!isAdmin || Boolean(busy)}
                      onChange={next =>
                        setDrafts(current => ({ ...current, [member.userId]: next }))
                      }
                    />
                  )}

                  {open && isAdmin && !self && (
                    <MemberAccessTools
                      member={member}
                      permissions={draft}
                      onDone={async message => {
                        apply(await fetchAll());
                        setInfoMessage(message);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isAdmin && (
          <div className="settings-note">
            Só administradores podem mudar permissões e convidar pessoas.
          </div>
        )}
      </section>


      {isAdmin && (showInvite || newCode || invites.length > 0) && (
        <section className="settings-card">
          <h3>{showInvite ? "Convidar por código" : "Convites"}</h3>

          {showInvite && (
            <>
              <p>
                Para quem já tem conta com e-mail. Escolha o que a pessoa vai poder fazer e gere um
                código. Mande o código para ela (por WhatsApp, por exemplo). Ela entra com a conta dela
                e digita o código. Vale 7 dias e uma vez só.
              </p>

              <PermissionMatrix
                idPrefix="invite"
                value={invitePermissions}
                disabled={Boolean(busy)}
                onChange={setInvitePermissions}
              />

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

                <button
                  type="button"
                  className="settings-button settings-button-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => setShowInvite(false)}
                >
                  Fechar
                </button>
              </div>
            </>
          )}

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
