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
    <div className="receivables-search">
      <Search
        size={18}
        className="receivables-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por cliente, descrição, categoria ou status..."
        aria-label="Pesquisar contas a receber"
      />

      {value && (
        <button
          type="button"
          className="receivables-search-clear"
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