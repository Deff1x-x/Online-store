import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren, type ReactNode } from "react";
import { uuid } from "../utils";

export type ModalState = {
  id: string;
  content: ReactNode;
};

export type ModalContextValue = {
  modal: ModalState | null;
  openModal: (content: ReactNode, id?: string) => string;
  closeModal: () => void;
};

export const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: PropsWithChildren) {
  const [modal, setModal] = useState<ModalState | null>(null);

  const openModal = useCallback((content: ReactNode, id?: string) => {
    const modalId = id ?? uuid();
    setModal({ id: modalId, content });
    return modalId;
  }, []);

  const closeModal = useCallback(() => setModal(null), []);
  const value = useMemo(() => ({ modal, openModal, closeModal }), [closeModal, modal, openModal]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModalContext() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used inside ModalProvider");
  }
  return context;
}
