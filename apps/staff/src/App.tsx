import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader, ThemeProvider } from "@koz/ui";
import { useAuth } from "@koz/api";
import { AdminShell } from "./components/AdminShell";
import { StaffShell } from "./components/StaffShell";
import { ToastViewport } from "./components/ToastViewport";
import { AccessDeniedPage } from "./pages/AccessDeniedPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerDashboardPage } from "./pages/ManagerDashboardPage";
import { ManagerOrdersPage } from "./pages/ManagerOrdersPage";
import { ManagerStockPage } from "./pages/ManagerStockPage";
import "./styles.css";

const AdminCatalogPage = lazy(() => import("./pages/AdminCatalogPage"));
const AdminCustomersPage = lazy(() => import("./pages/AdminCustomersPage"));
const AdminOperationsPage = lazy(() => import("./pages/AdminOperationsPage"));

type SessionUser = {
  id?: string | number;
  email?: string;
  role?: string;
  store_id?: string | number | null;
};

type AdminRole = "admin_catalog" | "admin_customers" | "admin_operations";

const adminRouteByRole: Record<AdminRole, string> = {
  admin_catalog: "/admin/catalog",
  admin_customers: "/admin/customers",
  admin_operations: "/admin/operations",
};

function isAdminRole(role?: string): role is AdminRole {
  return role === "admin_catalog" || role === "admin_customers" || role === "admin_operations";
}

function readTokenPayload(token: string | null): SessionUser | null {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded) as SessionUser;
  } catch {
    return null;
  }
}

function RequireManager({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const { accessToken } = useAuth();
  const user = readTokenPayload(accessToken);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user?.role !== "store_operator") {
    return <AccessDeniedPage />;
  }

  return <StaffShell user={user}>{children}</StaffShell>;
}

function RequireAdmin({ role, children }: { role: AdminRole; children: JSX.Element }) {
  const location = useLocation();
  const { accessToken } = useAuth();
  const user = readTokenPayload(accessToken);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdminRole(user?.role) || user.role !== role) {
    return (
      <AccessDeniedPage
        title="Доступ закрыт"
        description="Для этого раздела требуется соответствующая роль администратора."
      />
    );
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}

function AdminIndexRedirect() {
  const location = useLocation();
  const { accessToken } = useAuth();
  const user = readTokenPayload(accessToken);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdminRole(user?.role)) {
    return <AccessDeniedPage title="Доступ закрыт" description="Эта зона доступна только администраторам." />;
  }

  return <Navigate to={adminRouteByRole[user.role]} replace />;
}

function AdminRouteLoading() {
  return <Loader label="Загружаем раздел" />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/manager"
          element={
            <RequireManager>
              <ManagerDashboardPage />
            </RequireManager>
          }
        />
        <Route
          path="/manager/orders"
          element={
            <RequireManager>
              <ManagerOrdersPage />
            </RequireManager>
          }
        />
        <Route
          path="/manager/stock"
          element={
            <RequireManager>
              <ManagerStockPage />
            </RequireManager>
          }
        />
        <Route path="/admin" element={<AdminIndexRedirect />} />
        <Route
          path="/admin/catalog"
          element={
            <RequireAdmin role="admin_catalog">
              <Suspense fallback={<AdminRouteLoading />}>
                <AdminCatalogPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/customers"
          element={
            <RequireAdmin role="admin_customers">
              <Suspense fallback={<AdminRouteLoading />}>
                <AdminCustomersPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/operations"
          element={
            <RequireAdmin role="admin_operations">
              <Suspense fallback={<AdminRouteLoading />}>
                <AdminOperationsPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route path="/" element={<Navigate to="/manager/orders" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ToastViewport />
    </ThemeProvider>
  );
}
