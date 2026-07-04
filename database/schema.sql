CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM (
    'customer',
    'store_operator',
    'admin_catalog',
    'admin_operations',
    'admin_customers'
);

CREATE TYPE store_status AS ENUM (
    'active',
    'paused',
    'closed'
);

CREATE TYPE product_category AS ENUM (
    'Vegetables',
    'Fruits',
    'Dairy',
    'Meat',
    'Bakery',
    'Other'
);

CREATE TYPE product_unit AS ENUM (
    'kg',
    'l',
    'pcs'
);

CREATE TYPE order_status AS ENUM (
    'new',
    'picked',
    'in_delivery',
    'delivered',
    'canceled'
);

CREATE TYPE payment_method AS ENUM (
    'online',
    'pos'
);

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    status store_status NOT NULL DEFAULT 'active',
    settings JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(255),
    phone VARCHAR(32) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL),
    CONSTRAINT customers_store_required CHECK (role <> 'customer' OR store_id IS NOT NULL)
);

CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    privacy_policy BOOLEAN NOT NULL,
    terms_of_service BOOLEAN NOT NULL,
    ip INET NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_coverage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    address TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category product_category NOT NULL DEFAULT 'Other',
    unit product_unit NOT NULL,
    price_per_unit NUMERIC(12, 2) NOT NULL CHECK (price_per_unit >= 0),
    is_weighted BOOLEAN NOT NULL DEFAULT FALSE,
    average_weight NUMERIC(10, 3) CHECK (average_weight IS NULL OR average_weight > 0)
);

CREATE TABLE store_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT store_inventory_store_product_unique UNIQUE (store_id, product_id)
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status order_status NOT NULL DEFAULT 'new',
    payment_method payment_method NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    estimated_weight NUMERIC(10, 3) CHECK (estimated_weight IS NULL OR estimated_weight > 0),
    actual_weight NUMERIC(10, 3) CHECK (actual_weight IS NULL OR actual_weight > 0),
    price_per_unit NUMERIC(12, 2) NOT NULL CHECK (price_per_unit >= 0)
);
