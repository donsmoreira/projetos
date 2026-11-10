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
    <div className="credit-cards-search">
      <Search
        size={18}
        className="credit-cards-search-icon"
      />

      <input
        type="search"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        placeholder="Pesquisar por nome, banco, bandeira ou final do cartão..."
        aria-label="Pesquisar cartões de crédito"
      />

      {value && (
        <button
          type="button"
          className="credit-cards-search-clear"
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