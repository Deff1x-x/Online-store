# ARCHITECTURE & IMPLEMENTATION GUIDE

---

## 🏛️ SYSTEM ARCHITECTURE

```
┌───────────────────────────────────────────────┐
│         Frontend (3 separate apps)            │
├───────────────────────────────────────────────┤
│ • Customer Web (store-specific)               │
│ • Store Operator Dashboard                    │
│ • Admin Dashboards (Catalog, Operations, Customers) │
└────────────────┬────────────────────────────────┘
                 │ (HTTP/REST)
         ┌───────▼──────────┐
         │   API Gateway    │
         │ (rate limit,     │
         │  SSL, logging)   │
         └───────┬──────────┘
                 │
    ┌────────────┴──────────┐
    │                       │
    ▼                       ▼
┌──────────────┐     ┌──────────────┐
│ REST API     │     │ WebSocket    │
│ (Node/Python)│     │ (real-time   │
│              │     │  updates)    │
│ • Auth       │     │              │
│ • Orders     │     └──────────────┘
│ • Payments   │
│ • Analytics  │
└──────┬───────┘
       │
    ┌──┴────────┬────────┬─────────┐
    │           │        │         │
    ▼           ▼        ▼         ▼
PostgreSQL   Redis   Job Queue  S3/Storage
(all data)  (cache)  (async     (images,
           (session) tasks)      receipts)
```

---

## 📊 DATABASE SCHEMA (Full PostgreSQL)

```sql
-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  role ENUM('customer', 'store_operator', 'admin_catalog', 'admin_operations', 'admin_customers'),
  status ENUM('active', 'blocked'),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stores
CREATE TABLE stores (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(500),
  status ENUM('active', 'paused', 'closed') DEFAULT 'active',
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX(status)
);

-- Store Coverage (geographic areas)
CREATE TABLE store_coverage (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  address VARCHAR(500) NOT NULL,
  entrance_count INT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, address),
  INDEX(store_id)
);

-- Products (company-wide catalog)
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit ENUM('kg', 'l', 'pcs', 'box'),
  company_price DECIMAL(10, 2),
  avg_weight DECIMAL(10, 2),
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX(is_active),
  INDEX(category)
);

-- Store Inventory
CREATE TABLE store_inventory (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  product_id UUID NOT NULL REFERENCES products(id),
  selling_price DECIMAL(10, 2) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status ENUM('available', 'low_stock', 'out_of_stock') DEFAULT 'available',
  last_delivery_date TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, product_id),
  INDEX(store_id, status),
  INDEX(store_id, quantity)
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  name VARCHAR(255),
  email VARCHAR(255),
  subscription_status ENUM('active', 'paused', 'cancelled') DEFAULT 'active',
  subscription_start_date DATE,
  subscription_end_date DATE,
  subscription_auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, phone),
  INDEX(store_id, subscription_status),
  INDEX(subscription_end_date)
);

-- Customer Addresses
CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  store_coverage_id UUID NOT NULL REFERENCES store_coverage(id),
  entrance INT,
  floor INT,
  apartment INT,
  entrance_code VARCHAR(50),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(customer_id)
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  delivery_address_id UUID NOT NULL REFERENCES customer_addresses(id),
  subtotal DECIMAL(10, 2),
  estimated_weight DECIMAL(10, 2),
  actual_weight DECIMAL(10, 2),
  online_payment_amount DECIMAL(10, 2),
  pos_terminal_topup DECIMAL(10, 2),
  final_total DECIMAL(10, 2),
  payment_status ENUM('pending', 'online_paid', 'fully_paid', 'cancelled') DEFAULT 'pending',
  delivery_status ENUM('new', 'picked', 'in_delivery', 'delivered', 'failed') DEFAULT 'new',
  delivery_date DATE,
  delivery_time_slot VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX(store_id, delivery_date),
  INDEX(customer_id),
  INDEX(payment_status),
  INDEX(delivery_status)
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  line_total DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(order_id)
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  method ENUM('online_card', 'qr_kaspi', 'qr_halyk', 'pos_terminal'),
  amount DECIMAL(10, 2),
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  transaction_id VARCHAR(255),
  receipt_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX(order_id),
  INDEX(status)
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  amount DECIMAL(10, 2),
  billing_period ENUM('monthly', 'yearly') DEFAULT 'monthly',
  status ENUM('active', 'paused', 'cancelled') DEFAULT 'active',
  next_billing_date DATE,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  cancelled_at TIMESTAMP,
  UNIQUE(customer_id, store_id),
  INDEX(next_billing_date),
  INDEX(status)
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(100),
  entity_id UUID,
  action VARCHAR(50),
  changed_by UUID REFERENCES users(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(entity_type, entity_id),
  INDEX(created_at)
);

-- Consent Log (for subscriptions & terms agreement)
CREATE TABLE consent_logs (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  consent_type VARCHAR(100),
  agreed_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(customer_id)
);

-- Promo Codes
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type ENUM('percentage', 'fixed_amount'),
  discount_value DECIMAL(10, 2),
  min_order_value DECIMAL(10, 2),
  max_uses INT,
  current_uses INT DEFAULT 0,
  usage_per_customer INT DEFAULT 1,
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(store_id, is_active)
);

-- Promo Code Usage Tracking
CREATE TABLE promo_code_usage (
  id UUID PRIMARY KEY,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES orders(id),
  discount_amount DECIMAL(10, 2),
  used_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(promo_code_id, customer_id, order_id)
);

-- First Order Discount (per store, per customer)
CREATE TABLE first_order_discounts (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  discount_type ENUM('percentage', 'fixed_amount'),
  discount_value DECIMAL(10, 2),
  applied_at TIMESTAMP,
  order_id UUID REFERENCES orders(id),
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, customer_id)
);

-- Delivery Fee Settings
CREATE TABLE delivery_settings (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  min_order_value_for_free_delivery DECIMAL(10, 2),
  delivery_fee DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id)
);
```

---

## 🛣️ API ENDPOINTS (Complete List)

### **AUTH**
```
POST /api/auth/register-phone
  Input: {phone, store_id}
  Output: {customer_id, status: "otp_sent"}
  Error: store not found, phone invalid, duplicate

POST /api/auth/verify-otp
  Input: {phone, code}
  Output: {jwt_token, refresh_token}
  Error: invalid code, code expired

POST /api/auth/login-admin
  Input: {email, password}
  Output: {jwt_token, refresh_token, user_id, role}
  Error: invalid credentials

POST /api/auth/refresh
  Input: {refresh_token}
  Output: {jwt_token}
  Error: invalid refresh token

POST /api/auth/logout
  Input: {}
  Output: {status: "ok"}
```

### **CUSTOMER: Profile**
```
GET /api/my-profile
  Output: {id, phone, name, email, subscription_status, addresses[]}
  Auth: customer only

PUT /api/my-profile
  Input: {name, email}
  Output: {updated customer}
  Auth: customer only

POST /api/my-addresses
  Input: {coverage_id, entrance, floor, apartment, entrance_code}
  Output: {address_id}
  Auth: customer only
  Validation: coverage_id must be in customer's store

GET /api/my-addresses
  Output: {addresses[]}
  Auth: customer only

DELETE /api/my-addresses/:id
  Output: {status: "deleted"}
  Auth: customer only
  Validation: must have at least one address
```

### **CUSTOMER: Catalog & Orders**
```
GET /api/stores/:id/catalog
  Query: ?category=X&search=Y&page=1
  Output: {products[], pagination}
  Auth: customer (store_id must match), public access (no personal data)
  Filter: status = 'available' only, is_active = true

GET /api/stores/:id/catalog/:product_id
  Output: {product, store_price, store_quantity, image}
  Auth: as above

POST /api/orders
  Input: {items: [{product_id, qty}, ...], address_id, promo_code: "PROMO123"}
  Calculations: estimated_weight, online_payment_amount, discounts, delivery_fee
  Output: {order_id, order_number, payment_options, breakdown: {subtotal, first_order_discount, promo_discount, delivery_fee, final_total}}
  Auth: customer only
  Validation: customer.subscription_status = 'active'
  Logic:
    - Apply first_order_discount if exists and not used
    - Validate promo_code: check is_active, valid dates, min_order, usage limits, per-customer limit
    - Calculate delivery_fee: if subtotal < min_order_value_for_free_delivery, add fee
    - Final total = subtotal - first_order_discount - promo_discount + delivery_fee

GET /api/orders/:id
  Output: {order, items[], payment, delivery_status, breakdown: {discounts_applied, delivery_fee}}
  Auth: customer (must own order) or store_operator/admin_operations

GET /api/my-orders
  Query: ?status=X&date_from=Y&page=1
  Output: {orders[], pagination}
  Auth: customer only

POST /api/orders/:id/validate-promo
  Input: {promo_code, order_total}
  Output: {is_valid: true/false, discount_amount, error_message}
  Auth: customer only
  Purpose: Real-time validation before checkout

POST /api/orders/:id/pay-online
  Input: {method: "kaspi_qr"}
  Output: {payment_url, qr_url, expires_at}
  Auth: customer only
  Validation: order exists, payment_status = 'pending'

POST /api/orders/:id/cancel
  Input: {}
  Output: {status: "cancelled"}
  Auth: customer (if delivery_status = 'new') or admin_operations
```

### **STORE OPERATOR**
```
GET /api/my-store/orders
  Query: ?date=X&status=Y
  Output: {orders[], totals}
  Auth: store_operator only (own store)

PUT /api/my-store/orders/:id/status
  Input: {status: "new"|"picked"|"in_delivery"|"delivered"|"failed"}
  Output: {order, updated_at}
  Auth: store_operator only

PUT /api/my-store/orders/:id/actual-weight
  Input: {actual_weight: 16.2}
  Calculation: final_total, pos_terminal_topup
  Output: {order, topup_needed}
  Auth: store_operator only

GET /api/my-store/inventory
  Output: {products[], quantity, status, last_delivery}
  Auth: store_operator only (own store)

PUT /api/my-store/inventory/:product_id
  Input: {selling_price, status}
  Output: {updated inventory}
  Auth: store_operator only

POST /api/my-store/inventory/:product_id/incoming
  Input: {quantity}
  Action: quantity += input, auto-set status='available'
  Output: {inventory}
  Auth: store_operator only

GET /api/my-store/analytics
  Output: {daily_revenue, total_orders, top_products, delivery_performance}
  Auth: store_operator only
```

### **ADMIN: CATALOG MANAGER**
```
GET /api/admin/stores
  Output: {stores[]}
  Auth: admin_catalog only

POST /api/admin/stores
  Input: {name, location, operating_hours, delivery_time}
  Output: {store_id}
  Auth: admin_catalog only

PUT /api/admin/stores/:id
  Input: {name, status, settings}
  Output: {updated store}
  Auth: admin_catalog only

DELETE /api/admin/stores/:id
  Output: {status: "deleted"}
  Auth: admin_catalog only
  Validation: no active orders, no active subscriptions

POST /api/admin/coverage
  Input: {store_id, addresses: [{address, entrances}, ...]}
  Output: {coverage_ids[]}
  Auth: admin_catalog only

GET /api/admin/products
  Output: {products[]}
  Auth: admin_catalog, admin_operations, admin_customers (read-only)

POST /api/admin/products
  Input: {name, category, unit, company_price, avg_weight, image_url}
  Output: {product_id}
  Auth: admin_catalog only

PUT /api/admin/products/:id
  Input: {name, category, company_price, ...}
  Output: {updated product}
  Auth: admin_catalog only

DELETE /api/admin/products/:id
  Output: {status: "soft_deleted"}
  Auth: admin_catalog only

GET /api/admin/promo-codes
  Query: ?store_id=X&is_active=true
  Output: {promo_codes[], usage_stats}
  Auth: admin_catalog, admin_operations

POST /api/admin/promo-codes
  Input: {store_id, code, discount_type, discount_value, min_order_value, max_uses, valid_from, valid_until}
  Output: {promo_code_id}
  Auth: admin_catalog only

PUT /api/admin/promo-codes/:id
  Input: {discount_value, max_uses, is_active, valid_until}
  Output: {updated promo_code}
  Auth: admin_catalog only

DELETE /api/admin/promo-codes/:id
  Output: {status: "deleted"}
  Auth: admin_catalog only

GET /api/admin/promo-codes/:id/usage
  Output: {total_uses, usage_per_customer: [{customer_id, uses, last_used}], revenue_impact}
  Auth: admin_operations

GET /api/admin/delivery-settings/:store_id
  Output: {min_order_value_for_free_delivery, delivery_fee}
  Auth: admin_catalog

PUT /api/admin/delivery-settings/:store_id
  Input: {min_order_value_for_free_delivery, delivery_fee}
  Output: {updated settings}
  Auth: admin_catalog only

GET /api/admin/first-order-discounts
  Query: ?store_id=X&used=true|false
  Output: {discounts[], usage_stats}
  Auth: admin_operations

POST /api/admin/first-order-discounts
  Input: {store_id, discount_type, discount_value}
  Output: {status: "configured"}
  Auth: admin_catalog only

GET /api/admin/stores/:id/inventory
  Output: {products[], store_price, quantity, status, last_delivery}
  Auth: admin_catalog, admin_operations

PUT /api/admin/stores/:id/inventory/:product_id
  Input: {selling_price, status}
  Output: {updated inventory}
  Auth: admin_catalog only

POST /api/admin/stores/:id/inventory/:product_id/incoming
  Input: {quantity, notes}
  Output: {inventory}
  Auth: admin_catalog only
```

### **ADMIN: OPERATIONS MONITOR**
```
GET /api/admin/orders
  Query: ?store_id=X&date_from=Y&status=Z&page=1
  Output: {orders[], pagination, totals}
  Auth: admin_operations only

GET /api/admin/orders/:id
  Output: {order, items, payment, weight_info, delivery_address}
  Auth: admin_operations, admin_customers (limited)

PUT /api/admin/orders/:id/status
  Input: {status}
  Output: {updated order}
  Auth: admin_operations only

GET /api/admin/payments
  Query: ?method=X&status=Y&date_from=Z
  Output: {payments[], totals by method}
  Auth: admin_operations only

GET /api/admin/analytics/revenue
  Query: ?granularity=daily|weekly|monthly&store_id=X&date_from=Y
  Output: {revenue_data[], charts}
  Auth: admin_operations only

GET /api/admin/analytics/delivery
  Output: {on_time_%, failed_%, average_time}
  Auth: admin_operations only

POST /api/admin/export/orders
  Input: {format: "csv"|"xlsx", date_from, date_to}
  Output: {download_url}
  Auth: admin_operations only
```

### **ADMIN: CUSTOMERS MONITOR**
```
GET /api/admin/customers
  Query: ?store_id=X&subscription_status=Y&page=1
  Output: {customers[], pagination}
  Auth: admin_customers only

GET /api/admin/customers/:id
  Output: {customer, subscription_info, order_count, consent_logs}
  Auth: admin_customers only

PUT /api/admin/customers/:id/subscription/renew
  Input: {}
  Action: extend subscription_end_date by 1 month
  Output: {subscription}
  Auth: admin_customers only

PUT /api/admin/customers/:id/subscription/cancel
  Input: {reason}
  Output: {subscription}
  Auth: admin_customers only

PUT /api/admin/customers/:id/subscription/pause
  Input: {duration_days}
  Output: {subscription}
  Auth: admin_customers only

GET /api/admin/subscriptions
  Query: ?status=X&expiring_in_days=7
  Output: {subscriptions[], alerts}
  Auth: admin_customers only

GET /api/admin/audit-logs/consents
  Query: ?customer_id=X&date_from=Y
  Output: {consent_logs[]}
  Auth: admin_customers only

POST /api/admin/export/customers
  Input: {format, store_id, status_filter}
  Output: {download_url}
  Auth: admin_customers only
```

### **WEBHOOKS**
```
POST /webhooks/kaspi
  (called by Kaspi payment gateway)
  Input: {invoiceId, status, amount, timestamp, signature}
  Action: verify signature, update order.payment_status
  Output: {status: "ok"}

POST /webhooks/1c
  (future: called by 1C for inventory sync)
  Input: {products[], timestamp}
  Output: {status: "ok"}
```

---

## 🏃 DEVELOPMENT PHASES

### **PHASE 1: Foundation (Weeks 1–2)**

**Checklist:**
- [ ] Repository setup (GitHub)
- [ ] CI/CD pipeline (GitHub Actions → staging)
- [ ] Docker setup (docker-compose for local dev)
- [ ] Database (PostgreSQL, migrations via Knex/Sequelize)
- [ ] API boilerplate (Express/FastAPI)
- [ ] Environment config (.env, secrets)
- [ ] Error handling & logging (Winston/Pino)
- [ ] Auth middleware (JWT, RBAC)
- [ ] User model & roles (customer, store_op, 3 admins)

**Code Skeleton:**
```javascript
// Backend structure
/src
  /api
    /auth (register, verify, login)
    /customer (profile, orders)
    /store (inventory, operations)
    /admin (catalog, operations, customers)
  /middleware (auth, error, logging)
  /services (auth, payment, email)
  /models (User, Store, Order, etc.)
  /utils (validation, helpers)
  /config (database, env)
  /migrations (database)
  index.js
```

**Effort:** 20–24 hours

---

### **PHASE 2: Core Data Models (Weeks 2–3)**

**Checklist:**
- [ ] Store CRUD (create, list, edit, delete)
- [ ] Store coverage (add/remove geographic areas)
- [ ] Product CRUD (company catalog)
- [ ] Inventory CRUD (per store)
- [ ] Customer registration (phone OTP)
- [ ] Customer addresses (from coverage)
- [ ] Subscription creation & validation
- [ ] Order creation (basic)

**Effort:** 24–32 hours

---

### **PHASE 3: Orders & Checkout (Week 4)**

**Checklist:**
- [ ] Order creation with estimated weight calculation
- [ ] Order items (link products to order)
- [ ] Cart validation (check inventory)
- [ ] Online payment flow (Kaspi QR integration)
- [ ] Webhook handling (payment confirmation)
- [ ] Order status tracking (customer view)
- [ ] Weight adjustment logic (actual vs. estimated)
- [ ] POS topup calculation

**Effort:** 32–40 hours (payment integration is complex)

---

### **PHASE 4: Admin Dashboards (Week 5)**

**Checklist:**
- [ ] **Admin 1 (Catalog)**: Store management, product CRUD, inventory levels
- [ ] **Admin 2 (Operations)**: Orders table, payment tracking, revenue analytics
- [ ] **Admin 3 (Customers)**: Customer lists, subscriptions, renewal tracking
- [ ] Real-time updates (WebSocket or polling)
- [ ] Export functionality (CSV/Excel)

**Effort:** 40–48 hours (UI complexity)

---

### **PHASE 5: Store Operator Dashboard (Week 5)**

**Checklist:**
- [ ] Daily orders view
- [ ] Inventory management
- [ ] Order status updates
- [ ] Weight input & topup calculation
- [ ] Basic analytics (revenue, top items)

**Effort:** 16–20 hours

---

### **PHASE 6: Testing & Polish (Week 6)**

**Checklist:**
- [ ] Unit tests (auth, orders, weight calc)
- [ ] Integration tests (full order flow)
- [ ] E2E tests (Cypress or Selenium)
- [ ] Payment gateway testing (Kaspi sandbox)
- [ ] Bug fixes & QA
- [ ] Performance optimization
- [ ] Security audit (OWASP Top 10)

**Effort:** 24–32 hours

---

## 📋 DEPLOYMENT CHECKLIST

**Pre-Production:**
- [ ] All database migrations applied
- [ ] Secrets configured (API keys, DB passwords)
- [ ] SSL certificate installed
- [ ] Monitoring & alerting set up (Datadog, Sentry)
- [ ] Database backups configured
- [ ] CI/CD pipeline tested
- [ ] API rate limiting enabled
- [ ] CORS configured properly

**Go-Live:**
- [ ] Smoke test (manual E2E flow)
- [ ] Monitor logs for errors
- [ ] Check payment webhook delivery
- [ ] Verify SMS notifications
- [ ] Have rollback plan ready
- [ ] On-call support assigned

---

## 🔍 SECURITY CHECKLIST

- [ ] All inputs validated (no SQL injection, XSS)
- [ ] Passwords hashed (bcrypt, 10+ rounds)
- [ ] JWT secrets stored securely
- [ ] Webhook signatures verified (Kaspi)
- [ ] Rate limiting on auth endpoints
- [ ] No personal data in logs
- [ ] HTTPS only (no HTTP)
- [ ] CORS whitelist configured
- [ ] Error messages don't leak data (no stack traces to client)
- [ ] Database transactions for payment flows (atomic)
- [ ] Audit logs for all admin actions

---

**Version:** 1.0
**Date:** 28 November 2025
