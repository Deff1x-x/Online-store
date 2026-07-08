import { Outlet } from "react-router-dom";
import { ClientLayout, Footer, ThemeProvider } from "@koz/ui";
import { useModal } from "@koz/api";
import { AppHeader } from "./AppHeader";
import { CartIndicator } from "./CartIndicator";
import { ToastViewport } from "./ToastViewport";

export function AppLayout() {
  const { modal } = useModal();

  return (
    <ThemeProvider>
      <ClientLayout
        header={<AppHeader />}
        footer={<Footer className="client-footer">Клуб Оптовых Цен</Footer>}
      >
        <Outlet />
      </ClientLayout>
      <CartIndicator />
      <ToastViewport />
      {modal?.content}
    </ThemeProvider>
  );
}
