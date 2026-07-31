/**
 * TZ Б7 / А7 automated acceptance against a running product API (default ASP.NET Core :5000).
 * Does not switch production traffic. Uses seeded store 11111111-… and coverage 22222222-….
 * Node :3000 only with KOZ_E2E_ALLOW_NODE=1 (parity/legacy).
 */
import { randomUUID } from "crypto";
import { resolveProductApiBase } from "../local/assert-dotnet-api-url.mjs";

const BASE = resolveProductApiBase("http://127.0.0.1:5000/api");
const STORE_ID = "11111111-1111-1111-1111-111111111111";
const COVERAGE_ID = "22222222-2222-2222-2222-222222222222";

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
  const steps = [];

  const health = await req("GET", "/health");
  assert(health.status === 200, "health");
  steps.push("health");

  const catalog = await req("GET", `/products/store/${STORE_ID}`);
  assert(catalog.status === 200, "guest catalog");
  assert(Array.isArray(catalog.json.products) && catalog.json.products.length > 0, "catalog products");
  const weighted = catalog.json.products.find((p) => p.is_weighted === true);
  const piece = catalog.json.products.find((p) => p.is_weighted !== true);
  assert(weighted && piece, "need weighted + piece products in seed catalog");
  const tomatoesId = weighted.product_id;
  const milkId = piece.product_id;
  steps.push("guest catalog");

  const stores = await req("GET", "/stores");
  assert(stores.status === 200 && stores.json.stores?.length >= 1, "GET /stores");
  steps.push("stores list");

  const phone = `7${Date.now().toString().slice(-10)}`;
  assert((await req("POST", "/auth/otp", { body: { phone } })).status === 200, "otp");
  const register = await req("POST", "/auth/register", {
    body: {
      phone,
      code: "1234",
      name: "B7 E2E",
      store_id: STORE_ID,
      privacy_policy: true,
      terms_of_service: true,
    },
  });
  assert(register.status === 201, `register ${register.status}`);
  const customerToken = register.json.token;
  steps.push("otp register");

  const sub = await req("POST", "/subscriptions", { token: customerToken, body: {} });
  assert(sub.status === 201 || sub.status === 200, `subscription ${sub.status}`);
  const dup = await req("POST", "/subscriptions", { token: customerToken, body: {} });
  assert(dup.status === 409, "duplicate subscription 409");
  steps.push("subscription");

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
  const addressId = address.json.address.id;

  const order = await req("POST", "/orders", {
    token: customerToken,
    body: {
      payment_method: "online",
      delivery_address_id: addressId,
      items: [
        { product_id: tomatoesId, quantity: 1.5 },
        { product_id: milkId, quantity: 2 },
      ],
    },
  });
  assert(order.status === 201, `order ${order.status} ${JSON.stringify(order.json)}`);
  const preauth = Number(order.json.payment_options.online.preauth_amount);
  const finalTotal = Number(order.json.breakdown.final_total);
  assert(Math.abs(preauth - Math.round(finalTotal * 0.8 * 100) / 100) < 0.011, "hold 80%");
  const orderId = order.json.order_id;
  steps.push("order create 80% hold");

  const pay = await req("POST", `/payments/orders/${orderId}/pay-online`, { token: customerToken });
  assert(pay.status === 201, `pay-online ${pay.status}`);
  assert(String(pay.json.payment_url || "").includes("placeholder"), "placeholder url");
  steps.push("pay-online placeholder");

  const staff = await req("POST", "/auth/staff/login", {
    body: { email: "manager@koz.kz", password: "Manager123" },
  });
  assert(staff.status === 200, "manager login");
  const managerToken = staff.json.token;

  assert((await req("PUT", `/my-store/orders/${orderId}/pick`, { token: managerToken })).status === 200, "pick");
  const weight = await req("PUT", `/my-store/orders/${orderId}/actual-weight`, {
    token: managerToken,
    body: { actual_weight: 1.42 },
  });
  assert(weight.status === 200, `weight ${weight.status}`);
  const capture = Number(weight.json.order.online_capture_amount);
  const hold = Number(weight.json.order.online_payment_amount);
  assert(capture <= hold + 0.001, "capture <= hold");
  assert(
    (await req("PUT", `/my-store/orders/${orderId}/status`, {
      token: managerToken,
      body: { delivery_status: "in_delivery" },
    })).status === 200,
    "in_delivery",
  );
  const delivered = await req("PUT", `/my-store/orders/${orderId}/status`, {
    token: managerToken,
    body: { delivery_status: "delivered" },
  });
  assert(delivered.status === 200, `delivered ${delivered.status}`);
  assert(delivered.json.order.payment_status === "fully_paid", "fully_paid");
  steps.push("manager cycle delivered");

  const order2 = await req("POST", "/orders", {
    token: customerToken,
    body: {
      payment_method: "online",
      delivery_address_id: addressId,
      items: [{ product_id: milkId, quantity: 1 }],
    },
  });
  assert(order2.status === 201, "second order");
  const cancel = await req("PUT", `/my-store/orders/${order2.json.order_id}/status`, {
    token: managerToken,
    body: { delivery_status: "cancelled" },
  });
  assert(cancel.status === 200, `cancel ${cancel.status}`);
  steps.push("cancel restores stock path");

  const ops = await req("POST", "/auth/staff/login", {
    body: { email: "admin@koz.kz", password: "Manager123" },
  });
  assert(ops.status === 200, "ops login");
  const report = await req("GET", `/admin/operations/stores/${STORE_ID}/report`, {
    token: ops.json.token,
  });
  assert(report.status === 200, `report ${report.status}`);
  steps.push("admin store report");

  console.log(JSON.stringify({ ok: true, steps, order_id: orderId }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
