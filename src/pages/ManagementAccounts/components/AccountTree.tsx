import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";

import type {
  ManagementAccount
} from "../../../types/managementAccount";

import {
  ACCOUNT_NATURE_LABELS,
  ACCOUNT_TYPE_LABELS
} from "../../../types/managementAccount";

import type {
  AccountNode
} from "../../../utils/accountTree";

import { countDescendants } from "../../../utils/accountTree";

type AccountTreeProps = {
  nodes: AccountNode[];
  collapsedIds: Set<string>;
  forceExpanded: boolean;
  onToggle: (id: string) => void;
  onAddChild: (account: ManagementAccount) => void;
  onEdit: (account: ManagementAccount) => void;
  onDelete: (account: ManagementAccount) => void;
};

function AccountTree(props: AccountTreeProps) {
  return (
    <ul
      className="account-tree"
      role="tree"
    >
      {props.nodes.map(node => (
        <AccountTreeRow
          key={node.account.id}
          node={node}
          {...props}
        />
      ))}
    </ul>
  );
}

type AccountTreeRowProps = Omit<AccountTreeProps, "nodes"> & {
  node: AccountNode;
};

function AccountTreeRow({
  node,
  collapsedIds,
  forceExpanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete
}: AccountTreeRowProps) {
  const { account, children, depth } = node;
  const hasChildren = children.length > 0;
  const expanded = forceExpanded || !collapsedIds.has(account.id);
  const total = countDescendants(node);

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        className={`account-row account-row-${account.type} ${depth === 0 ? "account-row-root" : ""}`}
        style={{
          paddingLeft: `${12 + depth * 26}px`
        }}
      >
        <button
          type="button"
          className="account-toggle"
          onClick={() => onToggle(account.id)}
          disabled={!hasChildren}
          aria-label={expanded ? "Recolher" : "Expandir"}
          title={hasChildren ? (expanded ? "Recolher" : "Expandir") : undefined}
        >
          {hasChildren && (
            expanded
              ? <ChevronDown size={16} />
              : <ChevronRight size={16} />
          )}
        </button>

        <span className="account-dot" />

        <div className="account-name">
          <strong>{account.name}</strong>

          {hasChildren && (
            <small>
              {total} {total === 1 ? "subconta" : "subcontas"}
            </small>
          )}
        </div>

        <div className="account-badges">
          <span className={`account-badge account-badge-${account.type}`}>
            {ACCOUNT_TYPE_LABELS[account.type]}
          </span>

          <span className="account-badge account-badge-nature">
            {ACCOUNT_NATURE_LABELS[account.nature]}
          </span>
        </div>

        <div className="account-actions">
          <button
            type="button"
            className="account-action-button"
            onClick={() => onAddChild(account)}
            title="Nova subconta dentro desta"
            aria-label={`Nova subconta dentro de ${account.name}`}
          >
            <Plus size={16} />
          </button>

          <button
            type="button"
            className="account-action-button"
            onClick={() => onEdit(account)}
            title="Editar"
            aria-label={`Editar ${account.name}`}
          >
            <Pencil size={15} />
          </button>

          <button
            type="button"
            className="account-action-button account-action-danger"
            onClick={() => onDelete(account)}
            title="Excluir"
            aria-label={`Excluir ${account.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <ul role="group">
          {children.map(child => (
            <AccountTreeRow
              key={child.account.id}
              node={child}
              collapsedIds={collapsedIds}
              forceExpanded={forceExpanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default AccountTree;
