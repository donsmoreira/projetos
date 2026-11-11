import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import MainLayout from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "./ProtectedRoute";
import CompanyGate from "./CompanyGate";

import Login from "../pages/Login/Login";
import Signup from "../pages/Signup/Signup";
import ForgotPassword from "../pages/ForgotPassword/ForgotPassword";
import Dashboard from "../pages/Dashboard/Dashboard";
import Clients from "../pages/Clients/Clients";
import Suppliers from "../pages/Suppliers/Suppliers";
import BankAccounts from "../pages/BankAccounts/BankAccounts";
import Payables from "../pages/Payables/Payables";
import Receivables from "../pages/Receivables/Receivables";
import CreditCards from "../pages/CreditCards/CreditCards";
import Reports from "../pages/Reports/Reports";
import ManagementAccounts from "../pages/ManagementAccounts/ManagementAccounts";
import Cash from "../pages/Cash/Cash";
import CompanySettings from "../pages/Settings/CompanySettings";
import UsersSettings from "../pages/Settings/UsersSettings";
import ProfileSettings from "../pages/Settings/ProfileSettings";
import CompaniesSettings from "../pages/Settings/CompaniesSettings";

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
              element={<Dashboard />}
            />

            <Route
              path="clientes"
              element={<Clients />}
            />

            <Route
              path="fornecedores"
              element={<Suppliers />}
            />

            <Route
              path="bancos"
              element={<BankAccounts />}
            />

            <Route
              path="caixa"
              element={<Cash />}
            />

            <Route
              path="contas-pagar"
              element={<Payables />}
            />

            <Route
              path="contas-receber"
              element={<Receivables />}
            />

            <Route
              path="cartoes"
              element={<CreditCards />}
            />

            <Route
              path="contas-gerenciais"
              element={<ManagementAccounts />}
            />

            <Route
              path="relatorios"
              element={<Reports />}
            />

            <Route
              path="configuracoes"
              element={<Navigate to="/configuracoes/empresa" replace />}
            />

            <Route
              path="configuracoes/empresa"
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