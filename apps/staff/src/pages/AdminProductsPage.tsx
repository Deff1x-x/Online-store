import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Body,
  Button,
  Card,
  Dropdown,
  EmptyState,
  H1,
  H2,
  Loader,
  Modal,
  Spinner,
  Switch,
  Table,
  TextField,
} from "@koz/ui";
import {
  formatMoney,
  useApi,
  useToast,
  type AdminProduct,
  type AdminProductCategory,
  type AdminProductCreatePayload,
  type AdminProductUnit,
  type AdminStore,
  type AdminStoreInventory,
} from "@koz/api";

type ProductDraft = {
  name: string;
  category: AdminProductCategory;
  unit: AdminProductUnit;
  price_per_unit: string;
  company_price: string;
  is_weighted: boolean;
};

type InventoryDraft = {
  store_id: string;
  selling_price: string;
  quantity: string;
  is_visible: boolean;
};

const productCategoryOptions = [
  { value: "vegetables", label: "Овощи" },
  { value: "fruits", label: "Фрукты" },
  { value: "dairy", label: "Молочные продукты" },
  { value: "meat", label: "Мясо" },
  { value: "bakery", label: "Выпечка" },
  { value: "other", label: "Другое" },
] as const;

const unitOptions = [
  { value: "kg", label: "кг" },
  { value: "pcs", label: "шт." },
  { value: "l", label: "л" },
] as const;

const categoryLabels: Record<AdminProductCategory, string> = Object.fromEntries(
  productCategoryOptions.map((option) => [option.value, option.label]),
) as Record<AdminProductCategory, string>;

const unitLabels: Record<AdminProductUnit, string> = Object.fromEntries(
  unitOptions.map((option) => [option.value, option.label]),
) as Record<AdminProductUnit, string>;

const emptyProductDraft: ProductDraft = {
  name: "",
  category: "vegetables",
  unit: "kg",
  price_per_unit: "",
  company_price: "",
  is_weighted: false,
};

const emptyInventoryDraft: InventoryDraft = {
  store_id: "",
  selling_price: "",
  quantity: "",
  is_visible: true,
};

const draftFromProduct = (product: AdminProduct): ProductDraft => ({
  name: product.name,
  category: product.category,
  unit: product.unit,
  price_per_unit: String(product.price_per_unit),
  company_price: String(product.company_price),
  is_weighted: product.is_weighted,
});

const productPayload = (draft: ProductDraft): AdminProductCreatePayload | null => {
  const name = draft.name.trim();
  const pricePerUnitText = draft.price_per_unit.trim();
  const companyPriceText = draft.company_price.trim();
  const pricePerUnit = Number(pricePerUnitText);
  const companyPrice = Number(companyPriceText);
  const hasCategory = productCategoryOptions.some((option) => option.value === draft.category);
  const hasUnit = unitOptions.some((option) => option.value === draft.unit);

  if (!name || !hasCategory || !hasUnit || pricePerUnitText === "" || !Number.isFinite(pricePerUnit) || pricePerUnit < 0 || companyPriceText === "" || !Number.isFinite(companyPrice) || companyPrice < 0) {
    return null;
  }

  return {
    name,
    category: draft.category,
    unit: draft.unit,
    price_per_unit: pricePerUnit,
    company_price: companyPrice,
    is_weighted: draft.is_weighted,
  };
};

const inventoryStatusTone = (status: string) => {
  if (status === "out_of_stock") return "danger";
  if (status === "low_stock") return "warning";
  return "success";
};

export default function AdminProductsPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [inventory, setInventory] = useState<AdminStoreInventory[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState(false);
  const [storesLoadError, setStoresLoadError] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [deactivatingProduct, setDeactivatingProduct] = useState<AdminProduct | null>(null);
  const [inventoryProduct, setInventoryProduct] = useState<AdminProduct | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraft>(emptyInventoryDraft);
  const [busyAction, setBusyAction] = useState<"create" | "edit" | "deactivate" | "inventory" | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setProductsLoadError(false);

    try {
      const response = await modules.adminCatalogApi.getProducts();
      setProducts(response.products);
    } catch {
      setProductsLoadError(true);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [modules.adminCatalogApi]);

  const loadStores = useCallback(async () => {
    setIsLoadingStores(true);
    setStoresLoadError(false);

    try {
      const response = await modules.adminCatalogApi.getStores();
      setStores(response.stores);
    } catch {
      setStoresLoadError(true);
    } finally {
      setIsLoadingStores(false);
    }
  }, [modules.adminCatalogApi]);

  const loadInventory = useCallback(
    async (storeId: string) => {
      if (!storeId) {
        setInventory([]);
        return;
      }

      setIsLoadingInventory(true);
      setInventoryLoadError(false);

      try {
        const response = await modules.adminCatalogApi.getStoreInventory(storeId);
        setInventory(response.inventory);
      } catch {
        setInventoryLoadError(true);
      } finally {
        setIsLoadingInventory(false);
      }
    },
    [modules.adminCatalogApi],
  );

  useEffect(() => {
    void loadProducts();
    void loadStores();
  }, [loadProducts, loadStores]);

  useEffect(() => {
    void loadInventory(selectedStoreId);
  }, [loadInventory, selectedStoreId]);

  const closeCreate = () => {
    setIsCreateOpen(false);
    setProductDraft(emptyProductDraft);
  };

  const closeEdit = () => {
    setEditingProduct(null);
    setProductDraft(emptyProductDraft);
  };

  const submitCreate = async () => {
    const payload = productPayload(productDraft);

    if (!payload) {
      showToast({ message: "Заполните название, допустимые категорию и единицу, а также цены не меньше нуля.", tone: "warning" });
      return;
    }

    setBusyAction("create");
    try {
      await modules.adminCatalogApi.createProduct(payload);
      closeCreate();
      await loadProducts();
      showToast({ message: "Товар создан.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const openEdit = (product: AdminProduct) => {
    setEditingProduct(product);
    setProductDraft(draftFromProduct(product));
  };

  const submitEdit = async () => {
    if (!editingProduct) return;

    const payload = productPayload(productDraft);
    if (!payload) {
      showToast({ message: "Заполните название, допустимые категорию и единицу, а также цены не меньше нуля.", tone: "warning" });
      return;
    }

    setBusyAction("edit");
    try {
      await modules.adminCatalogApi.updateProduct(editingProduct.id, {
        ...payload,
        is_active: editingProduct.is_active,
      });
      closeEdit();
      await loadProducts();
      showToast({ message: "Товар обновлён.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmDeactivation = async () => {
    if (!deactivatingProduct) return;

    setBusyAction("deactivate");
    try {
      await modules.adminCatalogApi.deleteProduct(deactivatingProduct.id);
      setDeactivatingProduct(null);
      await loadProducts();
      showToast({ message: "Товар деактивирован.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const openInventory = (product: AdminProduct) => {
    setInventoryProduct(product);
    setInventoryDraft({
      ...emptyInventoryDraft,
      store_id: selectedStoreId,
    });
  };

  const closeInventory = () => {
    setInventoryProduct(null);
    setInventoryDraft(emptyInventoryDraft);
  };

  const submitInventory = async () => {
    if (!inventoryProduct) return;

    const quantityText = inventoryDraft.quantity.trim();
    const quantity = Number(quantityText);
    const sellingPrice = inventoryDraft.selling_price.trim() === "" ? null : Number(inventoryDraft.selling_price);

    if (!inventoryDraft.store_id || quantityText === "" || !Number.isFinite(quantity) || quantity < 0 || (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0))) {
      showToast({ message: "Выберите точку, укажите остаток не меньше нуля и корректную локальную цену или оставьте её пустой.", tone: "warning" });
      return;
    }

    setBusyAction("inventory");
    try {
      await modules.adminCatalogApi.upsertStoreInventory(inventoryDraft.store_id, inventoryProduct.id, {
        selling_price: sellingPrice,
        quantity,
        is_visible: inventoryDraft.is_visible,
      });
      closeInventory();
      if (selectedStoreId === inventoryDraft.store_id) {
        await loadInventory(inventoryDraft.store_id);
      } else {
        setSelectedStoreId(inventoryDraft.store_id);
      }
      showToast({ message: "Товар привязан к точке.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const productColumns = useMemo(
    () => [
      { key: "name", header: "Товар", render: (product: AdminProduct) => <strong>{product.name}</strong> },
      { key: "category", header: "Категория", render: (product: AdminProduct) => categoryLabels[product.category] },
      { key: "unit", header: "Ед.", render: (product: AdminProduct) => unitLabels[product.unit] },
      { key: "network_price", header: "Цена сети", render: (product: AdminProduct) => formatMoney(product.price_per_unit) },
      { key: "company_price", header: "Закупочная цена", render: (product: AdminProduct) => formatMoney(product.company_price) },
      { key: "weighted", header: "Весовой", render: (product: AdminProduct) => (product.is_weighted ? "Да" : "Нет") },
      {
        key: "active",
        header: "Статус",
        render: (product: AdminProduct) => <Badge tone={product.is_active ? "success" : "neutral"}>{product.is_active ? "Активен" : "Неактивен"}</Badge>,
      },
      {
        key: "actions",
        header: "Действия",
        render: (product: AdminProduct) => (
          <div className="admin-store-actions">
            {product.is_active ? (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(product)}>
                  Изменить
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => openInventory(product)}>
                  Привязать к точке
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => setDeactivatingProduct(product)}>
                  Деактивировать
                </Button>
              </>
            ) : (
              <Body tone="muted">Действий нет</Body>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const inventoryColumns = useMemo(
    () => [
      { key: "name", header: "Товар", render: (item: AdminStoreInventory) => <strong>{item.name}</strong> },
      { key: "category", header: "Категория", render: (item: AdminStoreInventory) => categoryLabels[item.category] },
      { key: "unit", header: "Ед.", render: (item: AdminStoreInventory) => unitLabels[item.unit] },
      { key: "network_price", header: "Цена сети", render: (item: AdminStoreInventory) => formatMoney(item.price_per_unit) },
      { key: "company_price", header: "Закупочная цена", render: (item: AdminStoreInventory) => formatMoney(item.company_price) },
      { key: "selling_price", header: "Локальная цена", render: (item: AdminStoreInventory) => item.selling_price === null ? "—" : formatMoney(item.selling_price) },
      { key: "effective_price", header: "Итоговая цена", render: (item: AdminStoreInventory) => formatMoney(item.effective_price) },
      { key: "quantity", header: "Остаток", render: (item: AdminStoreInventory) => item.quantity },
      { key: "visible", header: "Видимость", render: (item: AdminStoreInventory) => (item.is_visible ? "Виден" : "Скрыт") },
      {
        key: "status",
        header: "Статус",
        render: (item: AdminStoreInventory) => <Badge tone={inventoryStatusTone(item.status)}>{item.status}</Badge>,
      },
    ],
    [],
  );

  return (
    <section className="manager-screen">
      <div className="manager-heading manager-heading--row">
        <div>
          <H1>Товары</H1>
          <Body tone="muted">Каталог сети и привязка товаров к точкам</Body>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)}>
          Создать товар
        </Button>
      </div>

      {isLoadingProducts ? <Loader label="Загружаем товары" /> : null}
      {!isLoadingProducts && productsLoadError ? (
        <EmptyState
          title="Не удалось загрузить товары"
          description="Повторите попытку."
          action={<Button type="button" onClick={() => void loadProducts()}>Повторить</Button>}
        />
      ) : null}
      {!isLoadingProducts && !productsLoadError && products.length === 0 ? (
        <EmptyState
          title="Товаров пока нет"
          description="Создайте первую позицию каталога."
          action={<Button type="button" onClick={() => setIsCreateOpen(true)}>Создать товар</Button>}
        />
      ) : null}
      {!isLoadingProducts && !productsLoadError && products.length > 0 ? (
        <Card className="manager-panel manager-panel--table">
          <Table columns={productColumns} data={products} getRowKey={(product) => product.id} />
        </Card>
      ) : null}

      <section className="admin-products-inventory" aria-labelledby="inventory-heading">
        <div className="manager-panel__heading">
          <H2 id="inventory-heading">Товары точки</H2>
          <Dropdown
            label="Точка"
            value={selectedStoreId}
            disabled={isLoadingStores || storesLoadError || stores.length === 0}
            options={[{ value: "", label: "Выберите точку" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]}
            onChange={(event) => setSelectedStoreId(event.target.value)}
          />
        </div>

        {isLoadingStores ? <Loader label="Загружаем точки" /> : null}
        {!isLoadingStores && storesLoadError ? (
          <EmptyState
            title="Не удалось загрузить точки"
            description="Повторите попытку."
            action={<Button type="button" onClick={() => void loadStores()}>Повторить</Button>}
          />
        ) : null}
        {!isLoadingStores && !storesLoadError && stores.length === 0 ? (
          <EmptyState title="Точек пока нет" description="Создайте точку перед привязкой товаров." />
        ) : null}
        {!isLoadingStores && !storesLoadError && stores.length > 0 && !selectedStoreId ? (
          <EmptyState title="Выберите точку" description="После выбора отобразится её inventory." />
        ) : null}
        {!isLoadingStores && !storesLoadError && selectedStoreId && isLoadingInventory ? <Loader label="Загружаем inventory" /> : null}
        {!isLoadingStores && !storesLoadError && selectedStoreId && !isLoadingInventory && inventoryLoadError ? (
          <EmptyState
            title="Не удалось загрузить inventory"
            description="Повторите попытку."
            action={<Button type="button" onClick={() => void loadInventory(selectedStoreId)}>Повторить</Button>}
          />
        ) : null}
        {!isLoadingStores && !storesLoadError && selectedStoreId && !isLoadingInventory && !inventoryLoadError && inventory.length === 0 ? (
          <EmptyState title="В inventory пока нет товаров" description="Привяжите товар из таблицы каталога." />
        ) : null}
        {!isLoadingStores && !storesLoadError && selectedStoreId && !isLoadingInventory && !inventoryLoadError && inventory.length > 0 ? (
          <Card className="manager-panel manager-panel--table">
            <Table columns={inventoryColumns} data={inventory} getRowKey={(item) => item.id} />
          </Card>
        ) : null}
      </section>

      <Modal
        open={isCreateOpen}
        title="Создать товар"
        onClose={closeCreate}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "create"} onClick={closeCreate}>Отмена</Button>
            <Button type="button" disabled={busyAction === "create"} onClick={() => void submitCreate()}>
              {busyAction === "create" ? <Spinner /> : "Создать"}
            </Button>
          </div>
        }
      >
        <ProductForm draft={productDraft} disabled={busyAction === "create"} onChange={setProductDraft} />
      </Modal>

      <Modal
        open={Boolean(editingProduct)}
        title={editingProduct ? `Изменить: ${editingProduct.name}` : undefined}
        onClose={closeEdit}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "edit"} onClick={closeEdit}>Отмена</Button>
            <Button type="button" disabled={busyAction === "edit"} onClick={() => void submitEdit()}>
              {busyAction === "edit" ? <Spinner /> : "Сохранить"}
            </Button>
          </div>
        }
      >
        <ProductForm draft={productDraft} disabled={busyAction === "edit"} onChange={setProductDraft} />
      </Modal>

      <Modal
        open={Boolean(deactivatingProduct)}
        title={deactivatingProduct ? `Деактивировать: ${deactivatingProduct.name}` : undefined}
        onClose={() => setDeactivatingProduct(null)}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "deactivate"} onClick={() => setDeactivatingProduct(null)}>Отмена</Button>
            <Button type="button" variant="danger" disabled={busyAction === "deactivate"} onClick={() => void confirmDeactivation()}>
              {busyAction === "deactivate" ? <Spinner /> : "Деактивировать"}
            </Button>
          </div>
        }
      >
        <Body tone="muted">Товар станет неактивным и не будет удалён физически.</Body>
      </Modal>

      <Modal
        open={Boolean(inventoryProduct)}
        title={inventoryProduct ? `Привязать к точке: ${inventoryProduct.name}` : undefined}
        onClose={closeInventory}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "inventory"} onClick={closeInventory}>Отмена</Button>
            <Button type="button" disabled={busyAction === "inventory"} onClick={() => void submitInventory()}>
              {busyAction === "inventory" ? <Spinner /> : "Сохранить"}
            </Button>
          </div>
        }
      >
        <div className="admin-store-form">
          <Dropdown
            label="Точка"
            value={inventoryDraft.store_id}
            disabled={busyAction === "inventory" || isLoadingStores || stores.length === 0}
            options={[{ value: "", label: "Выберите точку" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]}
            onChange={(event) => setInventoryDraft((draft) => ({ ...draft, store_id: event.target.value }))}
          />
          <TextField
            label="Локальная цена"
            helperText="Оставьте пустой, чтобы использовать цену сети."
            type="number"
            inputMode="decimal"
            min="0"
            value={inventoryDraft.selling_price}
            disabled={busyAction === "inventory"}
            onChange={(event) => setInventoryDraft((draft) => ({ ...draft, selling_price: event.target.value }))}
          />
          <TextField
            label="Остаток"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            value={inventoryDraft.quantity}
            disabled={busyAction === "inventory"}
            onChange={(event) => setInventoryDraft((draft) => ({ ...draft, quantity: event.target.value }))}
          />
          <Switch
            label="Показывать товар в точке"
            checked={inventoryDraft.is_visible}
            disabled={busyAction === "inventory"}
            onChange={(event) => setInventoryDraft((draft) => ({ ...draft, is_visible: event.target.checked }))}
          />
        </div>
      </Modal>
    </section>
  );
}

function ProductForm({
  draft,
  disabled,
  onChange,
}: {
  draft: ProductDraft;
  disabled: boolean;
  onChange: (draft: ProductDraft) => void;
}) {
  return (
    <div className="admin-store-form">
      <TextField label="Название" value={draft.name} disabled={disabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
      <Dropdown
        label="Категория"
        value={draft.category}
        options={productCategoryOptions}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, category: event.target.value as AdminProductCategory })}
      />
      <Dropdown
        label="Единица"
        value={draft.unit}
        options={unitOptions}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, unit: event.target.value as AdminProductUnit })}
      />
      <TextField
        label="Цена сети"
        type="number"
        inputMode="decimal"
        min="0"
        value={draft.price_per_unit}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, price_per_unit: event.target.value })}
      />
      <TextField
        label="Закупочная цена"
        type="number"
        inputMode="decimal"
        min="0"
        value={draft.company_price}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, company_price: event.target.value })}
      />
      <Switch label="Весовой товар" checked={draft.is_weighted} disabled={disabled} onChange={(event) => onChange({ ...draft, is_weighted: event.target.checked })} />
    </div>
  );
}
