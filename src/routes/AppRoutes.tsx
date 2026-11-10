import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import MainLayout from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/Login/Login";
import Dashboard from "../pages/Dashboard/Dashboard";
import Clients from "../pages/Clients/Clients";
import Suppliers from "../pages/Suppliers/Suppliers";
import BankAccounts from "../pages/BankAccounts/BankAccounts";
import Payables from "../pages/Payables/Payables";
import Receivables from "../pages/Receivables/Receivables";
import CreditCards from "../pages/CreditCards/CreditCards";
import Reports from "../pages/Reports/Reports";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<Login />}
        />

        <Route element={<ProtectedRoute />}>
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
              path="relatorios"
              element={<Reports />}
            />
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