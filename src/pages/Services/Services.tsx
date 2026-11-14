import { useCallback, useEffect, useMemo, useState } from "react";

import { Ban, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

import { deleteService, listServices, setServiceActive } from "../../services/servicesService";
import { usePermissions } from "../../hooks/useCompany";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";

import type { Service } from "../../types/service";
import { formatCurrency } from "../../utils/currency";
import { formatNationalCode } from "../../utils/serviceFormat";

import ServiceFormModal from "./components/ServiceFormModal";

import "./Services.css";

type StatusFilter = "ativos" | "inativos" | "todos";

/** SERVIÇOS → Cadastro de serviços */
function Services() {
  const permissions = usePermissions("servicos");

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ativos");
  const [editing, setEditing] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      setServices(await listServices());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar os serviços.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return services.filter(service => {
      if (statusFilter === "ativos" && !service.active) return false;
      if (statusFilter === "inativos" && service.active) return false;

      return (
        !term ||
        `${service.code} ${service.description} ${service.national_tax_code}`.toLowerCase().includes(term)
      );
    });
  }, [services, search, statusFilter]);

  async function handleToggle(service: Service) {
    const confirmed = await appConfirm(
      service.active
        ? `Inativar o serviço "${service.description}"? Ele some da lista ao montar novas notas.`
        : `Reativar o serviço "${service.description}"?`
    );

    if (!confirmed) return;

    try {
      await setServiceActive(service.id, !service.active);
      await load();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Não foi possível alterar o serviço.");
    }
  }

  async function handleDelete(service: Service) {
    if (!(await appConfirm(`Tem certeza que deseja excluir o serviço "${service.description}"?`))) {
      return;
    }

    try {
      await deleteService(service.id);
      await load();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Não foi possível excluir o serviço.");
    }
  }

  return (
    <div className="svc-page">
      <section className="svc-header">
        <div>
          <h2>Cadastro de serviços</h2>
          <p>Serviços que a empresa presta, com os dados da nota de serviço (NFS-e).</p>
        </div>

        {permissions.canCreate && (
          <button
            type="button"
            className="svc-primary-button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} /> Cadastrar serviço
          </button>
        )}
      </section>

      <section className="svc-content">
        <div className="svc-filters">
          <label className="svc-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Pesquisar por código, descrição ou código de tributação..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <select
            className="svc-select"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as StatusFilter)}
            aria-label="Situação"
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        {loading && <div className="svc-state">Carregando serviços...</div>}
        {!loading && errorMessage && <div className="svc-state svc-state-error">{errorMessage}</div>}

        {!loading && !errorMessage && (
          visible.length === 0 ? (
            <div className="svc-state">
              {services.length === 0
                ? "Nenhum serviço cadastrado. Clique em \"Cadastrar serviço\"."
                : "Nenhum serviço encontrado com esses filtros."}
            </div>
          ) : (
            <div className="svc-table-wrapper">
              <table className="svc-table">
                <thead>
                  <tr>
                    <th>Código do serviço</th>
                    <th>Descrição do serviço</th>
                    <th className="svc-number">Valor unitário</th>
                    <th className="svc-actions-col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(service => (
                    <tr key={service.id} className={service.active ? "" : "is-inactive"}>
                      <td>
                        <strong>{service.code}</strong>
                        <small>trib. nacional {formatNationalCode(service.national_tax_code)}</small>
                      </td>
                      <td className="svc-description">
                        {service.description}
                        {!service.active && <span className="svc-badge-muted">Inativo</span>}
                      </td>
                      <td className="svc-number">{formatCurrency(service.unit_price)}</td>
                      <td className="svc-actions-col">
                        <div className="svc-actions">
                          {permissions.canUpdate && (
                            <button
                              type="button"
                              className="svc-icon-button"
                              title="Editar serviço"
                              aria-label={`Editar ${service.description}`}
                              onClick={() => {
                                setEditing(service);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                          )}

                          {permissions.canUpdate && (
                            <button
                              type="button"
                              className="svc-icon-button"
                              title={service.active ? "Inativar serviço" : "Reativar serviço"}
                              aria-label={`${service.active ? "Inativar" : "Reativar"} ${service.description}`}
                              onClick={() => void handleToggle(service)}
                            >
                              {service.active ? <Ban size={16} /> : <RotateCcw size={16} />}
                            </button>
                          )}

                          {permissions.canDelete && (
                            <button
                              type="button"
                              className="svc-icon-button svc-icon-danger"
                              title="Excluir serviço"
                              aria-label={`Excluir ${service.description}`}
                              onClick={() => void handleDelete(service)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {formOpen && (
        <ServiceFormModal
          service={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

export default Services;
