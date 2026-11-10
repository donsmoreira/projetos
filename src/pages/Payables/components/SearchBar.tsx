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
    <div className="payables-search">
      <Search
        size={18}
        className="payables-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por fornecedor, descrição, categoria ou status..."
        aria-label="Pesquisar contas a pagar"
      />

      {value && (
        <button
          type="button"
          className="payables-search-clear"
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