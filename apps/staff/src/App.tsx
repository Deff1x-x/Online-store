import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "@koz/ui";
import { useAuth } from "@koz/api";
import { StaffShell } from "./components/StaffShell";
import { ToastViewport } from "./components/ToastViewport";
import { AccessDeniedPage } from "./pages/AccessDeniedPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerDashboardPage } from "./pages/ManagerDashboardPage";
import { ManagerOrdersPage } from "./pages/ManagerOrdersPage";
import { ManagerStockPage } from "./pages/ManagerStockPage";
import "./styles.css";

type SessionUser = {
  id?: string | number;
  email?: string;
  role?: string;
  store_id?: string | number | null;
};

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

function AdminPlaceholder() {
  return (
    <AccessDeniedPage
      title="Админ-зона"
      description="Вход выполнен, но раздел admin-lite относится к следующему этапу."
    />
  );
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
        <Route path="/admin" element={<AdminPlaceholder />} />
        <Route path="/" element={<Navigate to="/manager/orders" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ToastViewport />
    </ThemeProvider>
  );
}
