import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import type { ReactNode } from "react";

import { useAuth } from "./AuthContext";
import { CompanyContext } from "./companyContext";

import {
  getActiveCompanyId,
  listMyCompanies,
  setActiveCompany
} from "../services/companyService";

import {
  NO_PERMISSIONS
} from "../types/company";

import type {
  CompanyMembership
} from "../types/company";

type LoadedState = {
  companies: CompanyMembership[];
  activeId: string | null;
  error: string;
};

async function fetchCompanies(): Promise<LoadedState> {
  try {
    const [companies, activeId] = await Promise.all([
      listMyCompanies(),
      getActiveCompanyId()
    ]);

    return { companies, activeId, error: "" };
  } catch (error) {
    return {
      companies: [],
      activeId: null,
      error: error instanceof Error ? error.message : "Não foi possível carregar as empresas."
    };
  }
}

/**
 * Empresa aberta e permissões do usuário nela, para o sistema inteiro.
 * As regras de verdade ficam no banco; aqui é para a tela saber o que mostrar.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<LoadedState & { loadedFor: string | null }>({
    companies: [],
    activeId: null,
    error: "",
    loadedFor: null
  });

  const applyLoaded = useCallback((loaded: LoadedState, forUser: string | null) => {
    setState({ ...loaded, loadedFor: forUser });
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    fetchCompanies().then(loaded => {
      if (!cancelled) {
        applyLoaded(loaded, userId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId, applyLoaded]);

  const reload = useCallback(async () => {
    applyLoaded(await fetchCompanies(), userId);
  }, [applyLoaded, userId]);

  const switchCompany = useCallback(async (companyId: string) => {
    await setActiveCompany(companyId);
    // Recarrega tudo: todas as telas passam a mostrar a empresa nova
    window.location.assign("/");
  }, []);

  const value = useMemo(() => {
    const active =
      state.companies.find(item => item.company.id === state.activeId) ?? null;

    return {
      loading: Boolean(userId) && state.loadedFor !== userId,
      error: state.error,
      companies: state.companies,
      active,
      permissions: active?.permissions ?? NO_PERMISSIONS,
      canCreateCompany:
        state.companies.length === 0 ||
        state.companies.some(item => item.permissions.isAdmin),
      switchCompany,
      reload
    };
  }, [state, userId, switchCompany, reload]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}
