import { Fragment } from "react";

import type { CompanyPermissions } from "../../types/company";
import {
  ACTION_HINTS,
  ACTION_LABELS,
  ALL_ACTIONS,
  MODULE_GROUPS,
  setModuleAll,
  toggleModuleAction
} from "../../types/permissions";

type PermissionMatrixProps = {
  value: CompanyPermissions;
  onChange: (next: CompanyPermissions) => void;
  disabled?: boolean;
  /** Prefixo dos ids (para mais de uma grade na mesma tela) */
  idPrefix: string;
};

/**
 * Grade de permissões: grupos (Geral, Cadastros, Financeiro), divisões
 * (ex.: Lançamentos) e, em cada tela, Ver / Cadastrar / Alterar / Excluir / Baixar.
 */
function PermissionMatrix({ value, onChange, disabled, idPrefix }: PermissionMatrixProps) {
  const admin = value.isAdmin;
  const locked = disabled || admin;

  return (
    <div className="settings-matrix">
      <label className="settings-matrix-admin">
        <input
          type="checkbox"
          checked={admin}
          disabled={disabled}
          onChange={() => onChange({ ...value, isAdmin: !admin })}
        />
        <span>
          <strong>Administrador</strong>
          <small>Pode tudo em todas as telas, configura a empresa e os usuários e cria empresas.</small>
        </span>
      </label>

      <div className="settings-table-wrapper">
        <table className="settings-table settings-matrix-table">
          <thead>
            <tr>
              <th>Tela</th>
              {ALL_ACTIONS.map(action => (
                <th key={action} className="settings-check-cell" title={ACTION_HINTS[action]}>
                  {ACTION_LABELS[action]}
                </th>
              ))}
              <th className="settings-check-cell" title="Marcar ou desmarcar tudo da tela">
                Tudo
              </th>
            </tr>
          </thead>

          <tbody>
            {MODULE_GROUPS.map(group => (
              <Fragment key={group.title}>
                <tr className="settings-matrix-group">
                  <td colSpan={ALL_ACTIONS.length + 2}>{group.title}</td>
                </tr>

                {group.sections.map(section => (
                  <Fragment key={`${group.title}-${section.title ?? ""}`}>
                    {section.title && (
                      <tr className="settings-matrix-section">
                        <td colSpan={ALL_ACTIONS.length + 2}>{section.title}</td>
                      </tr>
                    )}

                    {section.modules.map(module => {
                      const own = value.modules[module.key];
                      const allOn = module.actions.every(action => admin || Boolean(own?.[action]));

                      return (
                        <tr key={module.key}>
                          <td className={section.title ? "settings-matrix-indent" : ""}>
                            {module.label}
                          </td>

                          {ALL_ACTIONS.map(action => (
                            <td key={action} className="settings-check-cell">
                              {module.actions.includes(action) ? (
                                <input
                                  type="checkbox"
                                  id={`${idPrefix}-${module.key}-${action}`}
                                  checked={admin || Boolean(own?.[action])}
                                  disabled={locked}
                                  aria-label={`${ACTION_LABELS[action]}: ${module.label}`}
                                  onChange={() =>
                                    onChange({
                                      ...value,
                                      modules: toggleModuleAction(value.modules, module, action)
                                    })
                                  }
                                />
                              ) : (
                                <span className="settings-matrix-none">–</span>
                              )}
                            </td>
                          ))}

                          <td className="settings-check-cell">
                            <input
                              type="checkbox"
                              checked={allOn}
                              disabled={locked}
                              aria-label={`Tudo: ${module.label}`}
                              onChange={() =>
                                onChange({
                                  ...value,
                                  modules: setModuleAll(value.modules, module, !allOn)
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <small className="settings-matrix-hint">
        Sem "Ver", a tela some do menu. Marcar qualquer outra opção marca "Ver" junto.
      </small>
    </div>
  );
}

export default PermissionMatrix;
