import { useMemo } from "react";

import {
  NO_STATE,
  buildLocationOptions
} from "../../utils/address";

import "./LocationFilter.css";

type LocationFilterProps = {
  /** Cadastros (ou movimentações) com cidade e UF, para montar as opções */
  items: { city: string | null; state: string | null }[];
  state: string;
  city: string;
  onChange: (state: string, city: string) => void;
  /** Prefixo dos ids (para os labels) */
  idPrefix: string;
  /** Classe do campo, para seguir o visual de onde é usado */
  fieldClassName?: string;
};

/**
 * Dois filtros lado a lado: Estado (UF) e Cidade.
 * As cidades mostradas são só as do estado escolhido.
 */
function LocationFilter({
  items,
  state,
  city,
  onChange,
  idPrefix,
  fieldClassName = "location-filter-field"
}: LocationFilterProps) {
  const options = useMemo(
    () => buildLocationOptions(items, state),
    [items, state]
  );

  // Ao trocar de estado, a cidade escolhida pode não existir mais nele
  function handleStateChange(nextState: string) {
    const nextCities = buildLocationOptions(items, nextState).cities;
    const keepCity = nextCities.some(option => option.value === city);

    onChange(nextState, keepCity ? city : "");
  }

  return (
    <>
      <div className={fieldClassName}>
        <label htmlFor={`${idPrefix}-filter-state`}>
          Estado (UF)
        </label>

        <select
          id={`${idPrefix}-filter-state`}
          value={state}
          onChange={event => handleStateChange(event.target.value)}
        >
          <option value="">Todos</option>

          {options.states.map(option => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}

          {options.withoutState > 0 && (
            <option value={NO_STATE}>
              Sem endereço ({options.withoutState})
            </option>
          )}
        </select>
      </div>

      <div className={fieldClassName}>
        <label htmlFor={`${idPrefix}-filter-city`}>
          Cidade
        </label>

        <select
          id={`${idPrefix}-filter-city`}
          value={city}
          onChange={event => onChange(state, event.target.value)}
          disabled={options.cities.length === 0}
        >
          <option value="">
            {options.cities.length === 0 ? "Nenhuma cidade" : "Todas"}
          </option>

          {options.cities.map(option => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export default LocationFilter;
