import type { ComponentProps } from "react";
import {
  AlertCircle,
  Apple,
  ArrowRight,
  BadgePercent,
  Beef,
  Carrot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Croissant,
  Gift,
  Loader2,
  Menu,
  Milk,
  Minus,
  PackageOpen,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  X,
} from "lucide-react";

const iconMap = {
  alert: AlertCircle,
  apple: Apple,
  arrowRight: ArrowRight,
  discount: BadgePercent,
  beef: Beef,
  carrot: Carrot,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: X,
  loader: Loader2,
  menu: Menu,
  milk: Milk,
  minus: Minus,
  package: PackageOpen,
  plus: Plus,
  search: Search,
  cart: ShoppingCart,
  store: Store,
  trash: Trash2,
  truck: Truck,
  gift: Gift,
};

export type IconName = keyof typeof iconMap;
export type IconProps = ComponentProps<typeof Check> & {
  name: IconName;
};

export function Icon({ name, "aria-label": ariaLabel, ...props }: IconProps) {
  const IconComponent = iconMap[name];
  return (
    <IconComponent
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      focusable="false"
      {...props}
    />
  );
}
