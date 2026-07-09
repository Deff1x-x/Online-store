import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Checkbox, H1, Spinner, TextField } from "@koz/ui";
import { useApi, useLoading, useToast } from "@koz/api";
import { getOtpExpiry, saveAuthFlow } from "../auth/auth-flow";
import { validateName, validatePhone } from "../auth/validation";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { modules } = useApi();
  const { showToast } = useToast();
  const { isLoading, withLoading } = useLoading();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [privacyPolicy, setPrivacyPolicy] = useState(false);
  const [termsOfService, setTermsOfService] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextNameError = validateName(name);
    const nextPhoneError = validatePhone(phone);
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);

    if (nextNameError || nextPhoneError) {
      showToast({
        message: nextNameError ?? nextPhoneError,
        tone: "warning",
      });
      return;
    }

    if (!privacyPolicy || !termsOfService) {
      showToast({
        message: "Необходимо принять политику и пользовательское соглашение.",
        tone: "warning",
      });
      return;
    }

    try {
      const response = await withLoading(() => modules.authApi.sendOtp({ phone }));
      saveAuthFlow({
        intent: "register",
        phone,
        name: name.trim(),
        privacyPolicy,
        termsOfService,
        expiresAt: getOtpExpiry(response.expires_in_seconds),
        returnTo: searchParams.get("returnTo") === "/checkout" ? "/checkout" : undefined,
      });
      navigate("/otp");
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    }
  };

  return (
    <Card className="auth-card auth-card--register" elevated>
      <div className="auth-card__heading">
        <span className="auth-kicker">Новый участник</span>
        <H1>Регистрация</H1>
        <p>Заполните данные, затем подтвердите телефон кодом из SMS</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Имя"
          autoComplete="name"
          value={name}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
        />
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
        <div className="consent-list">
          <Checkbox
            checked={privacyPolicy}
            onChange={(event) => setPrivacyPolicy(event.target.checked)}
            label="Согласен с политикой конфиденциальности"
          />
          <Checkbox
            checked={termsOfService}
            onChange={(event) => setTermsOfService(event.target.checked)}
            label="Принимаю пользовательское соглашение"
          />
        </div>
        <Button
          type="submit"
          fullWidth
          disabled={isLoading}
          leftIcon={isLoading ? <Spinner /> : undefined}
        >
          {isLoading ? "Отправляем код" : "Зарегистрироваться"}
        </Button>
      </form>
      <p className="auth-switch">
        Уже есть аккаунт?{" "}
        <Link to={searchParams.get("returnTo") === "/checkout" ? "/login?returnTo=/checkout" : "/login"}>
          Войти
        </Link>
      </p>
    </Card>
  );
}
