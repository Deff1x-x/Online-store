import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthLayout, Button, Card, H1, Spinner, TextField } from "@koz/ui";
import { useAuth, useLoading, useToast } from "@koz/api";

type LocationState = {
  from?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const { login } = useAuth();
  const { showToast } = useToast();
  const { isLoading, withLoading } = useLoading();
  const [email, setEmail] = useState("manager@koz.kz");
  const [password, setPassword] = useState("Manager123");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      showToast({ message: "Введите email и пароль.", tone: "warning" });
      return;
    }

    try {
      const response = await withLoading(() =>
        login(
          {
            email: email.trim(),
            password,
          },
          "staff",
        ),
      );
      const role = response.user?.role;

      if (role === "store_operator") {
        navigate(state?.from?.startsWith("/manager") ? state.from : "/manager/orders", { replace: true });
        return;
      }

      if (role?.startsWith("admin_")) {
        navigate("/admin", { replace: true });
        return;
      }

      showToast({ message: "Для этой роли нет staff-маршрута.", tone: "danger" });
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    }
  };

  return (
    <div className="staff-login-page">
      <header className="staff-login-topbar">
        <div className="staff-brand staff-brand--dark">
          <strong>КЛУБ</strong>
          <span>Оптовых Цен</span>
        </div>
      </header>
      <AuthLayout>
        <Card className="staff-login-card" elevated>
          <div className="staff-login-card__heading">
            <H1>Вход</H1>
            <p>Кабинет менеджера точки</p>
          </div>
          <form className="staff-login-form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="manager@koz.kz"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              label="Пароль"
              type="password"
              autoComplete="current-password"
              placeholder="Manager123"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" fullWidth disabled={isLoading} leftIcon={isLoading ? <Spinner /> : undefined}>
              {isLoading ? "Входим" : "Войти"}
            </Button>
          </form>
        </Card>
      </AuthLayout>
    </div>
  );
}
