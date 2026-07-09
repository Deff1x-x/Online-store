import { NavLink } from "react-router-dom";
import { Button, Header, Icon, ManagerLayout, PageContainer, Sidebar } from "@koz/ui";
import { useAuth } from "@koz/api";

type StaffShellProps = {
  user: {
    email?: string;
    store_id?: string | number | null;
  } | null;
  children: JSX.Element;
};

const today = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

export function StaffShell({ user, children }: StaffShellProps) {
  const { logout } = useAuth();
  const storeName = user?.store_id ? `Магазин - ${user.store_id}` : "Магазин";

  const header = (
    <Header className="staff-topbar">
      <div className="staff-brand">
        <strong>КЛУБ</strong>
        <span>Оптовых Цен</span>
      </div>
      <div className="staff-topbar__meta">
        <span>{today}</span>
        <span>{storeName}</span>
        <span>{user?.email ?? "Менеджер"}</span>
      </div>
    </Header>
  );

  const sidebar = (
    <Sidebar className="staff-sidebar">
      <div className="staff-sidebar__title">{storeName}</div>
      <nav className="staff-nav" aria-label="Навигация менеджера">
        <NavLink to="/manager" end>
          Дашборд
        </NavLink>
        <NavLink to="/manager/orders">Заказы</NavLink>
        <NavLink to="/manager/stock">Остатки</NavLink>
      </nav>
      <Button
        type="button"
        variant="ghost"
        className="staff-logout"
        leftIcon={<Icon name="close" size={18} />}
        onClick={() => logout({ redirect: false })}
      >
        Выйти
      </Button>
    </Sidebar>
  );

  return (
    <ManagerLayout header={header} sidebar={sidebar}>
      <PageContainer className="staff-page">{children}</PageContainer>
    </ManagerLayout>
  );
}
