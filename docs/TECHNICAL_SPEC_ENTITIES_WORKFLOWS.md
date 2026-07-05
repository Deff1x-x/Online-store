# TECHNICAL SPECIFICATION — FULL

---

## 🗄️ CORE ENTITIES & RELATIONSHIPS

### **1. STORE**
```
Store
├── id: UUID (primary key)
├── name: string
├── location: string (address)
├── status: enum [active, paused, closed]
├── settings: JSONB
│   ├── operating_hours: "09:00-21:00"
│   ├── delivery_time_min: 15 (minutes)
│   ├── delivery_time_max: 20 (minutes)
│   ├── online_payment_discount: 5.0 (percent)
│   └── pos_terminal_required: boolean
├── created_at: timestamp
└── updated_at: timestamp
```

**Relationships:**
- 1 Store → Many Store_Coverage (geographic areas)
- 1 Store → Many Products (via Store_Inventory)
- 1 Store → Many Customers
- 1 Store → Many Orders
- 1 Store → Many Subscriptions

---

### **2. STORE COVERAGE**
```
Store_Coverage
├── id: UUID
├── store_id: UUID (FK → Store)
├── address: string (e.g., "Street Name, Building 10")
├── entrance_count: int
├── active: boolean
└── created_at: timestamp

Constraint: UNIQUE(store_id, address)
```

Purpose: Define which geographic addresses (streets, buildings) this store serves.

---

### **3. PRODUCT**
```
Product
├── id: UUID
├── name: string
├── category: enum [Vegetables, Fruits, Dairy, Meat, Bakery, Other]
├── unit: enum [kg, l, pcs, box]
├── company_price: decimal
├── avg_weight: decimal (kg, for weight estimation)
├── image_url: string
├── is_active: boolean
└── created_at: timestamp
```

**Note:** This is the company-wide catalog. Individual stores override price/availability via Store_Inventory.

---

### **4. STORE INVENTORY**
```
Store_Inventory
├── id: UUID
├── store_id: UUID (FK)
├── product_id: UUID (FK)
├── selling_price: decimal (can differ from company_price)
├── stock_quantity: decimal (kg or units)
├── status: enum [available, low_stock, out_of_stock]
├── last_delivery_date: timestamp
└── updated_at: timestamp

Constraint: UNIQUE(store_id, product_id)
```

**Logic:**
- If status = "out_of_stock", product is hidden from customer catalog
- Selling_price can override company_price per store

---

### **5. CUSTOMER**
```
Customer
├── id: UUID
├── phone: string (unique per store)
├── store_id: UUID (FK, customer belongs to ONE store only)
├── name: string
├── email: string
├── subscription_status: enum [active, paused, cancelled]
├── subscription_start_date: date
├── subscription_end_date: date
├── subscription_auto_renew: boolean
├── created_at: timestamp
└── updated_at: timestamp

Constraint: UNIQUE(store_id, phone)
```

**Critical:** A customer registered at Store A cannot order from Store B. Always check store_id.

---

### **6. CUSTOMER ADDRESS**
```
Customer_Address
├── id: UUID
├── customer_id: UUID (FK)
├── store_coverage_id: UUID (FK → Store_Coverage)
├── entrance: int
├── floor: int
├── apartment: int
├── entrance_code: string
├── is_default: boolean
└── created_at: timestamp
```

**Validation:** store_coverage_id must belong to customer's store.

---

### **7. ORDER**
```
Order
├── id: UUID
├── order_number: string (unique, e.g., "ST001-20251128-0001")
├── store_id: UUID (FK)
├── customer_id: UUID (FK)
├── delivery_address_id: UUID (FK → Customer_Address)
├── 
├── Pricing:
│   ├── subtotal: decimal (sum of items)
│   ├── estimated_weight: decimal (kg, calculated at checkout)
│   ├── online_payment_amount: decimal (subtotal * 0.95)
│   ├── pos_terminal_topup: decimal (collected at delivery)
│   └── final_total: decimal (after actual weight adjustment)
├── 
├── Status Tracking:
│   ├── payment_status: enum [pending, online_paid, fully_paid, cancelled]
│   ├── delivery_status: enum [new, picked, in_delivery, delivered, failed]
│   ├── delivery_date: date
│   ├── delivery_time_slot: string (e.g., "15:00-17:00")
│   └── notes: text (internal notes)
├── 
├── Weight Tracking:
│   ├── estimated_weight: decimal (calculated at checkout from product avg_weight)
│   └── actual_weight: decimal (measured at store before delivery)
├── 
├── Timestamps:
│   ├── created_at: timestamp
│   ├── delivered_at: timestamp
│   └── updated_at: timestamp
└── Indexes: (store_id, delivery_date), (customer_id), (payment_status)
```

**Weight Calculation Logic:**
```
At checkout:
  estimated_weight = SUM(order_items[i].product.avg_weight * qty[i])
  online_payment_amount = subtotal * 0.95

At delivery (by store operator):
  actual_weight = (measured by scale)
  final_total = subtotal * (actual_weight / estimated_weight)
  pos_terminal_topup = MAX(0, final_total - online_payment_amount)
```

---

### **8. ORDER ITEM**
```
Order_Item
├── id: UUID
├── order_id: UUID (FK)
├── product_id: UUID (FK)
├── quantity: decimal
├── unit_price: decimal (selling_price at time of order)
├── line_total: decimal (unit_price * quantity)
└── created_at: timestamp
```

---

### **9. PAYMENT**
```
Payment
├── id: UUID
├── order_id: UUID (FK)
├── method: enum [online_card, qr_kaspi, qr_halyk, pos_terminal]
├── amount: decimal
├── status: enum [pending, completed, failed, refunded]
├── transaction_id: string (from payment gateway)
├── receipt_url: string (link to electronic receipt)
├── created_at: timestamp
└── updated_at: timestamp
```

**Multiple payments per order possible:**
- Online: 1 payment for 95% of amount
- POS: 1 payment for topup at delivery

---

### **10. SUBSCRIPTION**
```
Subscription
├── id: UUID
├── customer_id: UUID (FK)
├── store_id: UUID (FK)
├── amount: decimal (monthly fee)
├── billing_period: enum [monthly, yearly]
├── status: enum [active, paused, cancelled]
├── next_billing_date: date
├── auto_renew: boolean
├── created_at: timestamp
└── cancelled_at: timestamp

Constraint: UNIQUE(customer_id, store_id)
```

---

## 🔌 INTEGRATIONS & EXTERNAL SERVICES

### **1. Payment Gateway (Kaspi QR)**
```
Flow:
  1. POST /api/orders/:id/pay-online {method: "kaspi_qr"}
  2. Backend calls Kaspi API: createQR(amount, orderId, callbackUrl)
  3. Backend stores invoiceId in order.external_payment_id
  4. Response: {qrUrl, paymentUrl, expiresAt}
  5. Frontend displays QR
  6. Customer scans → pays
  7. Kaspi calls webhook: POST /webhooks/kaspi {invoiceId, status, amount}
  8. Backend verifies signature, updates order.payment_status = "online_paid"
  9. Emit webhook to store operator dashboard (real-time)

Error handling:
  - Payment timeout: order stays "pending", customer can retry
  - Webhook failure: implement polling fallback
  - Idempotency: check transaction_id to avoid duplicate processing
```

---

### **2. SMS Notifications**
```
Events:
  - Order created → "Order #123 confirmed. Delivery between 15:00-17:00"
  - Payment confirmed → "Payment received. Order preparing."
  - In delivery → "Driver arrived at building. Apartment 205, Building 10."
  - Delivered → "Order delivered. Thank you!"

Provider: Twilio OR local SMS gateway (to be determined)
Template: SMS messages with order info (order_number, delivery_time, address)
Rate limiting: Use queue (Bull/RabbitMQ) to avoid rate limits
```

---

### **3. EMAIL NOTIFICATIONS**
```
Events:
  - Registration → Confirmation email
  - Order confirmation → Full order details + estimated delivery
  - Payment confirmation → Receipt (from SKNO if available)
  - Subscription renewal → "Your subscription renewed for [date]"

Provider: SendGrid OR Brevo
Templates: HTML templates with order details, receipt, etc.
```

---

### **4. POS TERMINAL**
```
At delivery:
  1. Store operator measures actual_weight
  2. System calculates: topup = (actual_weight / estimated_weight) * subtotal - online_paid
  3. Courier has POS terminal (Kaspi Terminal or similar)
  4. Courier enters amount in terminal
  5. Customer pays via card/QR on terminal
  6. Terminal returns receipt
  7. Courier logs transaction in app
  8. Backend receives webhook: payment completed
  9. Order marked as "fully_paid"
  10. Receipt printed by terminal, given to customer

POS Terminal API:
  - Model: Kaspi Terminal OR Halyk Gateway (to be selected)
  - Integration: SDK + webhook for payment completion
  - Offline mode: allow offline logging if network fails, sync later
```

---

### **5. RECEIPTS (ELECTRONIC)**
```
If using 1C or Kazakhstan СКNO:
  1. After payment completed, generate receipt
  2. Send to SKNO API OR 1C API
  3. Get receipt URL / receipt ID
  4. Store in payment.receipt_url
  5. Send URL to customer via email

If not available:
  1. Generate PDF receipt on backend
  2. Send to customer via email
```

---

### **6. FUTURE: 1C INTEGRATION**
```
Sync products:
  - Daily at 6 AM: fetch products from 1C API
  - Update company catalog (prices, names, descriptions)
  - Notify store operators of new items

Export orders:
  - End of day: export all delivered orders to 1C
  - Include: customer, items, total, payment method, delivery address
  - Use for accounting, inventory reconciliation

Inventory sync:
  - 1C → Platform: update stock levels per store
  - Platform → 1C: log sold items
```

---

## 🛣️ DETAILED WORKFLOWS (BY ROLE)

### **CUSTOMER: Registration & First Order**

```
Step 1: Registration
├─ Input: phone number, store_id (from URL or parameter)
├─ Validation: phone format, store exists, store active
├─ Action: create Customer record
├─ Send: SMS OTP
└─ Return: {customer_id, status: "otp_sent"}

Step 2: OTP Verification
├─ Input: phone, otp_code
├─ Validation: OTP matches, not expired (5 min window)
├─ Action: mark customer as verified, generate JWT
├─ Return: {jwt_token, refresh_token}

Step 3: Complete Profile
├─ Input: name, email, address_id (from coverage), entrance, floor, apt, code
├─ Validation: 
│  └─ address_id belongs to customer.store's coverage
├─ Action: create Customer_Address (is_default = true)
└─ Return: {customer_id, status: "profile_complete"}

Step 4: Subscribe
├─ Input: payment method (card/QR)
├─ Action: create Subscription, initiate payment for subscription fee
├─ Payment flow: (same as order payment, but no weight involved)
├─ On success: update customer.subscription_status = "active"
└─ Return: {subscription_id, next_billing_date}

Step 5: Browse & Order
├─ Input: (none, just browsing)
├─ Query: GET /api/stores/{store_id}/catalog
├─ Filters: category, search, status = "available" ONLY
├─ Return: products[] with prices, images, availability
├─
├─ Input: (add to cart, then checkout)
├─ Action: Create Order, create Order_Items
├─ Calculation: estimated_weight, online_payment_amount
├─ **NEW: Check for first_order_discount** (if no previous orders)
├─ Return: {order_id, payment_options: {online: {...}, pos: {...}}, breakdown}
└─ Breakdown includes: subtotal, first_order_discount (if applied), delivery_fee (if applicable)

Step 6A: Apply Promo Code (OPTIONAL)
├─ Input: {promo_code: "SUMMER20"}
├─ Real-time validation: POST /api/orders/:id/validate-promo
├─ Checks:
│  ├─ Code exists & is_active
│  ├─ Valid date range (valid_from ≤ today ≤ valid_until)
│  ├─ Minimum order value met
│  ├─ Max uses not exceeded
│  ├─ Customer hasn't used more than usage_per_customer times
│  └─ No conflict with first_order_discount (can stack or mutually exclusive - TBD)
├─ Return: {is_valid, discount_amount, error_message}
├─ If valid: apply to order, recalculate final_total
└─ Promo code applied during checkout

Step 6B: Delivery Fee Logic
├─ Store setting: min_order_value_for_free_delivery (e.g., 10,000₸)
├─ If order subtotal < 10,000₸:
│  └─ Add delivery_fee (e.g., 500₸) to final_total
├─ If order subtotal ≥ 10,000₸:
│  └─ Delivery is free
└─ Shown in checkout breakdown

Step 7: Pay Online
├─ Input: {method: "kaspi_qr"}
├─ Amount = final_total (after all discounts & fees)
├─ Action: call Kaspi API, get QR URL
├─ Return: {qr_url, payment_url}
├─ Frontend: display QR for scanning
├─ On payment: webhook updates order.payment_status = "online_paid"
└─ SMS: "Payment confirmed. Order is being prepared."

---

### **STORE OPERATOR: Daily Operations**

```
Step 1: Log In
├─ Input: email, password
├─ Auth: JWT token with store_id embedded
└─ Access: only their assigned store's data

Step 2: View Today's Orders
├─ Query: GET /api/my-store/orders?date=today
├─ Return: orders[] {order_number, customer, items, weight_est, status}
├─ Sort: by time or by pickup order
└─ Filter: by status, by customer

Step 3: Pick & Pack Items
├─ For each order:
│  ├─ Get items list
│  ├─ Pick from shelves
│  ├─ Weigh on scale
│  ├─ Input: actual_weight into system
│  ├─ System recalculates: final_total, pos_terminal_topup
│  ├─ Print label with customer name, apartment, entrance code
│  └─ Place in delivery batch

Step 4: Assign to Courier
├─ Input: select courier for batch
├─ Create delivery batch: {courier_id, orders: [], total_weight, delivery_time}
├─ Courier receives info (on courier app or dashboard)
└─ Mark orders: delivery_status = "in_delivery"

Step 5: Track Courier
├─ View all active deliveries
├─ See courier location (if GPS enabled)
├─ Receive updates: delivery completed
├─ Mark order: delivery_status = "delivered"

Step 6: View Daily Metrics
├─ Total orders today
├─ Total revenue (paid online + expected from POS)
├─ Top items sold
├─ Failed/returned orders
├─ Courier performance (on-time %, success %)
```

---

### **ADMIN ROLE 1: Catalog & Inventory Manager**

```
Step 1: Manage Stores
├─ Create store:
│  ├─ Input: name, location, operating_hours, delivery_time
│  ├─ Action: INSERT into stores table
│  └─ Return: store_id
├─
├─ Edit store:
│  ├─ Input: store_id, fields to update
│  ├─ Action: UPDATE stores
│  └─ Return: updated store
├─
├─ Delete store:
│  ├─ Input: store_id
│  ├─ Validation: no active orders, no active subscriptions
│  ├─ Action: soft delete (mark closed)
│  └─ Return: {status: "deleted"}
└─
├─ Add coverage:
│  ├─ Input: store_id, addresses[]
│  ├─ Action: INSERT into store_coverage
│  └─ Return: coverage_ids[]

Step 2: Manage Products
├─ Create product:
│  ├─ Input: name, category, unit, company_price, avg_weight, image_url
│  ├─ Action: INSERT into products
│  └─ Return: product_id
├─
├─ Edit product:
│  ├─ Input: product_id, fields
│  ├─ Action: UPDATE products
│  ├─ Note: changes apply to all stores using this product
│  └─ Return: updated product
├─
├─ Delete product:
│  ├─ Input: product_id
│  ├─ Action: soft delete (is_active = false)
│  └─ Note: customers don't see it, but historical orders still reference it
└─
├─ Add product to store:
│  ├─ Input: store_id, product_id, selling_price (optional, default = company_price)
│  ├─ Action: INSERT into store_inventory
│  └─ Return: inventory_id

Step 3: Monitor Inventory Levels
├─ View inventory per store:
│  ├─ Query: GET /api/admin/stores/{id}/inventory
│  ├─ Return: products[] {name, qty, company_price, selling_price, status}
│  └─ Highlight: low_stock, out_of_stock items
├─
├─ Receive stock:
│  ├─ Input: product_id, store_id, quantity
│  ├─ Action: UPDATE store_inventory SET quantity += amount
│  ├─ Action: log in audit_logs
│  └─ Status auto-updates: if qty > 0 and was out_of_stock, set to "available"
├─
├─ Remove from sale:
│  ├─ Input: product_id, store_id
│  ├─ Action: UPDATE store_inventory SET status = "out_of_stock"
│  ├─ Effect: product disappears from customer catalog
│  └─ No impact on existing orders
└─
├─ View inventory history:
│  ├─ Query: GET /api/admin/audit-logs?entity_type=store_inventory&entity_id=...
│  ├─ Return: {timestamp, action, old_value, new_value, changed_by}
│  └─ Used for reconciliation & auditing
```

---

### **ADMIN ROLE 2: Operations & Finance Monitor**

```
Step 1: View Orders
├─ Query: GET /api/admin/orders?date_from=X&date_to=Y&store_id=Z&status=...
├─ Return: orders[] {order_number, store, customer, items, subtotal, payment_status, delivery_status}
├─ Filters: by date, store, payment status, delivery status
├─ Sorting: by amount, by date, by store
└─ Drill down: click order to see full details, payment method, weight info

Step 2: Track Payments
├─ View payment status breakdown:
│  ├─ Total online paid: X ₸
│  ├─ Total pending POS: Y ₸
│  ├─ Total fully paid: Z ₸
│  └─ Breakdown by store
├─
├─ View individual payment:
│  ├─ {order_id, method, amount, transaction_id, status, receipt_url}
│  └─ Can resend receipt or mark as failed if needed
└─
├─ View POS topup details:
│  ├─ Orders where actual_weight > estimated_weight
│  ├─ Topup amount needed per order
│  └─ Confirmation status (collected or pending)

Step 3: Revenue Analytics
├─ Daily revenue:
│  ├─ Total orders count
│  ├─ Total revenue (by store, by payment method)
│  ├─ Average order value
│  └─ Chart: revenue by hour
├─
├─ Weekly / Monthly revenue:
│  ├─ Cumulative numbers
│  ├─ Comparison to previous period
│  └─ Trends
├─
├─ By store breakdown:
│  ├─ Revenue per store
│  ├─ Number of orders per store
│  ├─ Top products per store
│  └─ Identify best/worst performing stores
└─
├─ By product breakdown:
│  ├─ Total units sold
│  ├─ Total revenue by product
│  ├─ Top 10 products by revenue
│  └─ Identify slow-moving items

Step 4: Delivery Performance
├─ On-time delivery rate:
│  ├─ Orders delivered within estimated time slot
│  ├─ Percentage
│  └─ Breakdown by store
├─
├─ Failed/Returned orders:
│  ├─ Count, reasons
│  └─ Identify problem couriers/stores
├─
├─ Courier performance:
│  ├─ Orders per courier
│  ├─ On-time %
│  ├─ Failed %
│  └─ Rating / feedback

Step 5: Export Reports
├─ Format: CSV / Excel
├─ Data: orders, payments, revenue, customers
├─ Date range: custom
└─ Use: send to finance team, external analysis
```

---

### **ADMIN ROLE 3: Customers & Subscriptions Monitor**

```
Step 1: View All Customers
├─ Query: GET /api/admin/customers?store_id=X
├─ Return: customers[] {phone, name, subscription_status, sub_end_date, created_at}
├─ Filter: by store, by subscription status (active/expired/paused)
├─ Search: by phone or name
└─ Sort: by registration date, by subscription end date

Step 2: Customer Details
├─ Query: GET /api/admin/customers/{id}
├─ Return:
│  ├─ Basic info: phone, name, email
│  ├─ Subscription: status, dates, auto_renew flag
│  ├─ Order count: total, last order date
│  ├─ Subscription history: all renewals, cancellations
│  └─ Consent log: all times customer agreed to terms
└─ Actions: (none, read-only)

Step 3: Subscription Status Dashboard
├─ Expiring soon (next 7 days):
│  ├─ Count of customers
│  ├─ List with renewal dates
│  └─ Alert admin to follow up if needed
├─
├─ Expired (no active subscription):
│  ├─ Count
│  ├─ Allow admin to manually activate
│  └─ Trigger: send reminder SMS
├─
├─ Auto-renew statistics:
│  ├─ % of customers with auto-renew enabled
│  ├─ Success rate of auto-renewal
│  └─ Failed renewals (show reasons)
└─
├─ Paused subscriptions:
│  ├─ Count
│  ├─ Reason for pause (if logged)
│  └─ Last contact date

Step 4: Manual Actions (if needed)
├─ Renew subscription:
│  ├─ Input: customer_id
│  ├─ Action: extend subscription_end_date by 1 month
│  ├─ Create new Subscription record
│  └─ Log: who renewed and when
├─
├─ Cancel subscription:
│  ├─ Input: customer_id, reason
│  ├─ Action: set subscription_status = "cancelled"
│  ├─ Prevent: orders after cancellation
│  └─ Audit: log cancellation
├─
├─ Pause subscription:
│  ├─ Input: customer_id, duration
│  ├─ Action: set subscription_status = "paused"
│  ├─ Effect: customer can't order until resumed
│  └─ Auto-resume: on specified date
└─
├─ View consent logs:
│  ├─ For each customer
│  ├─ Show: what they agreed to, when, what IP/device
│  └─ Used for compliance audits

Step 5: Export Customer Lists
├─ Format: CSV / Excel
├─ Data: phone, name, email, subscription_status, sub_end_date
├─ Filters: by store, by status, by date range
└─ Use: for CRM, marketing campaigns, compliance
```

---

## 🔐 AUTHORIZATION MATRIX

| Endpoint | Customer | Store Op | Admin 1 (Catalog) | Admin 2 (Operations) | Admin 3 (Customers) |
|----------|----------|----------|------------------|---------------------|-------------------|
| GET /stores/:id/catalog | ✅ (own store) | ❌ | ✅ | ✅ | ❌ |
| POST /orders | ✅ (own store) | ❌ | ❌ | ❌ | ❌ |
| GET /my-store/orders | ❌ | ✅ (own store) | ❌ | ❌ | ❌ |
| PUT /my-store/orders/:id/status | ❌ | ✅ (own store) | ❌ | ❌ | ❌ |
| GET /admin/stores | ❌ | ❌ | ✅ | ✅ | ✅ |
| POST /admin/stores | ❌ | ❌ | ✅ | ❌ | ❌ |
| GET /admin/products | ❌ | ❌ | ✅ | ✅ | ❌ |
| POST /admin/products | ❌ | ❌ | ✅ | ❌ | ❌ |
| GET /admin/orders | ❌ | ❌ | ❌ | ✅ | ❌ |
| GET /admin/payments | ❌ | ❌ | ❌ | ✅ | ❌ |
| GET /admin/analytics/revenue | ❌ | ❌ | ❌ | ✅ | ❌ |
| GET /admin/customers | ❌ | ❌ | ❌ | ❌ | ✅ |
| GET /admin/subscriptions | ❌ | ❌ | ❌ | ❌ | ✅ |
| POST /admin/subscriptions/renew | ❌ | ❌ | ❌ | ❌ | ✅ |

---

**Version:** 1.0
**Date:** 28 November 2025
