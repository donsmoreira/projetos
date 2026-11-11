import type { ReactNode } from "react";

import { Lock } from "lucide-react";

import { usePermissions } from "../hooks/useCompany";
import type { ModuleKey } from "../types/permissions";

import "./ModuleRoute.css";

type ModuleRouteProps = {
  module: ModuleKey;
  children: ReactNode;
};

/** Só mostra a tela se o usuário tiver "Ver" nela. */
function ModuleRoute({ module, children }: ModuleRouteProps) {
  const { canView } = usePermissions(module);

  if (canView) {
    return <>{children}</>;
  }

  return (
    <div className="module-locked">
      <Lock size={28} />
      <h2>Você não tem acesso a esta tela</h2>
      <p>
        Peça ao administrador da empresa para liberar em
        Configurações → Usuários e permissões.
      </p>
    </div>
  );
}

export default ModuleRoute;
