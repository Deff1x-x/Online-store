import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, H1, H2, Loader, PageContainer } from "@koz/ui";
import { APIError, useApi } from "@koz/api";
import { useCart } from "../cart/cart-context";
import { ProductVisual } from "../components/ProductVisual";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ProductCategory,
  type StoreProduct,
} from "../types";
import { formatCurrency, formatQuantity, repairTextEncoding } from "../utils/format";

const DEFAULT_STORE_ID = "11111111-1111-1111-1111-111111111111";

export function ShopPage() {
  const { modules } = useApi();
  const { addProduct } = useCart();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const storeId = import.meta.env.VITE_STORE_ID ?? DEFAULT_STORE_ID;

    modules.productsApi
      .getStoreProducts<StoreProduct>(storeId)
      .then((response) => {
        if (active) {
          setProducts(
            response.products.map((product) => ({
              ...product,
              name: repairTextEncoding(product.name),
            })),
          );
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof APIError
              ? requestError.message
              : "Не удалось загрузить товары.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [modules.productsApi]);

  const groupedProducts = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        products: products.filter((product) => product.category === category),
      })).filter((group) => group.products.length > 0),
    [products],
  );

  if (isLoading) {
    return (
      <PageContainer className="state-page">
        <Loader label="Загружаем витрину" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EmptyState title="Витрина временно недоступна" description={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="shop-page">
      <header className="page-heading">
        <span className="page-kicker">Свежие продукты по клубным ценам</span>
        <H1>Витрина</H1>
      </header>
      {groupedProducts.map(({ category, products: categoryProducts }) => (
        <section className="category-section" key={category}>
          <H2>{CATEGORY_LABELS[category as ProductCategory]}</H2>
          <div className="product-grid">
            {categoryProducts.map((product) => {
              const stock = Number(product.quantity);
              const unit = product.is_weighted ? "кг" : "шт";

              return (
                <Card className="product-card" key={product.product_id}>
                  <ProductVisual category={product.category} />
                  <div className="product-card__body">
                    <div className="product-card__meta">
                      <h3>{product.name}</h3>
                      <strong>
                        {formatCurrency(Number(product.price_per_unit))} / {unit}
                      </strong>
                    </div>
                    <div className="product-card__stock">
                      {stock <= 5 ? (
                        <Badge tone="warning">Осталось мало</Badge>
                      ) : (
                        <span>В наличии: {formatQuantity(stock)} {unit}</span>
                      )}
                    </div>
                    {product.is_weighted ? (
                      <p className="weighted-note">
                        весовой · итог по факту веса ±10%
                      </p>
                    ) : (
                      <span className="product-card__note-spacer" aria-hidden="true" />
                    )}
                    <Button type="button" fullWidth onClick={() => addProduct(product)}>
                      Добавить
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </PageContainer>
  );
}
