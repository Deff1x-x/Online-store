import { Button, EmptyState } from "@koz/ui";
import { useAuth } from "@koz/api";

export function AccessDeniedPage({
  title = "Доступ закрыт",
  description = "Эта зона доступна только менеджеру точки.",
}: {
  title?: string;
  description?: string;
}) {
  const { logout } = useAuth();

  return (
    <div className="staff-state-page">
      <EmptyState
        title={title}
        description={description}
        action={
          <Button type="button" onClick={() => logout()}>
            Войти другим пользователем
          </Button>
        }
      />
    </div>
  );
}
