import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { ChevronDown, Search, X } from "lucide-react";

import "./CodeSearch.css";

export type CodeOption = {
  /** valor gravado (só números) */
  code: string;
  /** código como aparece na tela (ex.: 1.1502.10.00) */
  display: string;
  description: string;
  /** texto pequeno embaixo da descrição */
  detail?: string;
  /** aparece primeiro e com destaque (ex.: compatível com o item da LC 116) */
  highlight?: boolean;
};

type CodeSearchProps = {
  id: string;
  value: string;
  options: CodeOption[] | null;
  onChange: (code: string) => void;
  placeholder?: string;
  /** rótulo do destaque (ex.: "compatível") */
  highlightLabel?: string;
  disabled?: boolean;
};

const MAX_RESULTS = 80;

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Campo de escolha com busca por código ou descrição em listas grandes (NBS, CST, etc.). */
function CodeSearch({ id, value, options, onChange, placeholder, highlightLabel, disabled }: CodeSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options?.find(option => option.code === value) ?? null;

  const results = useMemo(() => {
    if (!options) return [];

    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const digits = query.replace(/\D/g, "");

    const matches = options.filter(option => {
      if (terms.length === 0) return true;
      if (digits.length >= 2 && option.code.startsWith(digits)) return true;
      const haystack = normalize(`${option.display} ${option.description} ${option.detail ?? ""}`);
      return terms.every(term => haystack.includes(term));
    });

    return [...matches.filter(option => option.highlight), ...matches.filter(option => !option.highlight)];
  }, [options, query]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function choose(code: string) {
    onChange(code);
    setOpen(false);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor(current => Math.min(current + 1, Math.min(results.length, MAX_RESULTS) - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(current => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      // não envia o formulário
      event.preventDefault();
      const option = results[cursor];
      if (option) choose(option.code);
    }
  }

  return (
    <div className="code-search">
      {!open ? (
        <div className="code-search-current">
          <button
            id={id}
            type="button"
            className="code-search-trigger"
            onClick={openList}
            disabled={disabled}
            title={selected ? `${selected.display} - ${selected.description}` : undefined}
          >
            {selected ? (
              <span className="code-search-value">
                <strong>{selected.display}</strong> {selected.description}
              </span>
            ) : value ? (
              <span className="code-search-value">
                <strong>{value}</strong> {options ? "(código fora da tabela)" : ""}
              </span>
            ) : (
              <span className="code-search-placeholder">{options ? placeholder ?? "Buscar..." : "Carregando a tabela..."}</span>
            )}
            <ChevronDown size={16} />
          </button>
          {value && !disabled && (
            <button type="button" className="code-search-clear" onClick={() => onChange("")} title="Limpar" aria-label="Limpar">
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="code-search-panel">
          <div className="code-search-input">
            <Search size={15} />
            <input
              ref={inputRef}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={handleKey}
              placeholder="Digite o código ou parte da descrição"
              aria-label="Buscar na tabela"
            />
            <button type="button" className="code-search-close" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>

          <ul className="code-search-list" role="listbox">
            {!options && <li className="code-search-empty">Carregando a tabela...</li>}
            {options && results.length === 0 && <li className="code-search-empty">Nada encontrado.</li>}
            {results.slice(0, MAX_RESULTS).map((option, index) => (
              <li key={option.code} role="option" aria-selected={option.code === value}>
                <button
                  type="button"
                  className={`${index === cursor ? "is-cursor" : ""} ${option.code === value ? "is-selected" : ""}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(option.code)}
                >
                  <span className="code-search-code">
                    {option.display}
                    {option.highlight && highlightLabel && <em>{highlightLabel}</em>}
                  </span>
                  <span className="code-search-desc">{option.description}</span>
                  {option.detail && <small>{option.detail}</small>}
                </button>
              </li>
            ))}
            {results.length > MAX_RESULTS && (
              <li className="code-search-empty">
                Mostrando {MAX_RESULTS} de {results.length}. Digite mais para refinar a busca.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CodeSearch;
