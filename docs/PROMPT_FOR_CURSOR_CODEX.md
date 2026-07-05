# PROMPT FOR CURSOR / CODEX / AI CODE GENERATORS

Copy this prompt into Cursor or Codex to start code generation. The prompt is structured for AI code generation with clear patterns, examples, and constraints.

---

## 📋 PROJECT BRIEF

You are building a **multi-store subscription e-commerce platform** with role-based access control.

**System has 5 user types:**
1. Customer (phone auth, subscribes to ONE store)
2. Store operator (email auth, manages single store)
3. Admin - Catalog Manager (creates stores, products, inventory)
4. Admin - Operations Monitor (views orders, payments, revenue)
5. Admin - Customers Monitor (manages subscriptions)

**Tech Stack:**
- Backend: Node.js + Express (or Python FastAPI)
- Database: PostgreSQL
- Frontend: React (or Vue)
- Authentication: JWT + phone SMS OTP

---

## 🎯 FEATURES TO BUILD

### **1. Core E-Commerce**
- Multi-tenant store isolation (customers see only their store)
- Product catalog with categories
- Shopping cart with estimated weight calculation
- Order creation with items
- Two payment methods: online (Kaspi QR, 5% discount) + POS terminal at delivery
- Order status tracking (new → picked → in_delivery → delivered)

### **2. Pricing & Discounts**
- **First order discount:** Automatic discount for customer's first order (per store)
- **Promo codes:** Admin-created codes with:
  - Percentage or fixed amount discount
  - Minimum order value requirement
  - Valid date range
  - Max uses limit
  - Per-customer usage limit
- **Delivery fees:** Minimum order value for free delivery, else charge fee

### **3. Weight-Based Pricing Adjustment**
- At checkout: estimate weight from product averages
- Calculate price = subtotal × 0.95 (5% online discount)
- At delivery: measure actual weight
- Recalculate: final_total = subtotal × (actual_weight / estimated_weight)
- Collect topup via POS terminal if needed

### **4. Admin Dashboards (3 separate)**
- **Catalog Manager:** Stores (CRUD), products (CRUD), inventory levels
- **Operations Monitor:** Orders, payments, delivery status, revenue analytics
- **Customers Monitor:** Customer lists, subscriptions, renewal dates, consent logs

---

## 🗄️ DATABASE SCHEMA

```sql
-- Core tables (essential to implement first)
CREATE TABLE stores (id UUID, name VARCHAR, status ENUM, settings JSONB);
CREATE TABLE products (id UUID, name VARCHAR, category VARCHAR, unit ENUM, company_price DECIMAL, avg_weight DECIMAL);
CREATE TABLE store_inventory (id UUID, store_id UUID, product_id UUID, selling_price DECIMAL, quantity DECIMAL, status ENUM);
CREATE TABLE customers (id UUID, phone VARCHAR, store_id UUID, subscription_status ENUM);
CREATE TABLE customer_addresses (id UUID, customer_id UUID, store_id UUID, entrance INT, floor INT, apartment INT, entrance_code VARCHAR);
CREATE TABLE orders (id UUID, store_id UUID, customer_id UUID, subtotal DECIMAL, estimated_weight DECIMAL, actual_weight DECIMAL, online_payment_amount DECIMAL, pos_terminal_topup DECIMAL, final_total DECIMAL, payment_status ENUM, delivery_status ENUM);
CREATE TABLE order_items (id UUID, order_id UUID, product_id UUID, quantity DECIMAL, unit_price DECIMAL, line_total DECIMAL);
CREATE TABLE payments (id UUID, order_id UUID, method ENUM, amount DECIMAL, status ENUM, transaction_id VARCHAR);
CREATE TABLE subscriptions (id UUID, customer_id UUID, store_id UUID, amount DECIMAL, status ENUM, next_billing_date DATE);

-- Discount-related (for new features)
CREATE TABLE first_order_discounts (id UUID, store_id UUID, customer_id UUID, discount_type ENUM, discount_value DECIMAL, is_used BOOLEAN);
CREATE TABLE promo_codes (id UUID, store_id UUID, code VARCHAR, discount_type ENUM, discount_value DECIMAL, min_order_value DECIMAL, max_uses INT, current_uses INT, usage_per_customer INT, valid_from DATE, valid_until DATE, is_active BOOLEAN);
CREATE TABLE promo_code_usage (id UUID, promo_code_id UUID, customer_id UUID, order_id UUID, discount_amount DECIMAL, used_at TIMESTAMP);
CREATE TABLE delivery_settings (id UUID, store_id UUID, min_order_value_for_free_delivery DECIMAL, delivery_fee DECIMAL);
```

---

## 🛣️ KEY WORKFLOWS (Code these in order)

### **WORKFLOW 1: Customer Order with Discounts**
```
Input: {items, address_id, promo_code (optional)}

Logic:
1. Validate customer subscription_status = 'active'
2. Validate all items exist & are available
3. Calculate subtotal = SUM(item.qty * item.price)
4. Check for first_order_discount (if customer.orders.count = 0)
   - IF exists AND not used: apply to order
5. IF promo_code provided:
   - Validate: is_active, valid_date, min_order, max_uses, per_customer_limit
   - Calculate discount_amount
   - Apply to order
6. Check delivery_fee: IF subtotal < min_order_value_for_free_delivery: add_fee
7. Calculate final_total = subtotal - first_order_discount - promo_discount + delivery_fee
8. Calculate online_payment_amount = (subtotal - first_order_discount - promo_discount + delivery_fee) * 0.95
9. Create Order, Order_Items
10. Return {order_id, breakdown: {subtotal, first_order_discount, promo_discount, delivery_fee, final_total}}

Code Pattern:
function createOrder(customerId, items, addressId, promoCode) {
  // 1. Validate customer & items
  // 2. Calculate discounts (first order, promo)
  // 3. Calculate delivery fee
  // 4. Calculate totals
  // 5. Create order + items
  // 6. Mark first_order_discount as used (if applied)
  // 7. Record promo_code_usage
  // 8. Return order with breakdown
}
```

### **WORKFLOW 2: Validate Promo Code (Real-time)**
```
Input: {promo_code, order_subtotal}

Logic:
1. Find promo_code by code string
2. Check is_active
3. Check valid_from ≤ today ≤ valid_until
4. Check order_subtotal ≥ min_order_value
5. Check current_uses < max_uses
6. Check customer usage count < usage_per_customer
7. IF all valid: return {is_valid: true, discount_amount}
8. ELSE: return {is_valid: false, error_message}

Code Pattern:
function validatePromoCode(code, customerId, orderTotal) {
  const promo = await PromoCode.findOne({code, is_active: true});
  if (!promo) return {is_valid: false, error: 'Invalid code'};
  if (today < promo.valid_from || today > promo.valid_until) return {error: 'Expired'};
  if (orderTotal < promo.min_order_value) return {error: 'Minimum order not met'};
  if (promo.current_uses >= promo.max_uses) return {error: 'Max uses exceeded'};
  const customerUses = await PromoCodeUsage.count({promo_code_id: promo.id, customer_id: customerId});
  if (customerUses >= promo.usage_per_customer) return {error: 'Already used'};
  const discountAmount = promo.discount_type === 'percentage' 
    ? (orderTotal * promo.discount_value / 100) 
    : promo.discount_value;
  return {is_valid: true, discount_amount: discountAmount};
}
```

### **WORKFLOW 3: Weight-based Adjustment**
```
At Checkout:
  estimated_weight = SUM(item.qty * product.avg_weight)
  online_payment_amount = final_total * 0.95

At Delivery (Store Operator Input):
  actual_weight = (from scale)
  
Recalculate:
  weight_ratio = actual_weight / estimated_weight
  final_total = subtotal * weight_ratio (before discounts? or after? clarify)
  pos_terminal_topup = MAX(0, final_total - online_payment_amount)

Code Pattern:
function recordActualWeight(orderId, actualWeight) {
  const order = await Order.findById(orderId);
  const ratio = actualWeight / order.estimated_weight;
  const newTotal = order.subtotal * ratio;
  const topup = Math.max(0, newTotal - order.online_payment_amount);
  await Order.update({
    actual_weight: actualWeight,
    final_total: newTotal,
    pos_terminal_topup: topup
  });
  return {order, topup};
}
```

### **WORKFLOW 4: Create Promo Code (Admin)**
```
Input: {store_id, code, discount_type, discount_value, min_order_value, max_uses, valid_from, valid_until}

Logic:
1. Validate store_id exists
2. Validate code is unique per store
3. Validate discount_type ∈ ['percentage', 'fixed_amount']
4. Validate discount_value > 0
5. Validate valid_from < valid_until
6. Create PromoCode record
7. Return promo_code_id

Code Pattern:
async function createPromoCode(storeId, data) {
  // Validate inputs
  // Check uniqueness
  // Create & return
}
```

---

## 🔐 AUTHORIZATION RULES

**Customer:**
- Can only see store catalog if customer.store_id = requested_store_id
- Can only create orders in own store
- Can only apply promo codes from own store

**Store Operator:**
- Can only access own store's inventory, orders

**Admin Catalog Manager:**
- Can create/edit/delete stores
- Can create/edit/delete products
- Can manage promo codes
- Can set delivery fees
- CAN'T see orders or payments

**Admin Operations:**
- Can view all orders, payments, revenue
- Can manage delivery settings (read promo codes, but not edit)
- CAN'T manage stores or products

**Admin Customers:**
- Can view/manage customers and subscriptions
- CAN'T see orders or products

---

## 📊 API ENDPOINTS (Implement in order)

### **Phase 1: Auth & Core**
```
POST /api/auth/register-phone (phone, store_id) → {customer_id, status}
POST /api/auth/verify-otp (phone, code) → {jwt_token}
POST /api/auth/login-admin (email, password) → {jwt_token, role}
```

### **Phase 2: Catalog & Orders**
```
GET /api/stores/:id/catalog → {products[]}
POST /api/orders {items, address_id, promo_code} → {order_id, breakdown}
GET /api/orders/:id → {order, items, payment, breakdown}
```

### **Phase 3: Discounts**
```
POST /api/orders/:id/validate-promo {code, order_total} → {is_valid, discount_amount}
```

### **Phase 4: Payment & Weight**
```
POST /api/orders/:id/pay-online {method} → {payment_url, qr_url}
PUT /api/my-store/orders/:id/actual-weight {actual_weight} → {order, topup}
```

### **Phase 5: Admin Promo & Delivery**
```
POST /api/admin/promo-codes {code, discount_type, discount_value, ...} → {promo_code_id}
GET /api/admin/promo-codes → {promo_codes[], stats}
PUT /api/admin/delivery-settings/:store_id {min_value, fee} → {updated}
```

---

## ✅ IMPLEMENTATION CHECKLIST

**Priority 1 (Core):**
- [ ] Database schema (13 core tables)
- [ ] Auth (JWT, phone OTP, roles)
- [ ] Store & product catalog
- [ ] Inventory management
- [ ] Customer registration
- [ ] Order creation (without discounts first)

**Priority 2 (Discounts):**
- [ ] First order discount logic
- [ ] Promo code validation
- [ ] Promo code application to orders
- [ ] Promo code management (admin)

**Priority 3 (Delivery & Pricing):**
- [ ] Delivery fee calculation
- [ ] Weight-based price adjustment
- [ ] Delivery settings management (admin)

**Priority 4 (Admin Dashboards):**
- [ ] Catalog Manager dashboard
- [ ] Operations dashboard
- [ ] Customers dashboard

**Priority 5 (Testing & Polish):**
- [ ] Unit tests for discount logic
- [ ] Integration tests for order flow
- [ ] E2E tests
- [ ] Bug fixes

---

## 💡 KEY IMPLEMENTATION NOTES

**Discount Stacking:**
- First order discount + promo code: Can they stack or is it mutually exclusive?
  - **Recommend:** Only one discount per order (customer chooses which one)
  - **Alternative:** Stack them (subtract both from subtotal)
  - **Clarify with owner before implementing**

**Weight Calculation:**
- Should discount be applied BEFORE or AFTER weight adjustment?
  - **Example:** Subtotal 10,000₸, first_order_discount 1,000₸, weight ratio 1.1
  - **Option A:** (10,000 - 1,000) × 1.1 = 9,900₸
  - **Option B:** (10,000 × 1.1) - 1,000 = 10,000₸
  - **Recommend:** Option B (discount is fixed, doesn't scale with weight)

**Promo Code Validation:**
- Must be store-specific (can't use promo code from Store A in Store B)

**First Order Discount:**
- One per customer per store (separate field in first_order_discounts table)
- Auto-apply on first order, mark as used

**Delivery Fee:**
- Per store (different stores may have different minimums & fees)
- Applied AFTER all discounts

---

## 🚀 GETTING STARTED

1. Create database schema (copy SQL above)
2. Start with Priority 1 features (no discounts yet, just basic orders)
3. Add Priority 2 (discount logic)
4. Build Phase 3–5 based on API endpoints

**For each feature, structure code as:**
```
/models     (database models)
/services   (business logic: order.service.js, promo.service.js, etc.)
/routes     (API endpoints)
/middleware (auth, validation)
/utils      (helpers: discount calculation, validation, etc.)
```

---

**Version:** 1.0
**Use with:** Cursor, Codex, or any AI code generator
**Format:** JSON schema reference included in QUICK_START_DEVS.md
