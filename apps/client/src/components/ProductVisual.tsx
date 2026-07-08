import { Icon, type IconName } from "@koz/ui";
import type { ProductCategory } from "../types";

const CATEGORY_ICONS: Record<ProductCategory, IconName> = {
  vegetables: "carrot",
  fruits: "apple",
  dairy: "milk",
  meat: "beef",
  bakery: "croissant",
  other: "package",
};

type ProductVisualProps = {
  category: ProductCategory;
  compact?: boolean;
};

export function ProductVisual({ category, compact = false }: ProductVisualProps) {
  return (
    <div className={compact ? "product-visual product-visual--compact" : "product-visual"}>
      <Icon name={CATEGORY_ICONS[category]} aria-label="" />
    </div>
  );
}
