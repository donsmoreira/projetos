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
  getActiveGroupId,
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
  /** Todas as empresas da conta (de todos os IDs) */
  allCompanies: CompanyMembership[];
  activeId: string | null;
  groupId: number | null;
  error: string;
};

async function fetchCompanies(): Promise<LoadedState> {
  try {
    const [allCompanies, activeId, groupId] = await Promise.all([
      listMyCompanies(),
      getActiveCompanyId(),
      getActiveGroupId()
    ]);

    return { allCompanies, activeId, groupId, error: "" };
  } catch (error) {
    return {
      allCompanies: [],
      activeId: null,
      groupId: null,
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
    allCompanies: [],
    activeId: null,
    groupId: null,
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
    // Só as empresas do ID EMPRESA com que a pessoa entrou
    const companies = state.allCompanies.filter(
      item => item.company.group_id === state.groupId
    );

    const active =
      companies.find(item => item.company.id === state.activeId) ?? null;

    return {
      loading: Boolean(userId) && state.loadedFor !== userId,
      error: state.error,
      groupId: state.groupId,
      hasAnyCompany: state.allCompanies.length > 0,
      companies,
      active,
      permissions: active?.permissions ?? NO_PERMISSIONS,
      canCreateCompany:
        state.allCompanies.length === 0 ||
        companies.some(item => item.permissions.isAdmin),
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
