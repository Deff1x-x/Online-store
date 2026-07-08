export type ProductCategory =
  | "vegetables"
  | "fruits"
  | "dairy"
  | "meat"
  | "bakery"
  | "other";

export type ProductUnit = "kg" | "pcs" | "l";

export type StoreProduct = {
  product_id: string;
  inventory_id: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  is_weighted: boolean;
  price_per_unit: string | number;
  selling_price: string | number | null;
  quantity: string | number;
  status: "available" | "low_stock" | "out_of_stock";
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  vegetables: "Овощи",
  fruits: "Фрукты и ягоды",
  dairy: "Молочные продукты",
  meat: "Мясо",
  bakery: "Выпечка",
  other: "Другое",
};

export const CATEGORY_ORDER: ProductCategory[] = [
  "vegetables",
  "fruits",
  "dairy",
  "meat",
  "bakery",
  "other",
];
