# MULTI-STORE SUBSCRIPTION E-COMMERCE PLATFORM
## Technical Quick Start

---

## 📱 SYSTEM OVERVIEW

**Multi-tenant SaaS platform where:**
- Each store manages its own inventory, subscriptions, and orders
- Customers subscribe to **one specific store** only and see only that store's catalog
- Customers place orders, pay online (5% discount) or via POS terminal at delivery
- Order fulfillment involves weight measurement (estimated vs. actual) and price adjustment

**Discount & Pricing Features:**
- First order discount (automatic, per customer per store)
- Promo codes (manual entry, percentage or fixed amount)
- Minimum order value for free delivery (below threshold = delivery fee charged)

**Three core user types:**
1. **Customers** (subscribers): register for a store → browse → order → pay/receive
2. **Store Operators** (per-store): manage their store's inventory and operations
3. **Three Admin Roles** (see below)

---

## 👥 THE THREE ADMIN ROLES (SEPARATE DASHBOARDS)

### **ADMIN ROLE 1: Catalog & Inventory Manager**
**Manages:** Store structure, product catalog, stock levels

**Capabilities:**
- Create / edit / delete stores
- Assign which stores serve which geographic areas (coverage)
- Create / edit / delete products in company catalog
- Set company-wide product prices
- Monitor stock levels per store
- Mark products as "out of stock" per store
- View inventory history and movements

**Does NOT see:** Orders, payments, customer data

**UI Components:**
- Store management (list, create form, edit, delete)
- Product catalog (CRUD, bulk import)
- Inventory dashboard (stock by store, low-stock alerts)

---

### **ADMIN ROLE 2: Operations & Finance Monitor**
**Manages:** Orders, payments, deliveries, financial data

**Capabilities:**
- View all orders across all stores (with filters by date, store, status)
- Track payment status (online paid, pending POS, fully paid)
- Track delivery status (new, picked, in_delivery, delivered)
- View payment methods used (online vs. POS terminal)
- Monitor revenue by store, by product, by date
- See which orders need POS topup (weight difference)
- Generate financial reports (daily/weekly/monthly)
- Print manifests for deliveries

**Does NOT see:** Product management, customer personal data

**UI Components:**
- Orders dashboard (table with filters, search)
- Payment tracking (status, method, amount)
- Revenue analytics (by store, by date range)
- Delivery tracking (real-time status)

---

### **ADMIN ROLE 3: Customer & Subscription Monitor**
**Manages:** Customers, subscriptions, customer data

**Capabilities:**
- View all customers per store (list with basic info)
- Track subscription status (active, paused, expired)
- View subscription history (start date, renewal dates, cancellations)
- Activate / pause / cancel subscriptions manually
- View customer contact info
- Monitor subscription expirations (due today, due this week)
- Track subscription renewals (auto-renew activity)
- See consent logs (when customer agreed to terms)
- Export customer lists

**Does NOT see:** Order details, payment amounts, inventory

**UI Components:**
- Customer list (filterable, searchable)
- Subscription status dashboard
- Renewal alerts
- Consent audit logs

---

## 🏗️ ARCHITECTURE AT A GLANCE

```
┌─────────────────────────────────────────────┐
│     Customer Web (per store, phone login)   │
│     Browse → Cart → Checkout → Pay/Deliver │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
    ┌────▼─────┐         ┌────▼────────┐
    │ Store Op  │         │ Three Admins│
    │ Dashboard │         ├─ Catalog    │
    │(per store)│         ├─ Operations │
    │           │         └─ Customers  │
    └────┬─────┘          └────┬────────┘
         │                     │
         └─────────┬───────────┘
                   │
         ┌─────────▼──────────┐
         │   REST API         │
         │ (role-based access)│
         └─────────┬──────────┘
                   │
    ┌──────────────┴──────────────┐
    │                             │
    ▼                             ▼
PostgreSQL                     Redis (cache)
(all data)                      (sessions)
```

---

## 🗄️ DATABASE ESSENTIALS

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `stores` | Store locations | id, name, location, status, settings |
| `store_coverage` | Geographic areas served | store_id, address, active |
| `products` | Product catalog | id, name, category, company_price, is_active |
| `store_inventory` | Stock per store | store_id, product_id, selling_price, quantity, status |
| `customers` | Subscribers | id, phone, store_id, subscription_status |
| `orders` | Purchases | id, store_id, customer_id, subtotal, **estimated_weight**, **actual_weight**, payment_status, delivery_status |
| `payments` | Payment records | id, order_id, method, amount, status, timestamp |
| `subscriptions` | Subscription records | id, customer_id, store_id, status, next_billing_date, auto_renew |

**Critical logic:**
- Online payment = subtotal × 0.95 (5% discount)
- Topup amount = (actual_weight / estimated_weight) × subtotal - online_paid

---

## 📍 CORE WORKFLOWS

### **Workflow 1: Customer Subscribes**
```
1. Visit store site (URL provided)
2. Enter phone → receive SMS OTP
3. Verify OTP → customer account created for THIS store
4. Enter name, email, delivery address (picked from store coverage)
5. Pay subscription fee (online only)
6. Subscription activated → can now browse catalog
```

### **Workflow 2: Customer Orders**
```
1. Browse catalog (only products from THEIR store, only available items)
2. Add to cart
3. Checkout:
   - Show estimated weight (~15kg)
   - Show online price: subtotal × 0.95
   - Option: pay online OR pay at delivery via POS
4. If online: show Kaspi QR → customer scans → payment processed
5. If POS: note for payment at delivery
6. Order status: "new" → store operator picks & prepares
7. Operator updates actual_weight
8. Delivery: if POS option, charge remaining (topup calculated)
9. Order status: "delivered"
```

### **Workflow 3: Store Operator Processes Orders**
```
1. Log in (store-specific dashboard)
2. See "Orders for today" list
3. Pick items, weigh them
4. Enter actual_weight into system
5. System calculates topup (if needed)
6. Assign courier
7. Courier has POS terminal to collect topup
8. Mark as delivered when done
```

### **Workflow 4: Admin Role 1 (Catalog Manager) Creates Store**
```
1. Log in (company-wide admin)
2. Go to "Stores" section
3. Click "Create store"
4. Fill: name, location, operating hours, delivery time
5. Add coverage areas (which addresses this store serves)
6. Add products to store (from company catalog)
7. Set prices per store (can override company price)
8. Activate store
```

### **Workflow 5: Admin Role 2 (Operations) Monitors Orders**
```
1. Log in (company-wide admin)
2. Dashboard shows:
   - All orders (filter by date, store, status)
   - Payment status breakdown (how many paid online vs. POS vs. pending)
   - Revenue today/this week/this month
   - Delivery performance (on-time %, failed deliveries)
3. Can drill down: see specific order details, payment method, delivery status
4. Export data to CSV/Excel for reporting
```

### **Workflow 6: Admin Role 3 (Customers) Monitors Subscriptions**
```
1. Log in (company-wide admin)
2. See:
   - Total active subscriptions per store
   - List of all customers (filterable)
   - Subscription status (active, expired, paused)
   - Next renewal dates (alerts for expirations)
   - Customer contact details
3. Can manually renew or cancel subscriptions if needed
4. View consent logs (audit trail: when each customer agreed to terms)
```

---

## 🔐 AUTHENTICATION & AUTHORIZATION

```
Customer:
  - Phone + SMS OTP (no password)
  - JWT token (short-lived, 1 hour)
  - Access: own profile, own store's catalog, own orders
  - Constraint: customer.store_id must match requested resource.store_id

Store Operator:
  - Email + password (or SSO)
  - JWT token
  - Access: their assigned store's inventory, orders, returns
  - Constraint: operator.store_id must match requested resource.store_id

Admin (Catalog Manager):
  - Email + password
  - JWT token with role: "admin_catalog"
  - Access: stores (CRUD), products (CRUD), inventory levels
  - No access: orders, payments, customer data

Admin (Operations):
  - Email + password
  - JWT token with role: "admin_operations"
  - Access: all orders, payments, delivery tracking, revenue reports
  - No access: customer data, product/inventory management

Admin (Customers):
  - Email + password
  - JWT token with role: "admin_customers"
  - Access: customer lists, subscriptions, consent logs
  - No access: orders, payments, inventory
```

**Per-endpoint authorization:**
```
GET /api/stores/:id/catalog
  → Check: user.store_id == :id (customer role)

GET /api/admin/stores
  → Check: user.role == "admin_catalog"

GET /api/admin/orders
  → Check: user.role == "admin_operations"

GET /api/admin/customers
  → Check: user.role == "admin_customers"

PUT /api/stores/:id/inventory/:product_id
  → Check: user.store_id == :id (store operator role)
```

---

## 💳 PAYMENT FLOW (CRITICAL)

**Problem:** Weight varies unpredictably. Can't know exact price at checkout.

**Solution:**

```
At Checkout:
├─ estimated_weight = sum of product weights (avg) = 15 kg
├─ online_payment_amount = subtotal * 0.95 = 9,500 ₸
├─ customer_sees = "~15kg, pay 9,500₸ online OR full price at delivery"
└─ customer_chooses: online_pay OR pos_pay

If online_pay:
├─ generate Kaspi QR
├─ customer scans, pays 9,500₸
├─ webhook: mark as "online_paid"
└─ courier delivers, no additional payment

If pos_pay:
├─ note: "Collect payment at delivery"
├─ courier goes with POS terminal
├─ at store: measure actual_weight = 16.2 kg
├─ calculate: final_total = subtotal * (16.2 / 15) = 10,404₸
├─ topup_needed = 10,404 - 0 = 10,404₸ (customer pays full amount)
├─ OR if they prepaid online:
│  └─ topup_needed = 10,404 - 9,500 = 904₸
├─ courier collects on POS terminal
└─ print receipt, mark as "delivered"
```

---

## 🚀 TECH STACK RECOMMENDATION

| Component | Recommended |
|-----------|------------|
| Backend | Node.js + Express OR Python + FastAPI |
| Database | PostgreSQL |
| Cache | Redis |
| Frontend (Customer) | React / Vue.js |
| Frontend (Store Operator) | React Admin OR custom React + Material-UI |
| Frontend (Admin Dashboards) | React Admin OR Refine.dev (3 separate instances) |
| Hosting | Docker + Heroku / AWS ECS / DigitalOcean |
| Payments | Kaspi API (webhook integration) |

---

## ⚠️ HARDEST PARTS

1. **Weight & Price Calculation**
   - Estimated at checkout, actual at delivery
   - Topup logic (if actual > estimated)
   - Refund logic (if actual < estimated)
   - Edge cases: customer paid online but overage, customer paid at terminal but underweight
   - Effort: 2–3 days, heavy testing

2. **Multi-tenancy & Authorization**
   - Every query MUST be scoped to store_id or role
   - Data leak bugs are easy to miss
   - Customer from Store A should never see Store B's catalog
   - Effort: 3–4 days, thorough code review + security testing

3. **Three Admin Dashboards (Separation of Concerns)**
   - Three different role types need three different UIs
   - They have overlapping data (e.g., both ops and finance need "orders")
   - But different filters and access levels
   - Effort: 4–6 days, careful API design to support all three

4. **Payment Integration**
   - Kaspi QR generation, webhook handling
   - Webhook signature verification, idempotency checks
   - Multiple payment methods in future (Halyk, etc.)
   - Effort: 2–3 weeks including testing

5. **Real-time Updates**
   - Store operator needs to see orders appearing live
   - Admin needs real-time revenue updates
   - Implement via WebSocket or polling
   - Effort: 2–3 days

---

## 📋 MVP SCOPE (4–6 weeks, 2 developers)

**Phase 1 (Weeks 1–2): Foundation**
- Auth (phone OTP for customers, email/password for admins)
- Database schema + migrations
- API boilerplate (role-based middleware)

**Phase 2 (Weeks 2–3): Core Features**
- Store management (create, list)
- Product catalog (CRUD)
- Customer registration & profile
- Subscriptions (create, check status)
- Store operator inventory management

**Phase 3 (Week 4): Orders & Payments**
- Catalog view (customer)
- Cart & checkout
- Online payment (Kaspi QR)
- Order tracking

**Phase 4 (Week 5): Admin Dashboards**
- Admin 1: Catalog & Inventory dashboard
- Admin 2: Operations & Orders dashboard
- Admin 3: Customers & Subscriptions dashboard

**Phase 5 (Week 6): Polish**
- Testing (unit, integration, E2E)
- Bug fixes
- Performance optimization
- Security audit

---

## 📊 DATABASE SCHEMA (PostgreSQL)

```sql
-- Stores
CREATE TABLE stores (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  location VARCHAR(500),
  status ENUM('active', 'paused', 'closed'),
  settings JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Coverage
CREATE TABLE store_coverage (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  address VARCHAR(500),
  active BOOLEAN,
  UNIQUE(store_id, address)
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100),
  unit ENUM('kg', 'l', 'pcs'),
  company_price DECIMAL(10, 2),
  is_active BOOLEAN,
  created_at TIMESTAMP
);

-- Inventory
CREATE TABLE store_inventory (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  product_id UUID REFERENCES products(id),
  selling_price DECIMAL(10, 2),
  quantity DECIMAL(10, 2),
  status ENUM('available', 'low_stock', 'out_of_stock'),
  updated_at TIMESTAMP,
  UNIQUE(store_id, product_id),
  INDEX(store_id, status)
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  phone VARCHAR(20),
  store_id UUID REFERENCES stores(id),
  name VARCHAR(255),
  email VARCHAR(255),
  subscription_status ENUM('active', 'paused', 'cancelled'),
  subscription_end_date DATE,
  created_at TIMESTAMP,
  UNIQUE(store_id, phone),
  INDEX(store_id, subscription_status)
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE,
  store_id UUID REFERENCES stores(id),
  customer_id UUID REFERENCES customers(id),
  subtotal DECIMAL(10, 2),
  estimated_weight DECIMAL(10, 2),
  actual_weight DECIMAL(10, 2),
  online_payment_amount DECIMAL(10, 2),
  pos_terminal_topup DECIMAL(10, 2),
  final_total DECIMAL(10, 2),
  payment_status ENUM('pending', 'online_paid', 'fully_paid', 'cancelled'),
  delivery_status ENUM('new', 'picked', 'in_delivery', 'delivered', 'failed'),
  delivery_date DATE,
  created_at TIMESTAMP,
  delivered_at TIMESTAMP,
  INDEX(store_id, delivery_date),
  INDEX(customer_id),
  INDEX(payment_status)
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  method ENUM('online_card', 'qr_kaspi', 'pos_terminal'),
  amount DECIMAL(10, 2),
  status ENUM('pending', 'completed', 'failed'),
  transaction_id VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  store_id UUID REFERENCES stores(id),
  amount DECIMAL(10, 2),
  status ENUM('active', 'paused', 'cancelled'),
  next_billing_date DATE,
  auto_renew BOOLEAN,
  created_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  UNIQUE(customer_id, store_id)
);
```

---

## 🔗 API ENDPOINTS (Core)

```
AUTH
  POST /api/auth/register-phone           (phone, store_id)
  POST /api/auth/verify-otp               (phone, code)
  POST /api/auth/login-admin              (email, password)
  POST /api/auth/refresh                  (refresh_token)

CUSTOMER
  GET  /api/stores/:id/catalog            (products from store)
  POST /api/orders                        (items, address)
  GET  /api/orders/:id
  GET  /api/my-orders                     (filtered list)
  POST /api/orders/:id/pay-online         (initiate Kaspi)
  GET  /api/my-profile
  PUT  /api/my-profile

STORE OPERATOR
  GET  /api/my-store/orders               (today, with filters)
  PUT  /api/my-store/orders/:id/status    (new/picked/in_delivery/delivered)
  GET  /api/my-store/inventory
  PUT  /api/my-store/inventory/:pid       (price, qty, status)
  POST /api/my-store/inventory/:pid/incoming  (receive stock)

ADMIN: CATALOG MANAGER
  GET  /api/admin/stores
  POST /api/admin/stores                  (create store)
  PUT  /api/admin/stores/:id              (edit)
  DELETE /api/admin/stores/:id
  GET  /api/admin/products
  POST /api/admin/products
  PUT  /api/admin/products/:id
  GET  /api/admin/stores/:id/inventory    (stock levels)

ADMIN: OPERATIONS
  GET  /api/admin/orders                  (all, filterable)
  GET  /api/admin/orders/:id
  GET  /api/admin/payments                (status, method, amount)
  GET  /api/admin/analytics/revenue       (by date, by store)
  GET  /api/admin/analytics/delivery      (performance metrics)

ADMIN: CUSTOMERS
  GET  /api/admin/customers               (list, filterable)
  GET  /api/admin/customers/:id
  GET  /api/admin/subscriptions           (status, expiry)
  POST /api/admin/subscriptions/:cid/renew
  POST /api/admin/subscriptions/:cid/cancel
  GET  /api/admin/audit-logs/consents
```

---

## 💾 DEVELOPMENT CHECKLIST

**Phase 1: Foundation**
- [ ] Repository setup (CI/CD)
- [ ] Database (migrations)
- [ ] Auth middleware (JWT, RBAC)
- [ ] Error handling & logging

**Phase 2: Store & Products**
- [ ] Store CRUD endpoints
- [ ] Product CRUD endpoints
- [ ] Inventory management per store
- [ ] Store operator dashboard (basic)

**Phase 3: Customers & Orders**
- [ ] Customer registration (phone OTP)
- [ ] Subscription creation
- [ ] Order creation
- [ ] Weight calculation logic

**Phase 4: Payments**
- [ ] Kaspi API integration
- [ ] Online payment flow
- [ ] POS topup logic
- [ ] Payment status tracking

**Phase 5: Admin Dashboards**
- [ ] Catalog manager dashboard (stores, products, inventory)
- [ ] Operations dashboard (orders, payments, revenue)
- [ ] Customers dashboard (subscriptions, renewals)

**Phase 6: Testing & Deploy**
- [ ] Unit tests (auth, orders, payments)
- [ ] Integration tests (full flows)
- [ ] Database backups configured
- [ ] Monitoring & alerting
- [ ] Production deployment

---

**Version:** 1.0 (Technical specification only)
**Date:** 28 November 2025
