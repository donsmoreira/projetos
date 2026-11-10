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
    <div className="bank-accounts-search">
      <Search
        size={18}
        className="bank-accounts-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por nome, banco, agência ou conta..."
        aria-label="Pesquisar contas bancárias"
      />

      {value && (
        <button
          type="button"
          className="bank-accounts-search-clear"
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