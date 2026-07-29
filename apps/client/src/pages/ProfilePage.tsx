import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  H1,
  H2,
  Loader,
  Modal,
  PageContainer,
  Spinner,
  TextField,
} from "@koz/ui";
import { useApi, useAuth, useToast, type CustomerAddress } from "@koz/api";
import { usePaywall } from "../paywall/paywall-context";
import { isSubscriptionInGracePeriod } from "../subscription/access-rules";

type SubscriptionStatus = "active" | "paused" | "cancelled" | "expired";

type CustomerProfile = {
  user: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
  };
  customer: {
    id: string;
  };
  subscription_status: SubscriptionStatus;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  subscription_auto_renew: boolean;
};

const SUBSCRIPTION_LABELS: Record<SubscriptionStatus, string> = {
  active: "Активна",
  paused: "Приостановлена",
  cancelled: "Отменена",
  expired: "Истекла",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAddress(address: CustomerAddress) {
  const details = [
    address.entrance ? `подъезд ${address.entrance}` : null,
    address.floor ? `этаж ${address.floor}` : null,
    address.apartment ? `кв. ${address.apartment}` : null,
  ].filter(Boolean);
  return [address.coverage_address, ...details].join(", ");
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { accessToken, logout } = useAuth();
  const { modules } = useApi();
  const { showToast } = useToast();
  const { openPaywall } = usePaywall();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(accessToken));
  const [isSaving, setIsSaving] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<CustomerAddress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCancelSubscription, setShowCancelSubscription] = useState(false);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    Promise.all([
      modules.profileApi.get(),
      modules.addressesApi.list(),
    ])
      .then(([profileResponse, addressesResponse]) => {
        if (!active) return;
        setProfile(profileResponse.profile);
        setName(profileResponse.profile.user.name ?? "");
        setEmail(profileResponse.profile.user.email ?? "");
        setAddresses(addressesResponse.addresses ?? []);
      })
      .catch(() => {
        // API errors are displayed by the shared ToastContext bridge.
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, modules.addressesApi, modules.profileApi]);

  if (!accessToken) {
    return <Navigate to="/login?returnTo=/profile" replace />;
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextNameError = name.trim() ? null : "Введите имя";
    const nextEmailError =
      email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Введите корректный email"
        : null;
    setNameError(nextNameError);
    setEmailError(nextEmailError);

    if (nextNameError || nextEmailError) {
      showToast({ message: nextNameError ?? nextEmailError, tone: "warning" });
      return;
    }

    setIsSaving(true);
    try {
      const response = await modules.profileApi.update({
        name: name.trim(),
        email: email.trim(),
      });
      setProfile(response.profile);
      setName(response.profile.user.name ?? "");
      setEmail(response.profile.user.email ?? "");
      showToast({ message: "Профиль обновлён", tone: "success" });
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async () => {
    if (!addressToDelete) return;

    setIsDeleting(true);
    try {
      await modules.addressesApi.remove(addressToDelete.id);
      const response = await modules.addressesApi.list();
      setAddresses(response.addresses ?? []);
      setAddressToDelete(null);
      showToast({ message: "Адрес удалён", tone: "success" });
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!profile) return;

    setIsCancellingSubscription(true);
    try {
      await modules.subscriptionsApi.cancel(profile.customer.id, { immediate: false });
      const response = await modules.profileApi.get();
      setProfile(response.profile);
      setShowCancelSubscription(false);
      showToast({
        message: "Автопродление отключено. Доступ сохранён до конца периода.",
        tone: "success",
      });
    } catch {
      // API errors are displayed by the shared ToastContext bridge.
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  const handleLogout = () => {
    logout({ redirect: false });
    navigate("/", { replace: true });
  };

  if (isLoading) {
    return (
      <PageContainer className="profile-page">
        <Loader label="Загружаем профиль" />
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer className="profile-page">
        <EmptyState
          title="Профиль не найден"
          action={
            <Button type="button" onClick={() => navigate("/")}>
              На главную
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const isActiveSubscription = profile.subscription_status === "active";
  const inGrace = isSubscriptionInGracePeriod(
    profile.subscription_status,
    profile.subscription_end_date,
  );

  return (
    <PageContainer className="profile-page">
      <header className="profile-heading">
        <Avatar name={profile.user.name ?? "Участник клуба"} />
        <div>
          <span className="page-kicker">Личный кабинет</span>
          <H1>{profile.user.name || "Участник клуба"}</H1>
          <span>{profile.user.phone}</span>
        </div>
        <Button type="button" variant="danger" onClick={handleLogout}>
          Выйти
        </Button>
      </header>

      <div className="profile-layout">
        <div className="profile-main">
          <Card className="profile-card">
            <H2>Личные данные</H2>
            <form className="profile-form" onSubmit={handleProfileSubmit} noValidate>
              <TextField
                label="Имя"
                autoComplete="name"
                value={name}
                error={nameError}
                disabled={isSaving}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
              />
              <TextField
                label="Телефон"
                type="tel"
                value={profile.user.phone}
                readOnly
              />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                error={emailError}
                disabled={isSaving}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
              />
              <Button
                type="submit"
                disabled={isSaving}
                leftIcon={isSaving ? <Spinner /> : undefined}
              >
                {isSaving ? "Сохраняем" : "Сохранить изменения"}
              </Button>
            </form>
          </Card>

          <Card className="profile-card">
            <div className="profile-card__heading">
              <H2>Адреса доставки</H2>
              <span>{addresses.length}</span>
            </div>
            {addresses.length === 0 ? (
              <p className="profile-empty-copy">Адресов пока нет</p>
            ) : (
              <div className="profile-addresses">
                {addresses.map((address) => (
                  <article className="profile-address" key={address.id}>
                    <div>
                      <strong>{formatAddress(address)}</strong>
                      {address.entrance_code ? (
                        <span>Код домофона: {address.entrance_code}</span>
                      ) : null}
                      {address.is_default ? <Badge tone="success">По умолчанию</Badge> : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => setAddressToDelete(address)}
                    >
                      Удалить
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="profile-sidebar">
          <Card className="profile-card subscription-card">
            <div className="profile-card__heading">
              <H2>Членство</H2>
              <Badge tone={isActiveSubscription ? "success" : "warning"}>
                {inGrace
                  ? "Льготный период (3 дня)"
                  : SUBSCRIPTION_LABELS[profile.subscription_status]}
              </Badge>
            </div>
            <dl className="subscription-details">
              <div>
                <dt>Действует до</dt>
                <dd>{formatDate(profile.subscription_end_date)}</dd>
              </div>
              <div>
                <dt>Автопродление</dt>
                <dd>{profile.subscription_auto_renew ? "Включено" : "Отключено"}</dd>
              </div>
            </dl>
            {inGrace ? (
              <p className="subscription-card__note">
                Оплаченный период закончился: заказы доступны ещё 3 дня (grace). Повторное
                списание выполняется токеном у платёжного провайдера.
              </p>
            ) : null}
            {!isActiveSubscription ? (
              <Button type="button" fullWidth onClick={openPaywall}>
                Вступить в клуб
              </Button>
            ) : profile.subscription_auto_renew ? (
              <Button
                type="button"
                fullWidth
                variant="secondary"
                onClick={() => setShowCancelSubscription(true)}
              >
                Отменить подписку
              </Button>
            ) : (
              <p className="subscription-card__note">
                Доступ сохранится до конца оплаченного периода
              </p>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={Boolean(addressToDelete)}
        className="confirm-modal"
        title="Удалить адрес?"
        onClose={isDeleting ? undefined : () => setAddressToDelete(null)}
        footer={
          <div className="confirm-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={isDeleting}
              onClick={() => setAddressToDelete(null)}
            >
              Оставить
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isDeleting}
              leftIcon={isDeleting ? <Spinner /> : undefined}
              onClick={handleDeleteAddress}
            >
              {isDeleting ? "Удаляем" : "Удалить"}
            </Button>
          </div>
        }
      >
        <p>Адрес исчезнет из списка сохранённых адресов.</p>
      </Modal>

      <Modal
        open={showCancelSubscription}
        className="confirm-modal"
        title="Отменить подписку?"
        onClose={
          isCancellingSubscription ? undefined : () => setShowCancelSubscription(false)
        }
        footer={
          <div className="confirm-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={isCancellingSubscription}
              onClick={() => setShowCancelSubscription(false)}
            >
              Оставить подписку
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isCancellingSubscription}
              leftIcon={isCancellingSubscription ? <Spinner /> : undefined}
              onClick={handleCancelSubscription}
            >
              {isCancellingSubscription ? "Отменяем" : "Отменить подписку"}
            </Button>
          </div>
        }
      >
        <p>Доступ сохранится до конца оплаченного периода</p>
      </Modal>
    </PageContainer>
  );
}
