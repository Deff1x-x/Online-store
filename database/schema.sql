BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS notification_queue CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS delivery_settings CASCADE;
DROP TABLE IF EXISTS promo_code_usage CASCADE;
DROP TABLE IF EXISTS promo_codes CASCADE;
DROP TABLE IF EXISTS first_order_discounts CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS store_inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS user_consents CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS store_coverage CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

DROP TYPE IF EXISTS notification_status CASCADE;
DROP TYPE IF EXISTS notification_channel CASCADE;
DROP TYPE IF EXISTS discount_type CASCADE;
DROP TYPE IF EXISTS billing_period CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS payment_record_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS order_payment_status CASCADE;
DROP TYPE IF EXISTS delivery_status CASCADE;
DROP TYPE IF EXISTS fulfillment_window CASCADE;
DROP TYPE IF EXISTS inventory_status CASCADE;
DROP TYPE IF EXISTS product_unit CASCADE;
DROP TYPE IF EXISTS product_category CASCADE;
DROP TYPE IF EXISTS store_status CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

CREATE TYPE user_role AS ENUM (
    'customer',
    'store_operator',
    'admin_catalog',
    'admin_operations',
    'admin_customers'
);

CREATE TYPE user_status AS ENUM (
    'active',
    'blocked'
);

CREATE TYPE store_status AS ENUM (
    'active',
    'inactive',
    'paused',
    'closed'
);

CREATE TYPE product_category AS ENUM (
    'vegetables',
    'fruits',
    'dairy',
    'meat',
    'bakery',
    'other'
);

CREATE TYPE product_unit AS ENUM (
    'kg',
    'pcs',
    'l'
);

CREATE TYPE inventory_status AS ENUM (
    'available',
    'low_stock',
    'out_of_stock'
);

CREATE TYPE fulfillment_window AS ENUM (
    'same_day',
    'next_morning'
);

CREATE TYPE delivery_status AS ENUM (
    'new',
    'picked',
    'in_delivery',
    'delivered',
    'failed',
    'cancelled'
);

CREATE TYPE order_payment_status AS ENUM (
    'pending',
    'online_paid',
    'fully_paid',
    'cancelled'
);

CREATE TYPE payment_method AS ENUM (
    'online',
    'pos_terminal',
    'kaspi'
);

CREATE TYPE payment_record_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'refunded',
    'cancelled'
);

CREATE TYPE subscription_status AS ENUM (
    'active',
    'paused',
    'cancelled',
    'expired'
);

CREATE TYPE billing_period AS ENUM (
    'monthly',
    'yearly'
);

CREATE TYPE discount_type AS ENUM (
    'fixed_amount',
    'percentage'
);

CREATE TYPE notification_channel AS ENUM (
    'sms',
    'email',
    'push'
);

CREATE TYPE notification_status AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed',
    'cancelled'
);

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    location VARCHAR(500),
    operating_hours VARCHAR(100),
    delivery_time_min INT,
    delivery_time_max INT,
    status store_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    entrance_count INT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT store_coverage_store_address_unique UNIQUE (store_id, address)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(255),
    phone VARCHAR(32) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    status user_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL),
    CONSTRAINT store_operator_store_required CHECK (role <> 'store_operator' OR store_id IS NOT NULL),
    CONSTRAINT staff_password_required CHECK (role = 'customer' OR password_hash IS NOT NULL)
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    privacy_policy BOOLEAN NOT NULL,
    terms_of_service BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(255),
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    subscription_status subscription_status NOT NULL DEFAULT 'expired',
    subscription_start_date DATE,
    subscription_end_date DATE,
    subscription_auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customers_store_phone_unique UNIQUE (store_id, phone)
);

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_coverage_id UUID NOT NULL REFERENCES store_coverage(id) ON DELETE RESTRICT,
    entrance VARCHAR(20),
    floor VARCHAR(20),
    apartment VARCHAR(20),
    entrance_code VARCHAR(100),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category product_category NOT NULL DEFAULT 'other',
    unit product_unit NOT NULL,
    price_per_unit NUMERIC(12,2) NOT NULL CHECK (price_per_unit >= 0),
    company_price NUMERIC(12,2) NOT NULL CHECK (company_price >= 0),
    is_weighted BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    selling_price NUMERIC(12,2) CHECK (selling_price IS NULL OR selling_price >= 0),
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    status inventory_status NOT NULL DEFAULT 'available',
    last_delivery_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT store_inventory_store_product_unique UNIQUE (store_id, product_id)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    delivery_address_id UUID REFERENCES customer_addresses(id) ON DELETE RESTRICT,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    estimated_weight NUMERIC(10,3) CHECK (estimated_weight IS NULL OR estimated_weight >= 0),
    actual_weight NUMERIC(10,3) CHECK (actual_weight IS NULL OR actual_weight >= 0),
    online_payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (online_payment_amount >= 0),
    online_capture_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (online_capture_amount >= 0),
    pos_terminal_topup NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pos_terminal_topup >= 0),
    final_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (final_total >= 0),
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    fulfillment_window fulfillment_window NOT NULL DEFAULT 'same_day',
    delivery_date DATE,
    delivery_time_slot VARCHAR(50),
    delivery_status delivery_status NOT NULL DEFAULT 'new',
    payment_status order_payment_status NOT NULL DEFAULT 'pending',
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
    price_per_unit NUMERIC(12,2) NOT NULL CHECK (price_per_unit >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
    estimated_weight NUMERIC(10,3) CHECK (estimated_weight IS NULL OR estimated_weight >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method payment_method NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status payment_record_status NOT NULL DEFAULT 'pending',
    provider_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL DEFAULT 3900.00 CHECK (amount >= 0),
    billing_period billing_period NOT NULL DEFAULT 'monthly',
    status subscription_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    next_billing_date DATE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type discount_type NOT NULL,
    discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
    min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
    max_uses INT CHECK (max_uses IS NULL OR max_uses >= 0),
    usage_per_customer INT NOT NULL DEFAULT 1 CHECK (usage_per_customer > 0),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promo_code_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE first_order_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 3000.00 CHECK (amount >= 0),
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT first_order_discounts_customer_unique UNIQUE (customer_id)
);

CREATE TABLE delivery_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
    min_order_value_for_free_delivery NUMERIC(12,2) NOT NULL DEFAULT 5000.00 CHECK (min_order_value_for_free_delivery >= 0),
    delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 500.00 CHECK (delivery_fee >= 0),
    ordering_open_hour INT NOT NULL DEFAULT 11 CHECK (ordering_open_hour BETWEEN 0 AND 23),
    ordering_close_hour INT NOT NULL DEFAULT 20 CHECK (ordering_close_hour BETWEEN 0 AND 23),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status delivery_status,
    new_status delivery_status NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel notification_channel NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    template_key VARCHAR(100),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status notification_status NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_store_coverage_store_id ON store_coverage(store_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_store_id ON users(store_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_customers_store_id ON customers(store_id);
CREATE INDEX idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_store_inventory_store_id ON store_inventory(store_id);
CREATE INDEX idx_store_inventory_product_id ON store_inventory(product_id);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_promo_codes_store_id ON promo_codes(store_id);
CREATE INDEX idx_promo_code_usage_customer_id ON promo_code_usage(customer_id);
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_notification_queue_status_scheduled ON notification_queue(status, scheduled_at);

COMMIT;
