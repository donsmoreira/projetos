import {
  useLayoutEffect,
  useRef,
  useState
} from "react";

import {
  applyCurrencyEdit,
  formatCurrencyInput,
  parseCurrencyText
} from "../../utils/currency";

type CurrencyInputProps = {
  id: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
  // Aceita "-" no início (ex.: saldo inicial negativo)
  allowNegative?: boolean;
};

/**
 * Campo de valor em reais.
 * Enquanto o campo está em foco, dá para editar qualquer casa do número
 * (o cursor fica onde você está editando). Ao sair do campo, vira "5.000,00".
 */
function CurrencyInput({
  id,
  value,
  onChange,
  placeholder = "0,00",
  required,
  allowNegative = false
}: CurrencyInputProps) {
  const inputRef =
    useRef<HTMLInputElement>(null);

  const pendingCursor =
    useRef<number | null>(null);

  // Guardado como objeto para que toda tecla redesenhe o campo, mesmo quando
  // o texto não muda (ex.: letra recusada), e o cursor seja recolocado
  const [editing, setEditing] =
    useState<{ text: string } | null>(null);

  // Recoloca o cursor depois que o texto foi ajustado
  useLayoutEffect(() => {
    const input = inputRef.current;
    const cursor = pendingCursor.current;

    if (
      input &&
      cursor !== null &&
      document.activeElement === input
    ) {
      input.setSelectionRange(cursor, cursor);
    }

    pendingCursor.current = null;
  });

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode={allowNegative ? "text" : "decimal"}
      autoComplete="off"
      value={
        editing
          ? editing.text
          : formatCurrencyInput(value)
      }
      onFocus={() =>
        setEditing({
          // Valor zerado começa vazio, para digitar direto (ex.: "50" → 50,00).
          // Valores preenchidos continuam editáveis em qualquer casa.
          text: value === 0
            ? ""
            : formatCurrencyInput(value)
        })
      }
      onChange={event => {
        const { text, cursor } =
          applyCurrencyEdit(
            event.target.value,
            event.target.selectionStart ??
              event.target.value.length,
            allowNegative
          );

        pendingCursor.current = cursor;
        setEditing({ text });
        onChange(parseCurrencyText(text));
      }}
      onBlur={() => setEditing(null)}
      placeholder={placeholder}
      required={required}
    />
  );
}

export default CurrencyInput;
