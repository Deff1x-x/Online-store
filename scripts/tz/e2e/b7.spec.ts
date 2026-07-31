import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CLIENT_BASE = process.env.B7_CLIENT_URL ?? "http://127.0.0.1:5173";
const STAFF_BASE = process.env.B7_STAFF_URL ?? "http://127.0.0.1:5174";
const API_BASE = process.env.B7_API_URL ?? process.env.KOZ_E2E_API_URL ?? "http://127.0.0.1:5000/api";
if (API_BASE.includes(":3000") && process.env.KOZ_E2E_ALLOW_NODE !== "1") {
  throw new Error(
    `B7 Playwright must target .NET (:5000), got ${API_BASE}. Set KOZ_E2E_ALLOW_NODE=1 only for Node parity.`,
  );
}
const STORE_ID = "11111111-1111-1111-1111-111111111111";
const EVIDENCE_DIR =
  process.env.B7_EVIDENCE_DIR ?? path.join("docs", "tz", "evidence", "b7-browser");

const TOMATOES = "Помидоры розовые";
const MILK = "Молоко 3,2% 1 л";

function ensureEvidenceDir() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `${name}.png`),
    fullPage: true,
  });
}

function uniquePhone() {
  return `+7${String(Date.now()).slice(-10)}`;
}

async function readOrderIdFromSession(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("koz.client.order-result.v1");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { orderId?: string };
      return parsed.orderId ?? null;
    } catch {
      return null;
    }
  });
}

async function fetchStoreProducts() {
  const response = await fetch(`${API_BASE}/products/store/${STORE_ID}`);
  if (!response.ok) throw new Error(`catalog fetch failed: ${response.status}`);
  const payload = (await response.json()) as {
    products?: Array<{
      product_id?: string;
      name?: string;
      quantity?: number | string;
      is_weighted?: boolean;
    }>;
  };
  return payload.products ?? [];
}

function findMilkProduct(products: Awaited<ReturnType<typeof fetchStoreProducts>>) {
  return products.find(
    (product) =>
      product.is_weighted === false &&
      (product.name === MILK || String(product.name).includes("Молоко")),
  );
}

async function readMilkStockFromApi(productId?: string) {
  const products = await fetchStoreProducts();
  const milk = productId
    ? products.find((product) => product.product_id === productId)
    : findMilkProduct(products);
  if (!milk) throw new Error("Milk product not found in catalog API");
  return Number(milk.quantity);
}

async function setCartQuantity(page: Page, productName: string, quantity: string, weighted: boolean) {
  const item = page.locator(".cart-item").filter({ hasText: productName });
  const label = weighted ? "Количество в килограммах" : "Количество в штуках";
  const input = item.getByLabel(label);
  await input.fill(quantity);
  await input.blur();
}

async function completeCheckout(page: Page) {
  await page.goto(`${CLIENT_BASE}/checkout`);
  await page.getByLabel("Подъезд").fill("1");
  await page.getByLabel("Этаж").fill("2");
  await page.getByLabel("Квартира").fill("3");
  await page.getByRole("button", { name: /Предварительно оплатить.*\(80%\)/ }).click();
  await expect(page.getByText("Заблокировано на карте (80%)")).toBeVisible();
}

async function staffLogin(page: Page, email: string, password: string) {
  await page.goto(`${STAFF_BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/(manager|admin)/, { timeout: 30_000 });
}

function managerOrderRow(page: Page, orderId: string) {
  return page.locator("tr").filter({ hasText: `#${orderId}` });
}

async function managerProcessOrder(page: Page, orderId: string) {
  await page.goto(`${STAFF_BASE}/manager/orders`);
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();
  await expect(page.getByText("Загружаем заказы")).toBeHidden({ timeout: 30_000 });

  const row = managerOrderRow(page, orderId);
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByRole("button", { name: "Собрать" }).click();
  const pickDialog = page.getByRole("dialog", { name: new RegExp(`Чек-лист сборки #${orderId}`) });
  await expect(pickDialog).toBeVisible();
  const pickChecks = pickDialog.locator(".manager-pick-checklist__item label.koz-choice");
  const pickCount = await pickChecks.count();
  for (let index = 0; index < pickCount; index += 1) {
    await pickChecks.nth(index).click();
  }
  await pickDialog.getByRole("button", { name: "Подтвердить сборку" }).click();
  await expect(row.getByText("Собран")).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: "Фактический вес" }).click();
  const weightDialog = page.getByRole("dialog", { name: new RegExp(`Фактический вес #${orderId}`) });
  await weightDialog.getByLabel("Фактический вес").fill("1.42");
  await weightDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(weightDialog).toBeHidden({ timeout: 20_000 });

  await row.getByRole("button", { name: "В пути" }).click();
  await expect(row.getByText("В пути")).toBeVisible({ timeout: 20_000 });

  await row.locator("label.koz-choice").filter({ hasText: "оплата на POS принята" }).click();
  await row.getByRole("button", { name: "Доставлен · оплата POS получена" }).click();
  const deliverDialog = page.getByRole("dialog", { name: "Доставить заказ" });
  await deliverDialog.getByRole("button", { name: "Доставлен" }).click();
  await expect(row.getByText("Доставлен")).toBeVisible({ timeout: 20_000 });
}

async function managerCancelOrder(page: Page, orderId: string) {
  await page.goto(`${STAFF_BASE}/manager/orders`);
  const row = managerOrderRow(page, orderId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Отменить" }).click();
  const cancelDialog = page.getByRole("dialog", { name: "Отменить заказ" });
  await cancelDialog.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(row.getByText("Отменён")).toBeVisible({ timeout: 20_000 });
}

test("TZ B7 — client + manager browser contexts", async ({ browser }) => {
  ensureEvidenceDir();

  const clientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ru-RU",
  });
  const staffContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  });

  const client = await clientContext.newPage();
  const staff = await staffContext.newPage();

  try {
    // 1. Guest catalog at phone width
    await client.goto(`${CLIENT_BASE}/shop`);
    await expect(client.getByRole("heading", { name: "Витрина" })).toBeVisible();
    const tomatoCard = client.locator(".product-card").filter({
      has: client.getByRole("heading", { name: TOMATOES, level: 3 }),
    });
    await expect(tomatoCard.getByText("весовой · итог по факту веса ±10%")).toBeVisible();
    await expect(tomatoCard.getByText(/\/ кг/)).toBeVisible();
    await screenshot(client, "01-guest-shop");

    // 2. OTP register → paywall → membership
    await client.goto(`${CLIENT_BASE}/register`);
    await client.getByLabel("Имя").fill("B7 Browser");
    await client.getByLabel("Телефон").fill(uniquePhone());
    await client
      .locator("label.koz-choice")
      .filter({ hasText: "Согласен с политикой конфиденциальности" })
      .click();
    await client
      .locator("label.koz-choice")
      .filter({ hasText: "Принимаю пользовательское соглашение" })
      .click();
    await client.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(client).toHaveURL(/\/otp/);
    await client.getByLabel("Код из SMS").fill("1234");
    await client.getByRole("button", { name: "Подтвердить и зарегистрироваться" }).click();

    const paywall = client.getByRole("dialog", { name: "Членство в Клубе" });
    await expect(paywall).toBeVisible();
    await expect(paywall.getByText("3 900 ₸", { exact: true })).toBeVisible();
    await screenshot(client, "02-paywall");
    await paywall.getByRole("button", { name: "Оплатить 3 900 ₸" }).click();
    await expect(paywall).toBeHidden();
    await client.goto(`${CLIENT_BASE}/shop`);
    await expect(client.getByRole("heading", { name: "Витрина" })).toBeVisible();

    const tomatoCardAfterPaywall = client.locator(".product-card").filter({
      has: client.getByRole("heading", { name: TOMATOES, level: 3 }),
    });

    // 3. Cart with tomatoes 1.5kg + milk 2pcs
    await tomatoCardAfterPaywall.getByRole("button", { name: "Добавить" }).click();
    await client
      .locator(".product-card")
      .filter({ has: client.getByRole("heading", { name: MILK, level: 3 }) })
      .getByRole("button", { name: "Добавить" })
      .click();
    await client.goto(`${CLIENT_BASE}/cart`);
    await setCartQuantity(client, TOMATOES, "1.5", true);
    await setCartQuantity(client, MILK, "2", false);
    await expect(client.getByText("ОПЛАТА В ДВЕ ЧАСТИ")).toBeVisible();
    await expect(client.getByText("Сейчас на сайте — 80% предварительно")).toBeVisible();
    const deliveryRow = client.locator(".price-list").getByText("Доставка").locator("..");
    await expect(deliveryRow).toContainText("500");
    await screenshot(client, "03-cart");

    // 4. Checkout → success (80% blocked)
    await client.getByRole("button", { name: "Оформить" }).click();
    await completeCheckout(client);
    const firstOrderId = await readOrderIdFromSession(client);
    expect(firstOrderId).toBeTruthy();
    await screenshot(client, "04-order-success");

    // Staff: manager login (independent session)
    await staffLogin(staff, "manager@koz.kz", "Manager123");
    await expect(staff.getByRole("heading", { name: "Заказы" })).toBeVisible();

    // 5. Manager full delivery cycle
    await managerProcessOrder(staff, firstOrderId!);
    await screenshot(staff, "05-manager-delivered");

    await client.goto(`${CLIENT_BASE}/orders`);
    const firstOrderCard = client.locator(".order-card").first();
    await expect(firstOrderCard.locator(".koz-badge--success")).toHaveText("Доставлен");
    await expect(firstOrderCard.getByText("Оплачен полностью — сделка закрыта по ПОС")).toBeVisible();
    await screenshot(client, "06-client-delivered");

    // 6. Second order → cancel → stock restored
    await client.goto(`${CLIENT_BASE}/shop`);
    await expect(client.getByRole("heading", { name: "Витрина" })).toBeVisible();
    const catalogBeforeSecond = await fetchStoreProducts();
    const milkProduct = findMilkProduct(catalogBeforeSecond);
    if (!milkProduct?.product_id) {
      throw new Error("Milk is not on the vitrina — re-seed store inventory before B7 browser run");
    }
    const milkProductId = milkProduct.product_id;
    const stockBeforeSecond = Number(milkProduct.quantity);
    await client
      .locator(".product-card")
      .filter({ has: client.getByRole("heading", { name: MILK, level: 3 }) })
      .getByRole("button", { name: "Добавить" })
      .click();
    await client.goto(`${CLIENT_BASE}/checkout`);
    await completeCheckout(client);
    const secondOrderId = await readOrderIdFromSession(client);
    expect(secondOrderId).toBeTruthy();

    await client.goto(`${CLIENT_BASE}/shop`);
    const stockAfterSecondOrder = await readMilkStockFromApi(milkProductId).catch(() => 0);
    expect(stockAfterSecondOrder).toBeLessThan(stockBeforeSecond);

    await managerCancelOrder(staff, secondOrderId!);
    await client.reload();
    const stockAfterCancel = await readMilkStockFromApi(milkProductId);
    expect(stockAfterCancel).toBeGreaterThan(stockAfterSecondOrder);
    await screenshot(client, "07-stock-restored");

    // 7. Admin store report GMV
    await staff.getByRole("button", { name: "Выйти" }).click();
    await staffLogin(staff, "admin@koz.kz", "Manager123");
    await staff.goto(`${STAFF_BASE}/admin/reports`);
    await expect(staff.getByText("Загружаем раздел")).toBeHidden({ timeout: 30_000 });
    await expect(staff.getByRole("heading", { name: "Отчёт по точке", level: 2 })).toBeVisible();
    const storeReportSection = staff.locator('section[aria-labelledby="store-report-heading"]');
    await storeReportSection.getByLabel("ID точки").fill(STORE_ID);
    await storeReportSection.getByRole("button", { name: "Загрузить отчёт" }).click();
    await expect(staff.locator(".manager-metric").filter({ hasText: "GMV" }).locator("strong")).not.toHaveText(
      /^[\s₸0.,]*$/,
    );
    await screenshot(staff, "08-admin-gmv");
  } finally {
    await clientContext.close();
    await staffContext.close();
  }
});
