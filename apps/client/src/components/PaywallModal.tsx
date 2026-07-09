import { Button, Icon, Modal, Spinner } from "@koz/ui";

const BENEFITS = [
  {
    icon: "discount" as const,
    title: "Оптовые цены",
    text: "Клубная цена на товары каждый день",
  },
  {
    icon: "truck" as const,
    title: "Доставка 15–20 минут",
    text: "Продукты из ближайшего даркстора",
  },
  {
    icon: "gift" as const,
    title: "3 000 ₸ на первый заказ",
    text: "Приветственный бонус участника клуба",
  },
];

type PaywallModalProps = {
  isLoading: boolean;
  onClose: () => void;
  onSubscribe: () => void;
};

export function PaywallModal({ isLoading, onClose, onSubscribe }: PaywallModalProps) {
  return (
    <Modal
      open
      className="paywall-modal"
      title="Членство в Клубе"
      onClose={onClose}
      footer={
        <Button
          type="button"
          size="lg"
          fullWidth
          disabled={isLoading}
          leftIcon={isLoading ? <Spinner /> : undefined}
          onClick={onSubscribe}
        >
          {isLoading ? "Подключаем членство" : "Оплатить 3 900 ₸"}
        </Button>
      }
    >
      <div className="paywall">
        <div className="paywall__price">
          <strong>3 900 ₸</strong>
          <span>/мес</span>
        </div>
        <ul className="paywall__benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title}>
              <span className="paywall__benefit-icon">
                <Icon name={benefit.icon} size={24} />
              </span>
              <span>
                <strong>{benefit.title}</strong>
                <small>{benefit.text}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
