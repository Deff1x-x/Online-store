import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { LocalStorageAdapter, useToast } from "@koz/api";
import type { StoreProduct } from "../types";

const CART_STORAGE_KEY = "koz.client.cart.v1";
const localStorageAdapter = new LocalStorageAdapter();

export type CartItem = StoreProduct & {
  cartQuantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addProduct: (product: StoreProduct) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeProduct: (productId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readCart(): CartItem[] {
  const serialized = localStorageAdapter.getItem(CART_STORAGE_KEY);
  if (!serialized) return [];

  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorageAdapter.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

function roundWeightedQuantity(quantity: number) {
  return Math.round(quantity * 10) / 10;
}

export function CartProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<CartItem[]>(readCart);
  const { showToast } = useToast();

  useEffect(() => {
    localStorageAdapter.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const notifyStockLimit = useCallback(() => {
    showToast({
      title: "Недостаточно товара",
      message: "Нельзя добавить больше, чем есть в наличии.",
      tone: "warning",
    });
  }, [showToast]);

  const addProduct = useCallback(
    (product: StoreProduct) => {
      const existing = items.find((item) => item.product_id === product.product_id);
      const stock = Number(product.quantity);
      const increment = product.is_weighted ? 0.5 : 1;
      const nextQuantity = (existing?.cartQuantity ?? 0) + increment;

      if (nextQuantity > stock) {
        notifyStockLimit();
        return;
      }

      if (existing) {
        setItems((current) =>
          current.map((item) =>
            item.product_id === product.product_id
              ? { ...item, ...product, cartQuantity: roundWeightedQuantity(nextQuantity) }
              : item,
          ),
        );
        return;
      }

      setItems((current) => [...current, { ...product, cartQuantity: increment }]);
    },
    [items, notifyStockLimit],
  );

  const updateQuantity = useCallback(
    (productId: string, requestedQuantity: number) => {
      const item = items.find((entry) => entry.product_id === productId);
      if (!item || !Number.isFinite(requestedQuantity)) return;

      if (requestedQuantity <= 0) {
        setItems((current) => current.filter((entry) => entry.product_id !== productId));
        return;
      }

      const normalizedQuantity = item.is_weighted
        ? roundWeightedQuantity(requestedQuantity)
        : Math.round(requestedQuantity);

      if (normalizedQuantity > Number(item.quantity)) {
        notifyStockLimit();
        return;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.product_id === productId
            ? { ...entry, cartQuantity: normalizedQuantity }
            : entry,
        ),
      );
    },
    [items, notifyStockLimit],
  );

  const removeProduct = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.product_id !== productId));
  }, []);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, item) => total + Number(item.price_per_unit) * item.cartQuantity,
        0,
      ),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      itemCount: items.length,
      subtotal,
      addProduct,
      updateQuantity,
      removeProduct,
    }),
    [addProduct, items, removeProduct, subtotal, updateQuantity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
