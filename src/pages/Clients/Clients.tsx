import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteClient,
  listClients
} from "../../services/clientsService";

import type {
  Client
} from "../../types/client";

import SearchBar from "./components/SearchBar";
import ClientTable from "./components/ClientTable";
import ClientModal from "./components/ClientModal";

import "./Clients.css";

function Clients() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [selectedClient, setSelectedClient] =
    useState<Client | null>(null);

  async function loadClients() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await listClients();

      setClients(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os clientes.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  const filteredClients = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
      return clients;
    }

    return clients.filter(client => {
      const fields = [
        client.name,
        client.type,
        client.document,
        client.phone,
        client.email
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [clients, searchTerm]);

  function handleNewClient() {
    setSelectedClient(null);
    setIsModalOpen(true);
  }

  function handleEditClient(
    client: Client
  ) {
    setSelectedClient(client);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setSelectedClient(null);
  }

  async function handleDeleteClient(
    client: Client
  ) {
    const confirmed =
      window.confirm(
        `Deseja realmente excluir o cliente "${client.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteClient(client.id);
      await loadClients();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o cliente.";

      window.alert(message);
    }
  }

  async function handleClientSaved() {
    await loadClients();
    handleCloseModal();
  }

  return (
    <div className="clients-page">
      <section className="clients-header">
        <div>
          <h2>Clientes</h2>

          <p>
            Gerencie os clientes cadastrados no sistema.
          </p>
        </div>

        <button
          type="button"
          className="clients-new-button"
          onClick={handleNewClient}
        >
          Novo cliente
        </button>
      </section>

      <section className="clients-content">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
        />

        {loading && (
          <div className="clients-state">
            Carregando clientes...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="clients-state clients-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <ClientTable
            clients={filteredClients}
            onEdit={handleEditClient}
            onDelete={handleDeleteClient}
          />
        )}
      </section>

      <ClientModal
        open={isModalOpen}
        client={selectedClient}
        onClose={handleCloseModal}
        onSaved={handleClientSaved}
      />
    </div>
  );
}

export default Clients;