import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, H1, Spinner, TextField } from "@koz/ui";
import { useApi, useLoading, useToast } from "@koz/api";
import { getOtpExpiry, saveAuthFlow } from "../auth/auth-flow";
import { validatePhone } from "../auth/validation";

export function LoginPage() {
  const navigate = useNavigate();
  const { modules } = useApi();
  const { showToast } = useToast();
  const { isLoading, withLoading } = useLoading();
  const [phone, setPhone] = useState("+7");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validatePhone(phone);
    setPhoneError(validationError);

    if (validationError) {
      showToast({ message: validationError, tone: "warning" });
      return;
    }

    try {
      const response = await withLoading(() => modules.authApi.sendOtp({ phone }));
      saveAuthFlow({
        intent: "login",
        phone,
        expiresAt: getOtpExpiry(response.expires_in_seconds),
      });
      navigate("/otp");
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    }
  };

  return (
    <Card className="auth-card" elevated>
      <div className="auth-card__heading">
        <span className="auth-kicker">Вход в клуб</span>
        <H1>Введите телефон</H1>
        <p>Код придёт по SMS</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Телефон"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+77001234567"
          value={phone}
          error={phoneError}
          onChange={(event) => {
            setPhone(event.target.value.replace(/\s/g, ""));
            setPhoneError(null);
          }}
        />
        <Button
          type="submit"
          fullWidth
          disabled={isLoading}
          leftIcon={isLoading ? <Spinner /> : undefined}
        >
          {isLoading ? "Отправляем код" : "Получить код"}
        </Button>
      </form>
      <p className="auth-switch">
        Впервые в клубе? <Link to="/register">Зарегистрироваться</Link>
      </p>
    </Card>
  );
}
