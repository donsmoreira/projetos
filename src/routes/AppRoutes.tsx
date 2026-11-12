import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import MainLayout from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "./ProtectedRoute";
import CompanyGate from "./CompanyGate";
import ModuleRoute from "./ModuleRoute";

import Login from "../pages/Login/Login";
import Signup from "../pages/Signup/Signup";
import ForgotPassword from "../pages/ForgotPassword/ForgotPassword";
import Dashboard from "../pages/Dashboard/Dashboard";
import Clients from "../pages/Clients/Clients";
import Agenda from "../pages/Agenda/Agenda";
import Suppliers from "../pages/Suppliers/Suppliers";
import BankAccounts from "../pages/BankAccounts/BankAccounts";
import Payables from "../pages/Payables/Payables";
import Receivables from "../pages/Receivables/Receivables";
import CreditCards from "../pages/CreditCards/CreditCards";
import Reports from "../pages/Reports/Reports";
import CashBreaks from "../pages/CashBreaks/CashBreaks";
import ManagementAccounts from "../pages/ManagementAccounts/ManagementAccounts";
import Cash from "../pages/Cash/Cash";
import CompanySettings from "../pages/Settings/CompanySettings";
import UsersSettings from "../pages/Settings/UsersSettings";
import ProfileSettings from "../pages/Settings/ProfileSettings";
import CompaniesSettings from "../pages/Settings/CompaniesSettings";
import NewCompanySettings from "../pages/Settings/NewCompanySettings";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/cadastro"
          element={<Signup />}
        />

        <Route
          path="/esqueci-senha"
          element={<ForgotPassword />}
        />

        <Route element={<ProtectedRoute />}>
          {/* Só entra no sistema com uma empresa aberta */}
          <Route element={<CompanyGate />}>
          <Route element={<MainLayout />}>
            <Route
              index
              element={<ModuleRoute module="painel"><Dashboard /></ModuleRoute>}
            />

            <Route
              path="agenda"
              element={<ModuleRoute module="agenda"><Agenda /></ModuleRoute>}
            />
            <Route
              path="clientes"
              element={<ModuleRoute module="clientes"><Clients /></ModuleRoute>}
            />

            <Route
              path="fornecedores"
              element={<ModuleRoute module="fornecedores"><Suppliers /></ModuleRoute>}
            />

            <Route
              path="bancos"
              element={<ModuleRoute module="contas_bancarias"><BankAccounts /></ModuleRoute>}
            />

            <Route
              path="caixa"
              element={<ModuleRoute module="caixa"><Cash /></ModuleRoute>}
            />

            <Route
              path="contas-pagar"
              element={<ModuleRoute module="contas_pagar"><Payables /></ModuleRoute>}
            />

            <Route
              path="contas-receber"
              element={<ModuleRoute module="contas_receber"><Receivables /></ModuleRoute>}
            />

            <Route
              path="cartoes"
              element={<ModuleRoute module="cartoes"><CreditCards /></ModuleRoute>}
            />

            <Route
              path="contas-gerenciais"
              element={<ModuleRoute module="contas_gerenciais"><ManagementAccounts /></ModuleRoute>}
            />

            <Route
              path="relatorios"
              element={<ModuleRoute module="relatorios"><Reports /></ModuleRoute>}
            />
            <Route
              path="relatorios/quebra-de-caixa"
              element={<ModuleRoute module="relatorios"><CashBreaks /></ModuleRoute>}
            />

            <Route
              path="configuracoes"
              element={<Navigate to="/configuracoes/empresas" replace />}
            />

            {/* Endereço antigo da "Minha empresa" */}
            <Route
              path="configuracoes/empresa"
              element={<Navigate to="/configuracoes/empresas" replace />}
            />

            <Route
              path="configuracoes/empresas/nova"
              element={<NewCompanySettings />}
            />

            <Route
              path="configuracoes/empresas/:id"
              element={<CompanySettings />}
            />

            <Route
              path="configuracoes/usuarios"
              element={<UsersSettings />}
            />

            <Route
              path="configuracoes/perfil"
              element={<ProfileSettings />}
            />

            <Route
              path="configuracoes/empresas"
              element={<CompaniesSettings />}
            />
          </Route>
          </Route>
        </Route>

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;