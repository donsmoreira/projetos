import {
  Pencil,
  Trash2
} from "lucide-react";

import type {
  Client
} from "../../../types/client";

type ClientTableProps = {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
};

function displayValue(
  value: string | null | undefined
) {
  return value?.trim() || "—";
}

function ClientTable({
  clients,
  onEdit,
  onDelete
}: ClientTableProps) {
  if (clients.length === 0) {
    return (
      <div className="clients-empty">
        <h3>Nenhum cliente encontrado</h3>

        <p>
          Cadastre um novo cliente ou altere os termos da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="clients-table-wrapper">
      <table className="clients-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>CPF/CNPJ</th>
            <th>Telefone</th>
            <th>E-mail</th>
            <th className="clients-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {clients.map(client => (
            <tr key={client.id}>
              <td>
                <strong>{client.name}</strong>
              </td>

              <td>
                {displayValue(client.type)}
              </td>

              <td>
                {displayValue(client.document)}
              </td>

              <td>
                {displayValue(client.phone)}
              </td>

              <td>
                {displayValue(client.email)}
              </td>

              <td className="clients-actions">
                <button
                  type="button"
                  className="clients-action-button"
                  onClick={() => onEdit(client)}
                  title={`Editar ${client.name}`}
                  aria-label={`Editar ${client.name}`}
                >
                  <Pencil size={16} />
                </button>

                <button
                  type="button"
                  className="clients-action-button clients-action-danger"
                  onClick={() => onDelete(client)}
                  title={`Excluir ${client.name}`}
                  aria-label={`Excluir ${client.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ClientTable;