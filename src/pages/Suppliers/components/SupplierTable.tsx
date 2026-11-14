import {
  Ban,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";

import type {
  Supplier
} from "../../../types/supplier";

import { formatCityState } from "../../../utils/address";

type SupplierTableProps = {
  suppliers: Supplier[];
  onEdit?: (supplier: Supplier) => void;
  onDelete?: (supplier: Supplier) => void;
  onToggleActive?: (supplier: Supplier) => void;
};

function displayValue(
  value: string | null | undefined
) {
  return value?.trim() || "—";
}

function SupplierTable({
  suppliers,
  onEdit,
  onDelete,
  onToggleActive
}: SupplierTableProps) {
  if (suppliers.length === 0) {
    return (
      <div className="suppliers-empty">
        <h3>Nenhum fornecedor encontrado</h3>

        <p>
          Cadastre um fornecedor ou altere os termos da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="suppliers-table-wrapper">
      <table className="suppliers-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>CPF/CNPJ</th>
            <th>Telefone</th>
            <th>E-mail</th>
            <th>Cidade/UF</th>

            <th className="suppliers-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {suppliers.map(supplier => (
            <tr key={supplier.id} className={supplier.active === false ? "is-inactive" : ""}>
              <td>
                <strong>{supplier.name}</strong>
                {supplier.active === false && (
                  <span className="list-badge-inactive">Inativo</span>
                )}
              </td>

              <td>
                {displayValue(supplier.document)}
              </td>

              <td>
                {displayValue(supplier.phone)}
              </td>

              <td>
                {displayValue(supplier.email)}
              </td>

              <td>
                {displayValue(formatCityState(supplier.city, supplier.state))}
              </td>

              <td className="suppliers-actions">
                <>{onEdit && (
<button
                  type="button"
                  className="suppliers-action-button"
                  onClick={() => onEdit(supplier)}
                  title={`Editar ${supplier.name}`}
                  aria-label={`Editar ${supplier.name}`}
                >
                  <Pencil size={16} />
                </button>
)}</>

                <>{onToggleActive && (
<button
                  type="button"
                  className="suppliers-action-button"
                  onClick={() => onToggleActive(supplier)}
                  title={supplier.active === false ? `Reativar ${supplier.name}` : `Inativar ${supplier.name}`}
                  aria-label={supplier.active === false ? `Reativar ${supplier.name}` : `Inativar ${supplier.name}`}
                >
                  {supplier.active === false ? <RotateCcw size={16} /> : <Ban size={16} />}
                </button>
)}</>

                <>{onDelete && (
<button
                  type="button"
                  className="suppliers-action-button suppliers-action-danger"
                  onClick={() => onDelete(supplier)}
                  title={`Excluir ${supplier.name}`}
                  aria-label={`Excluir ${supplier.name}`}
                >
                  <Trash2 size={16} />
                </button>
)}</>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SupplierTable;