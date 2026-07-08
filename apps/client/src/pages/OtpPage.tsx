import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, Card, H1, Spinner, TextField } from "@koz/ui";
import {
  APIError,
  useApi,
  useAuth,
  useLoading,
  useToast,
} from "@koz/api";
import {
  clearAuthFlow,
  getOtpExpiry,
  readAuthFlow,
  saveAuthFlow,
  type AuthFlow,
} from "../auth/auth-flow";
import { validateOtp } from "../auth/validation";

const DEFAULT_STORE_ID = "11111111-1111-1111-1111-111111111111";

function getRemainingSeconds(flow: AuthFlow) {
  return Math.max(0, Math.ceil((flow.expiresAt - Date.now()) / 1000));
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function OtpPage() {
  const navigate = useNavigate();
  const { modules } = useApi();
  const { login, setToken } = useAuth();
  const { showToast } = useToast();
  const submitLoading = useLoading();
  const resendLoading = useLoading();
  const [flow, setFlow] = useState<AuthFlow | null>(readAuthFlow);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    flow ? getRemainingSeconds(flow) : 0,
  );

  useEffect(() => {
    if (!flow) return;

    const updateTimer = () => {
      setRemainingSeconds(getRemainingSeconds(flow));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(interval);
  }, [flow]);

  if (!flow) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateOtp(code);
    setCodeError(validationError);

    if (validationError) {
      showToast({ message: validationError, tone: "warning" });
      return;
    }

    try {
      await submitLoading.withLoading(async () => {
        if (flow.intent === "register") {
          const response = await modules.authApi.register({
            phone: flow.phone,
            code,
            name: flow.name ?? "",
            store_id: import.meta.env.VITE_STORE_ID ?? DEFAULT_STORE_ID,
            privacy_policy: flow.privacyPolicy === true,
            terms_of_service: flow.termsOfService === true,
          });
          setToken(response.token, response.refresh_token);
        } else {
          await login({ phone: flow.phone, code });
        }
      });

      clearAuthFlow();
      navigate("/shop", { replace: true });
    } catch (error) {
      if (error instanceof APIError && error.code === "consents_required") {
        showToast({
          message: "Необходимо принять политику и пользовательское соглашение.",
          tone: "danger",
        });
      }
    }
  };

  const handleResend = async () => {
    try {
      const response = await resendLoading.withLoading(() =>
        modules.authApi.sendOtp({ phone: flow.phone }),
      );
      const nextFlow = {
        ...flow,
        expiresAt: getOtpExpiry(response.expires_in_seconds),
      };
      saveAuthFlow(nextFlow);
      setFlow(nextFlow);
      setRemainingSeconds(response.expires_in_seconds);
      showToast({ message: "Новый код отправлен.", tone: "success" });
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    }
  };

  const backPath = flow.intent === "register" ? "/register" : "/login";

  return (
    <Card className="auth-card" elevated>
      <div className="auth-card__heading">
        <span className="auth-kicker">Подтверждение телефона</span>
        <H1>Введите код</H1>
        <p>
          Код отправлен на <strong>{flow.phone}</strong>
        </p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <TextField
          className="otp-input"
          label="Код из SMS"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={4}
          placeholder="0000"
          value={code}
          error={codeError}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 4));
            setCodeError(null);
          }}
        />
        <Button
          type="submit"
          fullWidth
          disabled={submitLoading.isLoading}
          leftIcon={submitLoading.isLoading ? <Spinner /> : undefined}
        >
          {submitLoading.isLoading
            ? flow.intent === "register"
              ? "Регистрируем"
              : "Входим"
            : flow.intent === "register"
              ? "Подтвердить и зарегистрироваться"
              : "Войти"}
        </Button>
        <div className="otp-resend">
          <span>
            {remainingSeconds > 0
              ? `Отправить повторно через ${formatTimer(remainingSeconds)}`
              : "Код не пришёл?"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={remainingSeconds > 0 || resendLoading.isLoading}
            leftIcon={resendLoading.isLoading ? <Spinner /> : undefined}
            onClick={handleResend}
          >
            {resendLoading.isLoading ? "Отправляем" : "Отправить повторно"}
          </Button>
        </div>
      </form>
      <p className="auth-switch">
        <Link to={backPath}>Изменить данные</Link>
      </p>
    </Card>
  );
}
