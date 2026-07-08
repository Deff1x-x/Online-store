import { Outlet } from "react-router-dom";
import { AuthLayout, ClientLayout, ThemeProvider } from "@koz/ui";
import { AppHeader } from "./AppHeader";
import { ToastViewport } from "./ToastViewport";

export function AuthRouteLayout() {
  return (
    <ThemeProvider>
      <div className="auth-page-shell">
        <ClientLayout header={<AppHeader />}>
          <AuthLayout>
            <Outlet />
          </AuthLayout>
        </ClientLayout>
        <ToastViewport />
      </div>
    </ThemeProvider>
  );
}
