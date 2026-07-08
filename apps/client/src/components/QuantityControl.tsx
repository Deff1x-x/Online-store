import { useEffect, useState, type KeyboardEvent } from "react";
import { Icon, Input } from "@koz/ui";

type QuantityControlProps = {
  quantity: number;
  isWeighted: boolean;
  onChange: (quantity: number) => void;
};

export function QuantityControl({
  quantity,
  isWeighted,
  onChange,
}: QuantityControlProps) {
  const step = isWeighted ? 0.5 : 1;
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(",", "."));
    if (draft.trim() && Number.isFinite(parsed)) {
      onChange(parsed);
      return;
    }
    setDraft(String(quantity));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  return (
    <div className="quantity-control">
      <button
        className="quantity-control__button"
        type="button"
        aria-label="Уменьшить количество"
        onClick={() => onChange(quantity - step)}
      >
        <Icon name="minus" size={18} />
      </button>
      <Input
        className="quantity-control__input"
        type="number"
        min={isWeighted ? 0.1 : 1}
        step={isWeighted ? 0.1 : 1}
        inputMode="decimal"
        aria-label={isWeighted ? "Количество в килограммах" : "Количество в штуках"}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
      />
      <span className="quantity-control__unit">{isWeighted ? "кг" : "шт"}</span>
      <button
        className="quantity-control__button"
        type="button"
        aria-label="Увеличить количество"
        onClick={() => onChange(quantity + step)}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
