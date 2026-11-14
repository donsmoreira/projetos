import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Ban,
  Download,
  FileCode2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2
} from "lucide-react";

import { listClients } from "../../services/clientsService";
import { deleteServiceInvoice, listServiceInvoices } from "../../services/serviceInvoicesService";
import { useCompany, usePermissions } from "../../hooks/useCompany";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";

import type { Client } from "../../types/client";
import type { ServiceInvoice, ServiceInvoiceStatus } from "../../types/serviceInvoice";
import { INVOICE_STATUS_LABELS } from "../../types/serviceInvoice";

import { formatCurrency } from "../../utils/currency";
import { addMonthsClamped, formatDateBR, todayISO } from "../../utils/entryBatch";
import { providerMissing, takerMissing } from "../../utils/nfseCalc";

import InvoiceFormModal from "./components/InvoiceFormModal";

import "../Services/Services.css";

type StatusFilter = ServiceInvoiceStatus | "todos";

/** SERVIÇOS → Nota de serviço */
function ServiceInvoices() {
  const { active } = useCompany();
  const company = active?.company ?? null;
  const permissions = usePermissions("notas_servico");

  const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [from, setFrom] = useState(() => addMonthsClamped(todayISO(), -3));
  const [to, setTo] = useState(todayISO);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceInvoice | null>(null);
  const [menuFor, setMenuFor] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      const [invoiceData, clientData] = await Promise.all([listServiceInvoices(from, to), listClients()]);
      setInvoices(invoiceData);
      setClients(clientData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as notas.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Fecha o "mais opções" ao clicar fora
  useEffect(() => {
    if (!menuFor) return;

    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuFor("");
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuFor]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return invoices.filter(invoice => {
      if (statusFilter !== "todos" && invoice.status !== statusFilter) return false;

      return (
        !term ||
        `${invoice.clients?.name ?? ""} ${invoice.description} ${invoice.nfse_number ?? ""} ${invoice.dps_number ?? ""}`
          .toLowerCase()
          .includes(term)
      );
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => {
    const valid = visible.filter(invoice => invoice.status !== "cancelada");
    const sum = (key: "amount" | "net_amount") =>
      valid.reduce((acc, invoice) => acc + Math.round(invoice[key] * 100), 0) / 100;

    return { count: valid.length, amount: sum("amount"), net: sum("net_amount") };
  }, [visible]);

  async function handleEmit(invoice: ServiceInvoice) {
    const client = clients.find(item => item.id === invoice.client_id) ?? null;
    const problems = [
      ...providerMissing(company).map(item => `Empresa: ${item}`),
      ...takerMissing(client)
        .filter(item => !item.startsWith("e-mail"))
        .map(item => `Cliente: ${item}`)
    ];

    if (problems.length > 0) {
      await appAlert(`Antes de emitir, complete:\n• ${problems.join("\n• ")}`, { title: "Faltam dados para emitir" });
      return;
    }

    await appAlert(
      "A nota está com os dados completos. O envio para a prefeitura (Sefin Nacional) será ligado quando escolhermos o emissor de NFS-e (a API). Por enquanto ela fica como rascunho.",
      { title: "Emissão ainda não ligada", tone: "info" }
    );
  }

  async function handleCancel() {
    await appAlert(
      "O cancelamento da NFS-e será ligado junto com a emissão, quando escolhermos o emissor (a API).",
      { title: "Cancelamento ainda não ligado", tone: "info" }
    );
  }

  async function handleDelete(invoice: ServiceInvoice) {
    setMenuFor("");

    if (!(await appConfirm(`Tem certeza que deseja excluir o rascunho da nota de ${invoice.clients?.name ?? "cliente"}?`))) {
      return;
    }

    try {
      await deleteServiceInvoice(invoice.id);
      await load();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  function openFile(url: string | null) {
    setMenuFor("");

    if (url) {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div className="svc-page">
      <section className="svc-header">
        <div>
          <h2>Nota de serviço</h2>
          <p>
            NFS-e padrão nacional · ambiente{" "}
            <strong>{company?.nfse_environment === "producao" ? "Produção" : "Homologação (testes)"}</strong>
          </p>
        </div>

        {permissions.canCreate && company && (
          <div className="svc-header-actions">
            <button
              type="button"
              className="svc-primary-button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={17} /> Montar NFS-e
            </button>
          </div>
        )}
      </section>

      <section className="svc-content">
        <div className="svc-filters">
          <label className="svc-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Pesquisar por cliente, descrição ou número..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <input className="svc-select" type="date" value={from} onChange={event => setFrom(event.target.value)} aria-label="De" />
          <input className="svc-select" type="date" value={to} onChange={event => setTo(event.target.value)} aria-label="Até" />

          <select
            className="svc-select"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as StatusFilter)}
            aria-label="Status"
          >
            <option value="todos">Todos os status</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as ServiceInvoiceStatus[]).map(status => (
              <option key={status} value={status}>{INVOICE_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>

        {loading && <div className="svc-state">Carregando notas...</div>}
        {!loading && errorMessage && <div className="svc-state svc-state-error">{errorMessage}</div>}

        {!loading && !errorMessage && (
          visible.length === 0 ? (
            <div className="svc-state">
              {invoices.length === 0
                ? "Nenhuma nota neste período. Clique em \"Montar NFS-e\"."
                : "Nenhuma nota com esses filtros."}
            </div>
          ) : (
            <>
              <div className="svc-table-wrapper">
                <table className="svc-table">
                  <thead>
                    <tr>
                      <th>Data de emissão</th>
                      <th>Cliente</th>
                      <th className="svc-number">Valor</th>
                      <th>Status da nota</th>
                      <th className="svc-actions-col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(invoice => {
                      const isDraft = invoice.status === "rascunho" || invoice.status === "rejeitada";
                      const isAuthorized = invoice.status === "autorizada";

                      return (
                        <tr key={invoice.id}>
                          <td>
                            {formatDateBR(invoice.issue_date)}
                            <small>{invoice.nfse_number ? `NFS-e nº ${invoice.nfse_number}` : invoice.description}</small>
                          </td>
                          <td>{invoice.clients?.name ?? "—"}</td>
                          <td className="svc-number">
                            {formatCurrency(invoice.amount)}
                            {invoice.net_amount !== invoice.amount && <small>líquido {formatCurrency(invoice.net_amount)}</small>}
                          </td>
                          <td>
                            <span className={`svc-status svc-status-${invoice.status}`}>{INVOICE_STATUS_LABELS[invoice.status]}</span>
                          </td>
                          <td className="svc-actions-col">
                            <div className="svc-actions">
                              {permissions.canUpdate && (
                                <button
                                  type="button"
                                  className="svc-icon-button"
                                  title={invoice.status === "rascunho" ? "Editar nota" : "Só rascunho pode ser editado"}
                                  aria-label="Editar nota"
                                  disabled={invoice.status !== "rascunho"}
                                  onClick={() => {
                                    setEditing(invoice);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil size={16} />
                                </button>
                              )}

                              {permissions.canSettle && (isAuthorized ? (
                                <button type="button" className="svc-text-button is-danger" onClick={() => void handleCancel()}>
                                  <Ban size={14} /> Cancelar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="svc-text-button is-primary"
                                  disabled={!isDraft}
                                  onClick={() => void handleEmit(invoice)}
                                >
                                  <Send size={14} /> Emitir
                                </button>
                              ))}

                              <div className="svc-more" ref={menuFor === invoice.id ? menuRef : undefined}>
                                <button
                                  type="button"
                                  className="svc-icon-button"
                                  title="Mais opções"
                                  aria-label="Mais opções"
                                  aria-expanded={menuFor === invoice.id}
                                  onClick={() => setMenuFor(current => (current === invoice.id ? "" : invoice.id))}
                                >
                                  <MoreHorizontal size={16} />
                                </button>

                                {menuFor === invoice.id && (
                                  <div className="svc-more-menu" role="menu">
                                    <button type="button" role="menuitem" disabled={!invoice.pdf_url} onClick={() => openFile(invoice.pdf_url)}>
                                      <Printer size={15} /> Imprimir NFS-e
                                    </button>
                                    <button type="button" role="menuitem" disabled={!invoice.pdf_url} onClick={() => openFile(invoice.pdf_url)}>
                                      <Download size={15} /> Baixar PDF
                                    </button>
                                    <button type="button" role="menuitem" disabled={!invoice.xml_url} onClick={() => openFile(invoice.xml_url)}>
                                      <FileCode2 size={15} /> Baixar XML
                                    </button>
                                    <button type="button" role="menuitem" disabled={!isAuthorized}>
                                      <Mail size={15} /> Enviar e-mail
                                    </button>

                                    {!isAuthorized && (
                                      <small>Imprimir, PDF, XML e e-mail ficam disponíveis depois que a nota for emitida.</small>
                                    )}

                                    {invoice.status === "rascunho" && permissions.canDelete && (
                                      <button type="button" role="menuitem" onClick={() => void handleDelete(invoice)}>
                                        <Trash2 size={15} /> Excluir rascunho
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <small className="svc-totals-line">
                {totals.count} nota(s) (sem as canceladas) · valor {formatCurrency(totals.amount)} · líquido {formatCurrency(totals.net)}
              </small>
            </>
          )
        )}
      </section>

      {formOpen && company && (
        <InvoiceFormModal
          company={company}
          invoice={editing}
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

export default ServiceInvoices;
