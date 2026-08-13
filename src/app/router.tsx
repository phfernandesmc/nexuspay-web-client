import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/session.store";
import { useSessionBootstrap } from "@/features/auth/useSessionBootstrap";
import LoginPage from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import HomePage from "@/pages/HomePage";
import AppShell from "@/components/layout/AppShell";
import AccountsPage from "@/features/account/AccountsPage";
import AccountDetailPage from "@/features/account/AccountDetailPage";

function TelaDeCarga() {
  const { t } = useTranslation("common");
  return <p className="p-8 text-center">{t("common:loading")}</p>;
}

export default function Router() {
  useSessionBootstrap();
  const status = useSession((estado) => estado.status);

  // Enquanto o refresh silencioso nao responder, nao existe resposta certa
  // para "esta autenticado?" — e chutar que nao faz o login piscar.
  if (status === "booting") return <TelaDeCarga />;

  const autenticado = status === "authenticated";

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={autenticado ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={autenticado ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/"
          element={
            autenticado ? (
              <AppShell>
                <HomePage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/contas"
          element={
            autenticado ? (
              <AppShell>
                <AccountsPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/contas/:id"
          element={
            autenticado ? (
              <AppShell>
                <AccountDetailPage />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={autenticado ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
