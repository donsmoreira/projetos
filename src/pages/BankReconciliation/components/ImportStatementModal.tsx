import { useMemo, useState } from "react";

import { FileUp } from "lucide-react";

import Modal from "../../../components/Modal/Modal";

import { importStatementLines } from "../../../services/statementService";
import type { AccountWithBalance } from "../../../types/bankAccount";
import type { ImportResult } from "../../../types/statement";
import { formatCurrency } from "../../../utils/currency";
import { formatDateBR } from "../../../utils/entryBatch";
import {
  guessCsvMapping,
  parseCsv,
  parseOfx,
  readStatementFile,
  splitCsv
} from "../../../utils/statementParsers";
import type { CsvMapping, ParsedStatement } from "../../../utils/statementParsers";

type ImportStatementModalProps = {
  account: AccountWithBalance;
  onClose: () => void;
  onImported: (result: ImportResult, statement: ParsedStatement) => Promise<void> | void;
};

/** Importa o extrato do banco em OFX (recomendado) ou CSV. */
function ImportStatementModal({ account, onClose, onImported }: ImportStatementModalProps) {
  const [fileName, setFileName] = useState("");
  const [ofx, setOfx] = useState<ParsedStatement | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const statement: ParsedStatement | null = useMemo(() => {
    if (ofx) {
      return ofx;
    }

    if (csvRows && mapping) {
      return {
        source: "csv",
        lines: parseCsv(csvRows, mapping).lines,
        accountId: "",
        ledgerBalance: null,
        ledgerDate: ""
      };
    }

    return null;
  }, [ofx, csvRows, mapping]);

  const skipped = useMemo(
    () => (csvRows && mapping ? parseCsv(csvRows, mapping).skipped : []),
    [csvRows, mapping]
  );

  const summary = useMemo(() => {
    if (!statement || statement.lines.length === 0) {
      return null;
    }

    const dates = statement.lines.map(line => line.date).sort();
    const inCents = statement.lines.filter(line => line.amount > 0).reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    const outCents = statement.lines.filter(line => line.amount < 0).reduce((sum, line) => sum + Math.round(line.amount * 100), 0);

    return {
      first: dates[0],
      last: dates[dates.length - 1],
      inTotal: inCents / 100,
      outTotal: outCents / 100
    };
  }, [statement]);

  // Número da conta do arquivo diferente do cadastro: só avisa
  const accountMismatch = useMemo(() => {
    const fromFile = (statement?.accountId ?? "").replace(/\D/g, "").replace(/^0+/, "");
    const registered = (account.account_number ?? "").replace(/\D/g, "").replace(/^0+/, "");

    if (!fromFile || !registered) {
      return false;
    }

    return !fromFile.includes(registered) && !registered.includes(fromFile);
  }, [statement, account.account_number]);

  async function handleFile(file: File | undefined) {
    setErrorMessage("");
    setOfx(null);
    setCsvRows(null);
    setMapping(null);

    if (!file) {
      return;
    }

    setFileName(file.name);

    try {
      setReading(true);
      const text = await readStatementFile(file);

      if (/<OFX>|OFXHEADER/i.test(text)) {
        const parsed = parseOfx(text);

        if (parsed.lines.length === 0) {
          setErrorMessage("Não encontrei lançamentos neste arquivo OFX.");
          return;
        }

        setOfx(parsed);
        return;
      }

      const rows = splitCsv(text);

      if (rows.length === 0) {
        setErrorMessage("O arquivo está vazio.");
        return;
      }

      setCsvRows(rows);
      setMapping(guessCsvMapping(rows));
    } catch {
      setErrorMessage("Não foi possível ler o arquivo. Exporte o extrato em OFX ou CSV no site/app do banco.");
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!statement || statement.lines.length === 0) {
      setErrorMessage("Não há lançamentos para importar.");
      return;
    }

    try {
      setImporting(true);
      setErrorMessage("");
      const result = await importStatementLines(account.id, statement.source, statement.lines);
      await onImported(result, statement);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível importar o extrato.");
    } finally {
      setImporting(false);
    }
  }

  const columns = csvRows ? Math.max(...csvRows.slice(0, 20).map(row => row.length)) : 0;
  const header = csvRows?.[0] ?? [];
  const columnOptions = Array.from({ length: columns }, (_, index) => ({
    value: index,
    label: mapping?.hasHeader && header[index] ? `${index + 1}. ${header[index]}` : `Coluna ${index + 1}`
  }));

  function updateMapping<K extends keyof CsvMapping>(key: K, value: CsvMapping[K]) {
    setMapping(current => (current ? { ...current, [key]: value } : current));
  }

  return (
    <Modal title="Importar extrato" subtitle={`${account.name} · arquivo OFX (recomendado) ou CSV`} onClose={onClose} width={680}>
      <div className="arc-form">
        <label className="reconcile-file">
          <FileUp size={20} />
          <span>
            <strong>{fileName || "Escolher arquivo do extrato"}</strong>
            <small>No site ou app do banco, exporte o extrato em OFX (Money/Quicken) ou CSV.</small>
          </span>
          <input
            type="file"
            accept=".ofx,.qfx,.csv,.txt"
            onChange={event => void handleFile(event.target.files?.[0])}
          />
        </label>

        {reading && <small className="arc-hint">Lendo o arquivo...</small>}

        {csvRows && mapping && (
          <div className="reconcile-csv-map">
            <div className="batch-preview-title">Colunas do CSV</div>

            <div className="arc-form-grid">
              <div className="arc-field">
                <label htmlFor="csv-date">Data</label>
                <select id="csv-date" value={mapping.date} onChange={event => updateMapping("date", Number(event.target.value))}>
                  {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="arc-field">
                <label htmlFor="csv-description">Descrição / histórico</label>
                <select id="csv-description" value={mapping.description} onChange={event => updateMapping("description", Number(event.target.value))}>
                  {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="arc-field">
                <label htmlFor="csv-amount-mode">Valor</label>
                <select
                  id="csv-amount-mode"
                  value={mapping.amount >= 0 ? "single" : "split"}
                  onChange={event =>
                    setMapping(current =>
                      current
                        ? event.target.value === "single"
                          ? { ...current, amount: Math.max(current.credit, 0), credit: -1, debit: -1 }
                          : { ...current, amount: -1, credit: 0, debit: Math.min(1, columns - 1) }
                        : current
                    )
                  }
                >
                  <option value="single">Uma coluna (saída negativa)</option>
                  <option value="split">Duas colunas (entrada e saída)</option>
                </select>
              </div>

              {mapping.amount >= 0 ? (
                <div className="arc-field">
                  <label htmlFor="csv-amount">Coluna do valor</label>
                  <select id="csv-amount" value={mapping.amount} onChange={event => updateMapping("amount", Number(event.target.value))}>
                    {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div className="arc-field">
                    <label htmlFor="csv-credit">Coluna de entrada (crédito)</label>
                    <select id="csv-credit" value={mapping.credit} onChange={event => updateMapping("credit", Number(event.target.value))}>
                      {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="arc-field">
                    <label htmlFor="csv-debit">Coluna de saída (débito)</label>
                    <select id="csv-debit" value={mapping.debit} onChange={event => updateMapping("debit", Number(event.target.value))}>
                      {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              <label className="reconcile-check arc-field-full">
                <input
                  type="checkbox"
                  checked={mapping.hasHeader}
                  onChange={event => updateMapping("hasHeader", event.target.checked)}
                />
                A primeira linha é o cabeçalho (nomes das colunas)
              </label>
            </div>

            {skipped.length > 0 && (
              <small className="arc-hint">
                {skipped.length} linha(s) sem data ou valor foram puladas (ex.: saldo, totais).
              </small>
            )}
          </div>
        )}

        {statement && summary && (
          <div className="batch-preview">
            <div className="batch-preview-title">
              {statement.lines.length} lançamento(s) de {formatDateBR(summary.first)} a {formatDateBR(summary.last)}
              <small> · entradas {formatCurrency(summary.inTotal)} · saídas {formatCurrency(summary.outTotal)}</small>
            </div>

            {statement.lines.slice(0, 6).map(line => (
              <div key={line.externalId} className="batch-preview-row">
                <span className="batch-preview-name">
                  <strong>{line.description}</strong>
                  <small>{formatDateBR(line.date)}</small>
                </span>
                <span className={`batch-preview-result ${line.amount < 0 ? "reconcile-out" : "reconcile-in"}`}>
                  {formatCurrency(line.amount)}
                </span>
              </div>
            ))}

            {statement.lines.length > 6 && (
              <div className="batch-preview-row"><small className="arc-hint">… e mais {statement.lines.length - 6}</small></div>
            )}
          </div>
        )}

        {accountMismatch && (
          <div className="arc-form-error">
            O número da conta no arquivo ({statement?.accountId}) é diferente do cadastro desta conta ({account.account_number}).
            Confira se escolheu a conta certa antes de importar.
          </div>
        )}

        {statement?.ledgerBalance !== null && statement?.ledgerBalance !== undefined && (
          <small className="arc-hint">
            Saldo informado pelo banco{statement.ledgerDate ? ` em ${formatDateBR(statement.ledgerDate)}` : ""}: {formatCurrency(statement.ledgerBalance)} ·
            saldo no sistema hoje: {formatCurrency(account.balance)}
          </small>
        )}

        <small className="arc-hint">
          Lançamentos que já foram importados antes são pulados, então pode importar períodos que se repetem.
        </small>

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={importing}>
            Cancelar
          </button>
          <button
            type="button"
            className="arc-button arc-button-primary"
            onClick={() => void handleImport()}
            disabled={importing || !statement || statement.lines.length === 0}
          >
            {importing ? "Importando..." : `Importar${statement ? ` ${statement.lines.length} lançamento(s)` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ImportStatementModal;
