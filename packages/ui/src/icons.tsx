import type { ComponentProps } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Menu,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";

const iconMap = {
  alert: AlertCircle,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: X,
  loader: Loader2,
  menu: Menu,
  search: Search,
  cart: ShoppingCart,
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
