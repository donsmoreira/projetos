import { useState } from "react";
import type { FormEvent } from "react";

import ManagementAccountSelect from "../../../components/ManagementAccountSelect/ManagementAccountSelect";
import { setAppointmentStatus } from "../../../services/appointmentsService";
import { createReceivables } from "../../../services/receivablesService";

import type { Appointment } from "../../../types/appointment";
import { formatMoney, fromISO, toISO } from "../agendaUtils";

type CompleteAppointmentFormProps = {
  appointment: Appointment;
  /** Pode criar conta a receber (permissão de Contas a Receber) */
  canCreateReceivable: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

/**
 * Concluir o atendimento. Com valor, oferece criar a conta a receber do cliente
 * (fica ligada ao agendamento).
 */
function CompleteAppointmentForm({
  appointment,
  canCreateReceivable,
  onCancel,
  onSaved
}: CompleteAppointmentFormProps) {
  const amount = appointment.amount ?? 0;
  // Conta a receber precisa de cliente
  const hasClient = Boolean(appointment.client_id);
  const canOffer = amount > 0 && hasClient && !appointment.receivable_id && canCreateReceivable;

  const [createReceivable, setCreateReceivable] = useState(canOffer);
  const [dueDate, setDueDate] = useState(appointment.appointment_date);
  const [accountId, setAccountId] = useState("");
  const [accountPath, setAccountPath] = useState("");
  const [description, setDescription] = useState(
    [appointment.title || "Atendimento", appointment.clients?.name].filter(Boolean).join(" · ")
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const when = `${fromISO(appointment.appointment_date).toLocaleDateString("pt-BR")} ${appointment.start_time}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createReceivable && !dueDate) {
      setErrorMessage("Informe o vencimento.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      let receivableId: string | null = null;

      if (createReceivable) {
        const created = await createReceivables({
          clientId: appointment.client_id ?? "",
          description: description.trim() || "Atendimento",
          category: accountPath,
          managementAccountId: accountId,
          value: amount,
          interest: 0,
          penalty: 0,
          issueDate: toISO(new Date()),
          dueDate,
          notes: `Gerada pela agenda: atendimento de ${when}.`,
          installmentCount: 1
        });

        receivableId = created[0]?.id ?? null;
      }

      await setAppointmentStatus(appointment.id, "concluido", receivableId);
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="arc-form" onSubmit={handleSubmit}>
      <p className="agenda-complete-intro">
        <strong>{appointment.clients?.name ?? "Sem cliente"}</strong> · {when}
        {appointment.title ? ` · ${appointment.title}` : ""}
        {amount > 0 ? ` · ${formatMoney(amount)}` : ""}
      </p>

      {amount > 0 && appointment.receivable_id && (
        <small className="arc-hint">A conta a receber deste atendimento já foi criada.</small>
      )}

      {amount > 0 && !hasClient && (
        <small className="arc-hint">
          Agendamento sem cliente: para gerar a conta a receber, edite o agendamento e escolha o cliente antes de concluir.
        </small>
      )}

      {amount > 0 && hasClient && !appointment.receivable_id && !canCreateReceivable && (
        <small className="arc-hint">
          Você não tem permissão para cadastrar em Contas a Receber; o atendimento será só concluído.
        </small>
      )}

      {amount === 0 && (
        <small className="arc-hint">Sem valor informado: o atendimento será só marcado como concluído.</small>
      )}

      {canOffer && (
        <>
          <label className="agenda-check">
            <input
              type="checkbox"
              checked={createReceivable}
              onChange={event => setCreateReceivable(event.target.checked)}
            />
            Criar a conta a receber de {formatMoney(amount)} para o cliente
          </label>

          {createReceivable && (
            <>
              <div className="arc-field">
                <label htmlFor="complete-description">Descrição</label>
                <input
                  id="complete-description"
                  type="text"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  maxLength={140}
                />
              </div>

              <div className="arc-form-grid">
                <div className="arc-field">
                  <label htmlFor="complete-due">Vencimento</label>
                  <input
                    id="complete-due"
                    type="date"
                    value={dueDate}
                    onChange={event => setDueDate(event.target.value)}
                    required
                  />
                </div>

                <div className="arc-field">
                  <label htmlFor="complete-account">Conta gerencial (receita) <small>· opcional</small></label>
                  <ManagementAccountSelect
                    id="complete-account"
                    type="receita"
                    value={accountId}
                    onChange={(id, path) => {
                      setAccountId(id);
                      setAccountPath(path);
                      setErrorMessage("");
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      <div className="arc-form-actions">
        <button type="button" className="arc-button arc-button-secondary" onClick={onCancel} disabled={submitting}>
          Voltar
        </button>
        <button type="submit" className="arc-button arc-button-primary" disabled={submitting}>
          {submitting
            ? "Concluindo..."
            : createReceivable ? "Concluir e criar conta a receber" : "Concluir atendimento"}
        </button>
      </div>
    </form>
  );
}

export default CompleteAppointmentForm;
