import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteSupplier,
  listSuppliers,
  setSupplierActive
} from "../../services/suppliersService";

import type {
  Supplier
} from "../../types/supplier";

import { matchesLocation } from "../../utils/address";

import LocationFilter from "../../components/LocationFilter/LocationFilter";
import SearchBar from "./components/SearchBar";
import SupplierTable from "./components/SupplierTable";
import SupplierModal from "./components/SupplierModal";

import { usePermissions } from "../../hooks/useCompany";

import "./Suppliers.css";

function Suppliers() {
  const permissions = usePermissions("fornecedores");

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [stateFilter, setStateFilter] =
    useState("");

  const [cityFilter, setCityFilter] =
    useState("");

  // Ativos (padrão), inativos ou todos
  const [statusFilter, setStatusFilter] =
    useState<"ativos" | "inativos" | "todos">("ativos");

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [selectedSupplier, setSelectedSupplier] =
    useState<Supplier | null>(null);

  async function loadSuppliers() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await listSuppliers();

      setSuppliers(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os fornecedores.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    return suppliers.filter(supplier => {
      if (statusFilter === "ativos" && supplier.active === false) {
        return false;
      }

      if (statusFilter === "inativos" && supplier.active !== false) {
        return false;
      }

      if (!matchesLocation(supplier, stateFilter, cityFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const fields = [
        supplier.name,
        supplier.document,
        supplier.trade_name,
        supplier.phone,
        supplier.email,
        supplier.city,
        supplier.neighborhood,
        supplier.street
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [suppliers, searchTerm, stateFilter, cityFilter, statusFilter]);

  const hasLocationFilter = Boolean(stateFilter || cityFilter);

  function handleNewSupplier() {
    setSelectedSupplier(null);
    setIsModalOpen(true);
  }

  function handleEditSupplier(
    supplier: Supplier
  ) {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setSelectedSupplier(null);
  }

  async function handleDeleteSupplier(
    supplier: Supplier
  ) {
    const confirmed =
      window.confirm(
        `Deseja realmente excluir o fornecedor "${supplier.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteSupplier(supplier.id);
      await loadSuppliers();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o fornecedor.";

      window.alert(message);
    }
  }

  async function handleToggleSupplier(
    supplier: Supplier
  ) {
    const activating = supplier.active === false;

    const confirmed = window.confirm(
      activating
        ? `Reativar o fornecedor "${supplier.name}"?`
        : `Inativar o fornecedor "${supplier.name}"? Ele deixa de aparecer em novos lançamentos, mas o histórico continua.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await setSupplierActive(supplier.id, activating);
      await loadSuppliers();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a situação do cadastro."
      );
    }
  }

  async function handleSupplierSaved() {
    await loadSuppliers();
    handleCloseModal();
  }

  return (
    <div className="suppliers-page">
      <section className="suppliers-header">
        <div>
          <h2>Fornecedores</h2>

          <p>
            Gerencie os fornecedores cadastrados no sistema.
          </p>
        </div>

        {permissions.canCreate && (
<button
          type="button"
          className="suppliers-new-button"
          onClick={handleNewSupplier}
        >
          Novo fornecedor
        </button>
)}
      </section>

      <section className="suppliers-content">
        <div className="list-filters">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
          />

          <LocationFilter
            items={suppliers}
            state={stateFilter}
            city={cityFilter}
            onChange={(state, city) => {
              setStateFilter(state);
              setCityFilter(city);
            }}
            idPrefix="suppliers"
          />

          <div className="location-filter-field list-status-field">
          <label htmlFor="suppliers-status">Situação</label>
          <select
            id="suppliers-status"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(event.target.value as "ativos" | "inativos" | "todos")
            }
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          </div>
        </div>

        {!loading && hasLocationFilter && (
          <div className="list-filters-note">
            {filteredSuppliers.length} de {suppliers.length} fornecedores
            <button
              type="button"
              onClick={() => {
                setStateFilter("");
                setCityFilter("");
              }}
            >
              Limpar estado e cidade
            </button>
          </div>
        )}

        {loading && (
          <div className="suppliers-state">
            Carregando fornecedores...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="suppliers-state suppliers-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <SupplierTable
            suppliers={filteredSuppliers}
            onEdit={permissions.canUpdate ? handleEditSupplier : undefined}
            onDelete={permissions.canDelete ? handleDeleteSupplier : undefined}
            onToggleActive={permissions.canUpdate ? handleToggleSupplier : undefined}
          />
        )}
      </section>

      <SupplierModal
        open={isModalOpen}
        supplier={selectedSupplier}
        onClose={handleCloseModal}
        onSaved={handleSupplierSaved}
      />
    </div>
  );
}

export default Suppliers;