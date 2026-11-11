import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import AddressSection from "../../components/AddressSection/AddressSection";
import { useAuth } from "../../contexts/AuthContext";
import { getMyProfile, updateMyProfile } from "../../services/companyService";
import { addressFromDb, validateAddress } from "../../utils/address";
import { documentDigits, formatCpf, isValidCpf } from "../../utils/document";
import { displayLogin, isUsernameAccount } from "../../utils/username";

import type { AddressFormData } from "../../types/address";
import type { ProfileFormData, UserProfile } from "../../types/company";

import "./Settings.css";

function formFromProfile(profile: UserProfile): ProfileFormData {
  return {
    fullName: profile.full_name ?? "",
    phone: profile.phone ?? "",
    cpf: formatCpf(profile.cpf),
    address: addressFromDb(profile)
  };
}

function ProfileForm({ profile, email }: { profile: UserProfile; email: string }) {
  const [form, setForm] = useState<ProfileFormData>(() => formFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  function update<K extends keyof ProfileFormData>(field: K, value: ProfileFormData[K]) {
    setSavedMessage("");
    setForm(current => ({ ...current, [field]: value }));
  }

  function updateAddress(change: (current: AddressFormData) => AddressFormData) {
    setSavedMessage("");
    setForm(current => ({ ...current, address: change(current.address) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.fullName.trim()) {
      setErrorMessage("Informe o seu nome.");
      return;
    }

    const cpf = documentDigits(form.cpf);

    if (cpf && !isValidCpf(cpf)) {
      setErrorMessage("CPF inválido. Confira os números (ou deixe em branco).");
      return;
    }

    const addressError = validateAddress(form.address);

    if (addressError) {
      setErrorMessage(addressError);
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      await updateMyProfile(form);
      setSavedMessage("Perfil salvo.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="settings-page">
      <section className="settings-card">
        <h3>Dados pessoais</h3>

        <div className="settings-grid">
          <div className="settings-field settings-field-full">
            <label htmlFor="profile-name">Nome completo</label>
            <input
              id="profile-name"
              type="text"
              value={form.fullName}
              onChange={event => update("fullName", event.target.value)}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="profile-email">
              {isUsernameAccount(email) ? "Usuário de acesso" : "E-mail de acesso"}
            </label>
            <input id="profile-email" type="text" value={displayLogin(email)} disabled />
            <small>É o que você digita no login; não muda por aqui.</small>
          </div>

          <div className="settings-field">
            <label htmlFor="profile-phone">Telefone / WhatsApp</label>
            <input
              id="profile-phone"
              type="tel"
              value={form.phone}
              onChange={event => update("phone", event.target.value)}
              placeholder="(54) 99999-9999"
            />
            <small>Vai ser usado pelo Assessor Financeiro no WhatsApp.</small>
          </div>

          <div className="settings-field">
            <label htmlFor="profile-cpf">CPF (opcional)</label>
            <input
              id="profile-cpf"
              type="text"
              inputMode="numeric"
              value={form.cpf}
              onChange={event => update("cpf", formatCpf(event.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-grid">
          <AddressSection
            value={form.address}
            onChange={updateAddress}
            classPrefix="settings"
            idPrefix="profile"
          />
        </div>
      </section>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
      {savedMessage && <div className="settings-message settings-message-ok">{savedMessage}</div>}

      <div className="settings-actions">
        <button type="submit" className="settings-button" disabled={saving}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </button>
      </div>
    </form>
  );
}

/** Configurações → Meu perfil */
function ProfileSettings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    getMyProfile()
      .then(data => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar o perfil.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>Meu perfil</h2>
          <p>Seus dados de usuário. Valem para todas as empresas de que você participa.</p>
        </div>
      </section>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}

      {!profile && !errorMessage && <div className="settings-note">Carregando perfil...</div>}

      {profile && <ProfileForm profile={profile} email={user?.email ?? ""} />}
    </div>
  );
}

export default ProfileSettings;
