import { Search, X } from "lucide-react";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

function SearchBar({
  value,
  onChange
}: SearchBarProps) {
  return (
    <div className="clients-search">
      <Search
        size={18}
        className="clients-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por nome, documento, telefone, e-mail ou endereço..."
        aria-label="Pesquisar clientes"
      />

      {value && (
        <button
          type="button"
          className="clients-search-clear"
          onClick={() => onChange("")}
          title="Limpar pesquisa"
          aria-label="Limpar pesquisa"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default SearchBar;