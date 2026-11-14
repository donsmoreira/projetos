import { useCallback, useEffect, useState } from "react";

import { Eye, EyeOff, FileKey2, ShieldCheck, ShieldAlert, Trash2, Upload } from "lucide-react";

import { appAlert, appConfirm } from "../../components/Dialog/dialog";
import {
  getCertificateInfo,
  removeCertificate,
  uploadCertificate
} from "../../services/certificateService";
import type { CertificateInfo } from "../../services/certificateService";
import { formatDocument } from "../../utils/document";

type CertificateBoxProps = {
  /** null = empresa ainda não salva */
  companyId: string | null;
  canEdit: boolean;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Certificado digital A1 da empresa: importar (arquivo + senha), ver dados e remover. */
function CertificateBox({ companyId, canEdit }: CertificateBoxProps) {
  const [info, setInfo] = useState<CertificateInfo | null>(null);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [replacing, setReplacing] = useState(false);
  // Hora de referência para calcular quantos dias faltam para vencer
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!companyId) return;

    try {
      setLoading(true);
      setInfo(await getCertificateInfo(companyId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível ler o certificado.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleUpload() {
    if (!companyId) return;

    if (!file) {
      setErrorMessage("Escolha o arquivo do certificado A1 (.pfx ou .p12).");
      return;
    }

    if (!password) {
      setErrorMessage("Informe a senha do certificado.");
      return;
    }

    try {
      setBusy(true);
      setErrorMessage("");
      setSavedMessage("");
      await uploadCertificate(companyId, file, password);
      setFile(null);
      setPassword("");
      setReplacing(false);
      setSavedMessage("Certificado importado e guardado com segurança.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível importar o certificado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!companyId) return;

    const confirmed = await appConfirm(
      "Remover o certificado digital desta empresa? Sem ele não é possível emitir NFS-e até importar outro.",
      { title: "Remover certificado", confirmLabel: "Sim", cancelLabel: "Não", tone: "danger" }
    );

    if (!confirmed) return;

    try {
      setBusy(true);
      await removeCertificate(companyId);
      setSavedMessage("Certificado removido.");
      await load();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Não foi possível remover o certificado.");
    } finally {
      setBusy(false);
    }
  }

  if (!companyId) {
    return (
      <div className="cert-box">
        <small className="cert-muted">Salve a empresa primeiro; depois volte aqui para importar o certificado digital.</small>
      </div>
    );
  }

  const daysLeft = info ? Math.floor((new Date(info.valid_until).getTime() - now) / 86400000) : 0;
  const expired = info ? daysLeft < 0 : false;
  const expiringSoon = info ? !expired && daysLeft <= 30 : false;
  const showForm = canEdit && (!info || replacing);

  return (
    <div className="cert-box">
      <div className="cert-title">
        <FileKey2 size={16} /> Certificado digital <span className="cert-tag">somente A1 (.pfx / .p12)</span>
      </div>

      {loading && <small className="cert-muted">Carregando...</small>}

      {!loading && info && (
        <div className={`cert-info${expired ? " is-expired" : expiringSoon ? " is-soon" : ""}`}>
          {expired || expiringSoon ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
          <div>
            <strong>{info.subject_name}</strong>
            <small>
              {info.document ? `${formatDocument(info.document)} · ` : ""}
              válido até <b>{formatDate(info.valid_until)}</b>
              {expired ? " (vencido)" : expiringSoon ? ` (vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"})` : ""}
            </small>
            <small>
              {info.issuer ? `Emitido por ${info.issuer} · ` : ""}
              importado em {formatDate(info.uploaded_at)}{info.file_name ? ` (${info.file_name})` : ""}
            </small>
          </div>

          {canEdit && !replacing && (
            <div className="cert-actions">
              <button type="button" className="cert-button" disabled={busy} onClick={() => setReplacing(true)}>
                <Upload size={14} /> Trocar
              </button>
              <button type="button" className="cert-button cert-button-danger" disabled={busy} onClick={() => void handleRemove()}>
                <Trash2 size={14} /> Remover
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && !info && !canEdit && (
        <small className="cert-muted">Nenhum certificado importado. Só administradores podem importar.</small>
      )}

      {!loading && showForm && (
        <div className="cert-form">
          <label className="cert-file">
            <Upload size={16} />
            <span>{file ? file.name : "Escolher arquivo do certificado A1 (.pfx ou .p12)"}</span>
            <input
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              onChange={event => {
                setFile(event.target.files?.[0] ?? null);
                setErrorMessage("");
              }}
            />
          </label>

          <div className="cert-password">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Senha do certificado"
              autoComplete="new-password"
              value={password}
              // Enter aqui não pode salvar o cadastro da empresa
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleUpload();
                }
              }}
              onChange={event => {
                setPassword(event.target.value);
                setErrorMessage("");
              }}
            />
            <button
              type="button"
              className="cert-eye"
              onClick={() => setShowPassword(current => !current)}
              aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="cert-actions">
            {replacing && (
              <button type="button" className="cert-button" disabled={busy} onClick={() => setReplacing(false)}>
                Cancelar
              </button>
            )}
            <button type="button" className="cert-button cert-button-primary" disabled={busy} onClick={() => void handleUpload()}>
              {busy ? "Conferindo..." : "Importar certificado"}
            </button>
          </div>

          <small className="cert-muted">
            O arquivo e a senha vão direto para o servidor, que confere a senha, lê a validade e guarda tudo criptografado.
            Ninguém consegue baixar o certificado de volta pelo sistema. O certificado A3 (token ou cartão) não é aceito.
          </small>
        </div>
      )}

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
      {savedMessage && <div className="settings-message settings-message-ok">{savedMessage}</div>}
    </div>
  );
}

export default CertificateBox;
