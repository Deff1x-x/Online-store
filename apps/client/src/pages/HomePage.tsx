import { useNavigate } from "react-router-dom";
import { Button, Display, Icon } from "@koz/ui";
import { useModal } from "@koz/api";
import { PaywallModal } from "../components/PaywallModal";

const BENEFITS = [
  {
    icon: "truck" as const,
    title: "15–20 минут",
    text: "Доставка бесплатно от 5 000 ₸",
  },
  {
    icon: "gift" as const,
    title: "3 000 ₸ в подарок",
    text: "На первый заказ",
  },
  {
    icon: "discount" as const,
    title: "Цены ниже рынка",
    text: "Для участников клуба",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { openModal } = useModal();

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero__inner">
          <p className="home-hero__eyebrow">КЛУБ ОПТОВЫХ ЦЕН</p>
          <Display className="home-hero__title">
            Оптовые цены прямо к вашей двери
          </Display>
          <div className="benefit-grid">
            {BENEFITS.map((benefit) => (
              <article className="benefit" key={benefit.title}>
                <Icon name={benefit.icon} size={28} />
                <strong>{benefit.title}</strong>
                <span>{benefit.text}</span>
              </article>
            ))}
          </div>
          <div className="home-actions">
            <Button
              type="button"
              size="lg"
              onClick={() => openModal(<PaywallModal />, "subscription-paywall")}
            >
              Вступить в клуб — 3 900 ₸/мес
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              rightIcon={<Icon name="arrowRight" size={20} />}
              onClick={() => navigate("/shop")}
            >
              Сначала посмотреть цены
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
