import { NavLink } from "react-router-dom";
import { AdminLayout, Button, Header, Icon, PageContainer, Sidebar } from "@koz/ui";
import { useAuth } from "@koz/api";

type AdminShellProps = {
  user: {
    email?: string;
  } | null;
  children: JSX.Element;
};

const today = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

export function AdminShell({ user, children }: AdminShellProps) {
  const { logout } = useAuth();

  const header = (
    <Header className="staff-topbar">
      <div className="staff-brand">
        <strong>КЛУБ</strong>
        <span>Оптовых Цен</span>
      </div>
      <div className="staff-topbar__meta">
        <span>{today}</span>
        <span>Администратор</span>
        <span>{user?.email ?? "Администратор"}</span>
      </div>
    </Header>
  );

  const sidebar = (
    <Sidebar className="staff-sidebar">
      <div className="staff-sidebar__title">Администрирование</div>
      <nav className="staff-nav" aria-label="Навигация администратора">
        <NavLink to="/admin/catalog">Каталог</NavLink>
        <NavLink to="/admin/customers">Клиенты</NavLink>
        <NavLink to="/admin/operations">Операции</NavLink>
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
    <AdminLayout header={header} sidebar={sidebar}>
      <PageContainer className="staff-page">{children}</PageContainer>
    </AdminLayout>
  );
}
