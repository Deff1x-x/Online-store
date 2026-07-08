import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

type ShellProps = PropsWithChildren<{
  header?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
}>;

type LayoutBlockProps = PropsWithChildren<HTMLAttributes<HTMLElement>>;

export function Header({ className, ...props }: LayoutBlockProps) {
  return <header className={["koz-header", className].filter(Boolean).join(" ")} {...props} />;
}

export function Sidebar({ className, ...props }: LayoutBlockProps) {
  return <aside className={["koz-sidebar", className].filter(Boolean).join(" ")} {...props} />;
}

export function Footer({ className, ...props }: LayoutBlockProps) {
  return <footer className={["koz-footer", className].filter(Boolean).join(" ")} {...props} />;
}

export function PageContainer({ className, ...props }: LayoutBlockProps) {
  return <main className={["koz-page", className].filter(Boolean).join(" ")} {...props} />;
}

export function ContentContainer({ className, ...props }: LayoutBlockProps) {
  return <section className={["koz-content", className].filter(Boolean).join(" ")} {...props} />;
}

function AppShell({ children, header, sidebar, footer, className }: ShellProps & { className: string }) {
  return (
    <div className={className}>
      {header}
      <div className="koz-shell__body">
        {sidebar}
        <div className="koz-shell__content">{children}</div>
      </div>
      {footer}
    </div>
  );
}

export function ClientLayout({ children, header, footer }: ShellProps) {
  return (
    <AppShell
      className="koz-shell koz-shell--client"
      header={header ?? <Header>KOZ</Header>}
      footer={footer}
    >
      {children}
    </AppShell>
  );
}

export function ManagerLayout({ children, header, sidebar, footer }: ShellProps) {
  return (
    <AppShell
      className="koz-shell koz-shell--staff"
      header={header ?? <Header>Manager</Header>}
      sidebar={sidebar ?? <Sidebar />}
      footer={footer}
    >
      {children}
    </AppShell>
  );
}

export function AdminLayout({ children, header, sidebar, footer }: ShellProps) {
  return (
    <AppShell
      className="koz-shell koz-shell--staff"
      header={header ?? <Header>Admin</Header>}
      sidebar={sidebar ?? <Sidebar />}
      footer={footer}
    >
      {children}
    </AppShell>
  );
}

export function AuthLayout({ children }: PropsWithChildren) {
  return <div className="koz-auth-layout">{children}</div>;
}
