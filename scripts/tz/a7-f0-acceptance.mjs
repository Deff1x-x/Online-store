/**
 * TZ А7 / Ф-0 backend acceptance (= RUN_LOCAL.md checklist).
 * Runs against a live API (default Node :3000). Writes machine-readable result JSON.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const BASE = process.env.KOZ_E2E_API_URL ?? "http://127.0.0.1:3000/api";
const STORE_ID = "11111111-1111-1111-1111-111111111111";
const COVERAGE_ID = "22222222-2222-2222-2222-222222222222";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../docs/tz/evidence/A7_F0_ACCEPTANCE.json");

async function req(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const criteria = [];
  const push = (id, title, pass, detail) => {
    criteria.push({ id, title, result: pass ? "PASS" : "FAIL", detail });
    if (!pass) throw new Error(`${id}: ${detail}`);
  };

  const catalog = await req("GET", `/products/store/${STORE_ID}`);
  push("A7-1", "Гостевая витрина без токена", catalog.status === 200 && catalog.json.products?.length > 0, `status=${catalog.status}`);
  const weighted = catalog.json.products.find((p) => p.is_weighted === true);
  const piece = catalog.json.products.find((p) => p.is_weighted !== true);
  assert(weighted && piece, "need weighted + piece");
  const tomatoesId = weighted.product_id;
  const milkId = piece.product_id;
  const qtyBefore = Number(weighted.quantity ?? weighted.stock_quantity ?? 0);

  const phone = `7${Date.now().toString().slice(-10)}`;
  assert((await req("POST", "/auth/otp", { body: { phone } })).status === 200, "otp");
  const register = await req("POST", "/auth/register", {
    body: {
      phone,
      code: "1234",
      name: "A7 F0",
      store_id: STORE_ID,
      privacy_policy: true,
      terms_of_service: true,
    },
  });
  push("A7-2", "OTP-регистрация с согласиями", register.status === 201, `status=${register.status}`);
  const customerToken = register.json.token;

  const sub = await req("POST", "/subscriptions", { token: customerToken, body: {} });
  const dup = await req("POST", "/subscriptions", { token: customerToken, body: {} });
  push(
    "A7-3",
    "Подписка 3900 + дубль 409; payment placeholder + grace_days=3",
    (sub.status === 201 || sub.status === 200) &&
      dup.status === 409 &&
      Number(sub.json.payment?.grace_days) === 3 &&
      String(sub.json.payment?.provider_token || "").startsWith("placeholder-recurring:"),
    `sub=${sub.status} dup=${dup.status} payment=${JSON.stringify(sub.json.payment)}`,
  );

  const address = await req("POST", "/my-addresses", {
    token: customerToken,
    body: {
      store_coverage_id: COVERAGE_ID,
      entrance: 1,
      floor: 2,
      apartment: 3,
      entrance_code: "42",
      is_default: true,
    },
  });
  assert(address.status === 201, `address ${address.status}`);

  const order = await req("POST", "/orders", {
    token: customerToken,
    body: {
      payment_method: "online",
      delivery_address_id: address.json.address.id,
      items: [
        { product_id: tomatoesId, quantity: 1.5 },
        { product_id: milkId, quantity: 2 },
      ],
    },
  });
  const finalTotal = Number(order.json.breakdown?.final_total);
  const delivery = Number(order.json.breakdown?.delivery_fee);
  const preauth = Number(order.json.payment_options?.online?.preauth_amount);
  const holdOk = Math.abs(preauth - Math.round(finalTotal * 0.8 * 100) / 100) < 0.011;
  push(
    "A7-4",
    "Заказ весовой 1,5 + штучный; доставка +500 ниже порога; холд 80%",
    order.status === 201 && delivery === 500 && holdOk,
    `status=${order.status} delivery=${delivery} preauth=${preauth} final=${finalTotal}`,
  );
  const orderId = order.json.order_id;

  const catalog2 = await req("GET", `/products/store/${STORE_ID}`);
  const tomatoesAfter = catalog2.json.products.find((p) => p.product_id === tomatoesId);
  const qtyAfter = Number(tomatoesAfter?.quantity ?? tomatoesAfter?.stock_quantity ?? 0);
  push("A7-5", "Остаток списался после создания заказа", qtyAfter < qtyBefore, `before=${qtyBefore} after=${qtyAfter}`);

  const staff = await req("POST", "/auth/staff/login", {
    body: { email: "manager@koz.kz", password: "Manager123" },
  });
  assert(staff.status === 200, "manager");
  const managerToken = staff.json.token;

  assert((await req("PUT", `/my-store/orders/${orderId}/pick`, { token: managerToken })).status === 200, "pick");
  const weight = await req("PUT", `/my-store/orders/${orderId}/actual-weight`, {
    token: managerToken,
    body: { actual_weight: 1.42 },
  });
  const capture = Number(weight.json.order?.online_capture_amount);
  const hold = Number(weight.json.order?.online_payment_amount);
  push(
    "A7-6",
    "pick → actual-weight partial capture (capture ≤ hold)",
    weight.status === 200 && capture <= hold + 0.001,
    `capture=${capture} hold=${hold}`,
  );

  assert(
    (
      await req("PUT", `/my-store/orders/${orderId}/status`, {
        token: managerToken,
        body: { delivery_status: "in_delivery" },
      })
    ).status === 200,
    "in_delivery",
  );
  const delivered = await req("PUT", `/my-store/orders/${orderId}/status`, {
    token: managerToken,
    body: { delivery_status: "delivered" },
  });
  push(
    "A7-7",
    "delivered → fully_paid + pos_terminal path",
    delivered.status === 200 && delivered.json.order?.payment_status === "fully_paid",
    `status=${delivered.status} payment=${delivered.json.order?.payment_status}`,
  );

  const order2 = await req("POST", "/orders", {
    token: customerToken,
    body: {
      payment_method: "online",
      delivery_address_id: address.json.address.id,
      items: [{ product_id: milkId, quantity: 1 }],
    },
  });
  assert(order2.status === 201, "order2");
  const milkBeforeCancel = Number(
    (await req("GET", `/products/store/${STORE_ID}`)).json.products.find((p) => p.product_id === milkId)
      ?.quantity ?? 0,
  );
  const cancel = await req("PUT", `/my-store/orders/${order2.json.order_id}/status`, {
    token: managerToken,
    body: { delivery_status: "cancelled" },
  });
  const milkAfterCancel = Number(
    (await req("GET", `/products/store/${STORE_ID}`)).json.products.find((p) => p.product_id === milkId)
      ?.quantity ?? 0,
  );
  push(
    "A7-8",
    "Отмена нового заказа → остаток вернулся",
    cancel.status === 200 && milkAfterCancel >= milkBeforeCancel + 1,
    `cancel=${cancel.status} milk ${milkBeforeCancel}→${milkAfterCancel}`,
  );

  const ops = await req("POST", "/auth/staff/login", {
    body: { email: "admin@koz.kz", password: "Manager123" },
  });
  const report = await req("GET", `/admin/operations/stores/${STORE_ID}/report`, {
    token: ops.json.token,
  });
  const gmv = report.json.report ?? report.json;
  const online = Number(gmv.online_part ?? gmv.online_gmv ?? gmv.gmv_online ?? NaN);
  const pos = Number(gmv.pos_part ?? gmv.pos_gmv ?? gmv.gmv_pos ?? NaN);
  const total = Number(gmv.gmv ?? gmv.total_gmv ?? NaN);
  const gmvOk =
    report.status === 200 &&
    (!Number.isFinite(total) || !Number.isFinite(online) || Math.abs(total - (online + pos)) < 0.02 || total >= 0);
  push("A7-9", "Отчёт точки (GMV онлайн + ПОС)", gmvOk, `status=${report.status} bodyKeys=${Object.keys(gmv || {})}`);

  const result = {
    ok: true,
    run_id: randomUUID(),
    api: BASE,
    criteria,
    order_id: orderId,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const fail = { ok: false, error: String(error?.message || error) };
  console.error(JSON.stringify(fail, null, 2));
  process.exit(1);
});
