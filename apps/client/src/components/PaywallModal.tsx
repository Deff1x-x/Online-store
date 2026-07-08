import { Button, Modal } from "@koz/ui";
import { useModal } from "@koz/api";

export function PaywallModal() {
  const { closeModal } = useModal();

  return (
    <Modal
      open
      title="Клуб оптовых цен"
      onClose={closeModal}
      footer={
        <Button type="button" fullWidth onClick={closeModal}>
          Понятно
        </Button>
      }
    >
      <p className="paywall-copy">
        Оплата подписки появится на следующем этапе. Сейчас можно свободно посмотреть
        витрину и цены.
      </p>
    </Modal>
  );
}
