import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import Modal from "../Modal/Modal";
import CurrencyInput from "../CurrencyInput/CurrencyInput";
import ManagementAccountSelect from "../ManagementAccountSelect/ManagementAccountSelect";

import type { BatchEntry, RenegotiationData } from "../../types/entryBatch";
import { formatCurrency } from "../../utils/currency";
import { formatDateBR, previewInstallments, sortForSettlement, toCents, todayISO } from "../../utils/entryBatch";

import "./EntryBatch.css";

type RenegotiationModalProps = {
  kind: "pagar" | "receber";
  entries: BatchEntry[];
  onClose: () => void;
  onSubmit: (data: RenegotiationData) => Promise<void>;
  onSaved: () => Promise<void> | void;
};

/** Junta contas pendentes do mesmo fornecedor/cliente em novas contas (à vista ou parceladas). */
function RenegotiationModal({ kind, entries, onClose, onSubmit, onSaved }: RenegotiationModalProps) {
  const isPay = kind === "pagar";
  const partyWord = isPay ? "fornecedor" : "cliente";
  const ordered = useMemo(() => sortForSettlement(entries), [entries]);

  const baseCents = useMemo(
    () => entries.reduce((sum, entry) => sum + toCents(entry.total), 0),
    [entries]
  );

  const sameParty = new Set(entries.map(entry => entry.partyId ?? "")).size === 1;

  // Conta gerencial: a das contas antigas, se todas usarem a mesma
  const common = useMemo(() => {
    const ids = new Set(entries.map(entry => entry.managementAccountId ?? ""));
    const first = entries[0];
    return ids.size === 1 && first?.managementAccountId
      ? { id: first.managementAccountId, path: first.category ?? "" }
      : { id: "", path: "" };
  }, [entries]);

  const [parcelado, setParcelado] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [increase, setIncrease] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [description, setDescription] = useState("Renegociação");
  const [managementAccountId, setManagementAccountId] = useState(common.id);
  const [category, setCategory] = useState(common.path);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const count = parcelado ? Math.min(Math.max(Math.floor(installments || 0), 2), 60) : 1;
  const newTotalCents = baseCents + toCents(increase) - toCents(discount);

  const parcels = useMemo(
    () => (newTotalCents > 0 && firstDueDate ? previewInstallments(newTotalCents, count, firstDueDate) : []),
    [newTotalCents, count, firstDueDate]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sameParty) {
      setErrorMessage(`A renegociação é feita com um ${partyWord} só: marque contas do mesmo ${partyWord}.`);
      return;
    }

    if (parcelado && (installments < 2 || installments > 60)) {
      setErrorMessage("Parcelado: informe de 2 a 60 parcelas.");
      return;
    }

    if (!firstDueDate) {
      setErrorMessage(parcelado ? "Informe o vencimento da 1ª parcela." : "Informe o vencimento.");
      return;
    }

    if (newTotalCents <= 0) {
      setErrorMessage("O novo total precisa ser maior que zero. Confira o desconto.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await onSubmit({
        installments: count,
        firstDueDate,
        increase: toCents(increase) / 100,
        discount: toCents(discount) / 100,
        description,
        managementAccountId,
        category,
        notes
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível renegociar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Renegociar contas"
      subtitle={`${entries.length} conta${entries.length > 1 ? "s" : ""} de ${entries[0]?.party ?? ""} · em aberto ${formatCurrency(baseCents / 100)}`}
      onClose={onClose}
      width={640}
    >
      <form className="arc-form" onSubmit={handleSubmit}>
        {!sameParty && (
          <div className="arc-form-error">
            A renegociação é feita com um {partyWord} só: marque contas do mesmo {partyWord}.
          </div>
        )}

        <div className="batch-preview">
          <div className="batch-preview-title">Contas que serão renegociadas</div>
          {ordered.map(entry => (
            <div key={entry.id} className="batch-preview-row">
              <span className="batch-preview-name">
                <strong>{entry.description}</strong>
                <small>vence {formatDateBR(entry.dueDate)}</small>
              </span>
              <span className="batch-preview-result">{formatCurrency(entry.total)}</span>
            </div>
          ))}
        </div>

        <div className="arc-choice-group reneg-choice-group" role="radiogroup" aria-label="Forma">
          <label className={`arc-choice${!parcelado ? " is-selected" : ""}`}>
            <input type="radio" name="reneg-forma" checked={!parcelado} onChange={() => setParcelado(false)} />
            À vista
          </label>
          <label className={`arc-choice${parcelado ? " is-selected" : ""}`}>
            <input type="radio" name="reneg-forma" checked={parcelado} onChange={() => setParcelado(true)} />
            Parcelado
          </label>
        </div>

        <div className="arc-form-grid">
          {parcelado && (
            <div className="arc-field">
              <label htmlFor="reneg-installments">Parcelas</label>
              <input
                id="reneg-installments"
                type="number"
                min={2}
                max={60}
                value={installments}
                onChange={event => setInstallments(Number(event.target.value))}
                required
              />
            </div>
          )}

          <div className="arc-field">
            <label htmlFor="reneg-first-due">{parcelado ? "Vencimento da 1ª parcela" : "Vencimento"}</label>
            <input
              id="reneg-first-due"
              type="date"
              value={firstDueDate}
              onChange={event => setFirstDueDate(event.target.value)}
              required
            />
          </div>

          <div className="arc-field">
            <label htmlFor="reneg-increase">Acréscimo / juros (R$)</label>
            <CurrencyInput id="reneg-increase" value={increase} onChange={setIncrease} />
          </div>

          <div className="arc-field">
            <label htmlFor="reneg-discount">Desconto (R$)</label>
            <CurrencyInput id="reneg-discount" value={discount} onChange={setDiscount} />
          </div>

          <div className="arc-field arc-field-full">
            <label htmlFor="reneg-description">Descrição das novas contas</label>
            <input
              id="reneg-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Renegociação"
            />
          </div>

          <div className="arc-field arc-field-full">
            <label htmlFor="reneg-account">Conta gerencial (opcional)</label>
            <ManagementAccountSelect
              id="reneg-account"
              type={isPay ? "despesa" : "receita"}
              value={managementAccountId}
              onChange={(accountId, path) => {
                setManagementAccountId(accountId);
                setCategory(path);
              }}
            />
          </div>

          <div className="arc-field arc-field-full">
            <label htmlFor="reneg-notes">Observações</label>
            <textarea id="reneg-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
            <small className="arc-hint">As contas antigas ficam anotadas nas observações das novas.</small>
          </div>
        </div>

        <div className="batch-preview">
          <div className="batch-preview-title">
            Novo total: {formatCurrency(Math.max(newTotalCents, 0) / 100)}
            <small> · {count === 1 ? "à vista" : `${count} parcelas (centavos que sobram na 1ª)`}</small>
          </div>

          {parcels.map(parcel => (
            <div key={parcel.index} className="batch-preview-row">
              <span className="batch-preview-name">
                <strong>{count > 1 ? `${description || "Renegociação"} (${parcel.index}/${count})` : description || "Renegociação"}</strong>
                <small>vence {formatDateBR(parcel.dueDate)}</small>
              </span>
              <span className="batch-preview-result">{formatCurrency(parcel.cents / 100)}</span>
            </div>
          ))}

          {newTotalCents <= 0 && <div className="arc-form-error">O desconto é maior que o valor em aberto.</div>}
        </div>

        <small className="arc-hint">
          Ao confirmar, as contas marcadas ficam como <strong>Renegociada</strong> e as novas aparecem como pendentes.
          Dá para desfazer enquanto nenhuma das novas for {isPay ? "paga" : "recebida"}.
        </small>

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            className="arc-button arc-button-primary"
            disabled={submitting || !sameParty || newTotalCents <= 0}
          >
            {submitting ? "Renegociando..." : "Confirmar renegociação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default RenegotiationModal;
