import { Outlet, useLocation } from "react-router-dom";
import { ClientLayout, Footer, ThemeProvider } from "@koz/ui";
import { useModal } from "@koz/api";
import { AppHeader } from "./AppHeader";
import { CartIndicator } from "./CartIndicator";
import { ToastViewport } from "./ToastViewport";

export function AppLayout() {
  const { modal } = useModal();
  const { pathname } = useLocation();
  const showCartIndicator = !["/checkout", "/order-success", "/orders", "/profile"].includes(
    pathname,
  );

  return (
    <ThemeProvider>
      <ClientLayout
        header={<AppHeader />}
        footer={<Footer className="client-footer">Клуб Оптовых Цен</Footer>}
      >
        <Outlet />
      </ClientLayout>
      {showCartIndicator ? <CartIndicator /> : null}
      <ToastViewport />
      {modal?.content}
    </ThemeProvider>
  );
}
