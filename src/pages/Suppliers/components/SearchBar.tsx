import {
  Search,
  X
} from "lucide-react";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

function SearchBar({
  value,
  onChange
}: SearchBarProps) {
  return (
    <div className="suppliers-search">
      <Search
        size={18}
        className="suppliers-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por nome, documento, telefone, e-mail ou endereço..."
        aria-label="Pesquisar fornecedores"
      />

      {value && (
        <button
          type="button"
          className="suppliers-search-clear"
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