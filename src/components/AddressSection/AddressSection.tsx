import {
  useRef,
  useState
} from "react";

import { Loader2, MapPin } from "lucide-react";

import type { AddressFormData } from "../../types/address";

import {
  BRAZIL_STATES,
  cepDigits,
  formatCep,
  lookupCep
} from "../../utils/address";

import "./AddressSection.css";

type AddressSectionProps = {
  value: AddressFormData;
  /** Recebe uma função que monta o endereço novo a partir do mais recente */
  onChange: (update: (current: AddressFormData) => AddressFormData) => void;
  /** Prefixo das classes do formulário onde entra ("client" → client-field) */
  classPrefix: string;
  /** Prefixo dos ids dos campos (para os labels) */
  idPrefix: string;
};

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found" }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Bloco de endereço opcional (clientes e fornecedores).
 * Ao completar os 8 números do CEP, busca rua, bairro, cidade e UF no ViaCEP.
 */
function AddressSection({
  value,
  onChange,
  classPrefix,
  idPrefix
}: AddressSectionProps) {
  const [lookup, setLookup] =
    useState<LookupState>({ kind: "idle" });

  const numberRef = useRef<HTMLInputElement>(null);

  // Só a última busca vale (se a pessoa trocar o CEP no meio da busca)
  const lastRequest = useRef(0);

  const field = `${classPrefix}-field`;
  const fullField = `${classPrefix}-field ${classPrefix}-field-full`;

  function update<K extends keyof AddressFormData>(key: K, fieldValue: AddressFormData[K]) {
    onChange(current => ({ ...current, [key]: fieldValue }));
  }

  async function searchCep(cep: string) {
    const requestId = ++lastRequest.current;

    setLookup({ kind: "loading" });

    try {
      const result = await lookupCep(cep);

      if (requestId !== lastRequest.current) {
        return;
      }

      if (!result) {
        setLookup({ kind: "not-found" });
        return;
      }

      // Monta a partir do endereço mais recente: nada digitado durante a busca se perde
      onChange(current => ({
        ...current,
        street: result.street || current.street,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
        // O "complemento" do ViaCEP é a faixa de números da rua ("de 612 a 1510 - lado par"),
        // não o complemento da pessoa: esse campo fica como está
        state: result.state || current.state
      }));

      setLookup({ kind: "found" });

      // A pessoa só precisa conferir e completar o número
      window.setTimeout(() => numberRef.current?.focus(), 0);
    } catch (error) {
      if (requestId !== lastRequest.current) {
        return;
      }

      setLookup({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar o CEP agora."
      });
    }
  }

  function handleCepChange(raw: string) {
    const formatted = formatCep(raw);
    const digits = cepDigits(raw);

    onChange(current => ({ ...current, zipCode: formatted }));

    if (digits.length === 8 && digits !== cepDigits(value.zipCode)) {
      void searchCep(digits);
    } else if (digits.length < 8) {
      lastRequest.current++;
      setLookup({ kind: "idle" });
    }
  }

  return (
    <>
      <div className={`${fullField} address-section-title`}>
        <MapPin size={15} />
        <span>Endereço</span>
        <small>opcional</small>
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-zip`}>
          CEP
        </label>

        <div className="address-cep-input">
          <input
            id={`${idPrefix}-zip`}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={value.zipCode}
            onChange={event => handleCepChange(event.target.value)}
            maxLength={9}
          />

          {lookup.kind === "loading" && (
            <Loader2
              size={16}
              className="address-cep-spinner"
              aria-label="Buscando endereço"
            />
          )}
        </div>

        {lookup.kind === "loading" && (
          <small className="address-hint">Buscando endereço...</small>
        )}

        {lookup.kind === "found" && (
          <small className="address-hint address-hint-ok">
            Endereço preenchido. Confira e informe o número.
          </small>
        )}

        {lookup.kind === "not-found" && (
          <small className="address-hint address-hint-warn">
            CEP não encontrado. Preencha o endereço manualmente.
          </small>
        )}

        {lookup.kind === "error" && (
          <small className="address-hint address-hint-warn">
            {lookup.message}
          </small>
        )}
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-state`}>
          Estado (UF)
        </label>

        <select
          id={`${idPrefix}-state`}
          value={value.state}
          onChange={event => update("state", event.target.value)}
        >
          <option value="">Não informado</option>

          {BRAZIL_STATES.map(state => (
            <option key={state.uf} value={state.uf}>
              {state.uf} — {state.name}
            </option>
          ))}
        </select>
      </div>

      <div className={fullField}>
        <label htmlFor={`${idPrefix}-street`}>
          Rua / logradouro
        </label>

        <input
          id={`${idPrefix}-street`}
          type="text"
          autoComplete="address-line1"
          value={value.street}
          onChange={event => update("street", event.target.value)}
        />
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-number`}>
          Número
        </label>

        <input
          id={`${idPrefix}-number`}
          ref={numberRef}
          type="text"
          value={value.number}
          onChange={event => update("number", event.target.value)}
        />
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-complement`}>
          Complemento
        </label>

        <input
          id={`${idPrefix}-complement`}
          type="text"
          autoComplete="address-line2"
          value={value.complement}
          onChange={event => update("complement", event.target.value)}
        />
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-neighborhood`}>
          Bairro
        </label>

        <input
          id={`${idPrefix}-neighborhood`}
          type="text"
          value={value.neighborhood}
          onChange={event => update("neighborhood", event.target.value)}
        />
      </div>

      <div className={field}>
        <label htmlFor={`${idPrefix}-city`}>
          Cidade
        </label>

        <input
          id={`${idPrefix}-city`}
          type="text"
          autoComplete="address-level2"
          value={value.city}
          onChange={event => update("city", event.target.value)}
        />
      </div>
    </>
  );
}

export default AddressSection;
