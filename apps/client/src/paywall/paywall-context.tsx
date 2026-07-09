import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  APIError,
  SessionStorageAdapter,
  useApi,
  useAuth,
  useToast,
} from "@koz/api";
import { ThemeProvider } from "@koz/ui";
import { PaywallModal } from "../components/PaywallModal";

const PAYWALL_REQUEST_EVENT = "koz:open-paywall";
const PENDING_PAYWALL_KEY = "koz.client.pending-paywall.v1";
const pendingPaywallStorage = new SessionStorageAdapter();

type PaywallContextValue = {
  isPaywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
};

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function requestPaywall() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PAYWALL_REQUEST_EVENT));
  }
}

export function PaywallProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { modules } = useApi();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const closePaywall = useCallback(() => {
    if (!isLoading) {
      setIsPaywallOpen(false);
    }
  }, [isLoading]);

  const openPaywall = useCallback(() => {
    if (!accessToken) {
      pendingPaywallStorage.setItem(PENDING_PAYWALL_KEY, "true");
      setIsPaywallOpen(false);
      navigate("/login");
      return;
    }

    setIsPaywallOpen(true);
  }, [accessToken, navigate]);

  useEffect(() => {
    const handlePaywallRequest = () => openPaywall();
    window.addEventListener(PAYWALL_REQUEST_EVENT, handlePaywallRequest);
    return () => window.removeEventListener(PAYWALL_REQUEST_EVENT, handlePaywallRequest);
  }, [openPaywall]);

  useEffect(() => {
    if (accessToken && pendingPaywallStorage.getItem(PENDING_PAYWALL_KEY)) {
      pendingPaywallStorage.removeItem(PENDING_PAYWALL_KEY);
      setIsPaywallOpen(true);
    }
  }, [accessToken]);

  const handleSubscribe = useCallback(async () => {
    if (!accessToken) {
      openPaywall();
      return;
    }

    setIsLoading(true);
    try {
      await modules.subscriptionsApi.create(
        { amount: 3900, billing_period: "monthly" },
        { suppressErrorNotification: true },
      );
      setIsPaywallOpen(false);
      showToast({
        message: "Членство в Клубе успешно активировано",
        tone: "success",
      });
    } catch (error) {
      if (
        error instanceof APIError &&
        (error.status === 409 || error.code === "subscription_already_active")
      ) {
        setIsPaywallOpen(false);
        showToast({
          message: "Подписка уже активна",
          tone: "success",
        });
      } else {
        showToast({
          message: error instanceof Error ? error.message : "Не удалось активировать подписку",
          tone: "danger",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, modules.subscriptionsApi, openPaywall, showToast]);

  const value = useMemo(
    () => ({ isPaywallOpen, openPaywall, closePaywall }),
    [closePaywall, isPaywallOpen, openPaywall],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      {isPaywallOpen ? (
        <ThemeProvider>
          <PaywallModal
            isLoading={isLoading}
            onClose={closePaywall}
            onSubscribe={handleSubscribe}
          />
        </ThemeProvider>
      ) : null}
    </PaywallContext.Provider>
  );
}

export function usePaywall() {
  const context = useContext(PaywallContext);
  if (!context) {
    throw new Error("usePaywall must be used inside PaywallProvider");
  }
  return context;
}
