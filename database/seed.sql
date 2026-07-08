BEGIN;

INSERT INTO stores (
    id,
    name,
    address,
    operating_hours,
    delivery_time_min,
    delivery_time_max,
    status
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'КОЦ Алмата',
    'Алматы, пилотная точка',
    '11:00-20:00',
    15,
    20,
    'active'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    operating_hours = EXCLUDED.operating_hours,
    delivery_time_min = EXCLUDED.delivery_time_min,
    delivery_time_max = EXCLUDED.delivery_time_max,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO store_coverage (
    id,
    store_id,
    address,
    entrance_count,
    active
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'д. 4',
    4,
    TRUE
) ON CONFLICT (id) DO UPDATE SET
    store_id = EXCLUDED.store_id,
    address = EXCLUDED.address,
    entrance_count = EXCLUDED.entrance_count,
    active = EXCLUDED.active,
    updated_at = NOW();

INSERT INTO delivery_settings (
    store_id,
    min_order_value_for_free_delivery,
    delivery_fee,
    ordering_open_hour,
    ordering_close_hour
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    5000.00,
    500.00,
    11,
    20
) ON CONFLICT (store_id) DO UPDATE SET
    min_order_value_for_free_delivery = EXCLUDED.min_order_value_for_free_delivery,
    delivery_fee = EXCLUDED.delivery_fee,
    ordering_open_hour = EXCLUDED.ordering_open_hour,
    ordering_close_hour = EXCLUDED.ordering_close_hour,
    updated_at = NOW();

INSERT INTO products (
    id,
    name,
    category,
    unit,
    price_per_unit,
    company_price,
    is_weighted,
    is_active
) VALUES
    (
        '33333333-3333-3333-3333-333333333333',
        'Помидоры розовые',
        'vegetables',
        'kg',
        950.00,
        850.00,
        TRUE,
        TRUE
    ),
    (
        '44444444-4444-4444-4444-444444444444',
        'Огурцы гладкие',
        'vegetables',
        'kg',
        700.00,
        620.00,
        TRUE,
        TRUE
    ),
    (
        '55555555-5555-5555-5555-555555555555',
        'Молоко 3,2% 1 л',
        'dairy',
        'pcs',
        520.00,
        460.00,
        FALSE,
        TRUE
    ),
    (
        '66666666-6666-6666-6666-666666666666',
        'Клубника',
        'fruits',
        'kg',
        1800.00,
        1600.00,
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    price_per_unit = EXCLUDED.price_per_unit,
    company_price = EXCLUDED.company_price,
    is_weighted = EXCLUDED.is_weighted,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO store_inventory (
    store_id,
    product_id,
    quantity,
    stock_quantity,
    selling_price,
    is_visible,
    status,
    last_delivery_date
) VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        50.000,
        0,
        NULL,
        TRUE,
        'available',
        CURRENT_DATE
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444',
        40.000,
        0,
        NULL,
        TRUE,
        'available',
        CURRENT_DATE
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        '55555555-5555-5555-5555-555555555555',
        30.000,
        30,
        NULL,
        TRUE,
        'available',
        CURRENT_DATE
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        '66666666-6666-6666-6666-666666666666',
        15.000,
        0,
        NULL,
        TRUE,
        'available',
        CURRENT_DATE
    )
ON CONFLICT (store_id, product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    stock_quantity = EXCLUDED.stock_quantity,
    selling_price = EXCLUDED.selling_price,
    is_visible = EXCLUDED.is_visible,
    status = EXCLUDED.status,
    last_delivery_date = EXCLUDED.last_delivery_date,
    updated_at = NOW();

INSERT INTO users (
    store_id,
    name,
    email,
    password_hash,
    role,
    status
) VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'Store Manager',
        'manager@koz.kz',
        '$2a$10$Qgd/j8JglSFSXAI9RWEj2exJcko7RsbWoyeAK/LvgqYnfMqO2LY6q',
        'store_operator',
        'active'
    ),
    (
        NULL,
        'Operations Admin',
        'admin@koz.kz',
        '$2a$10$Qgd/j8JglSFSXAI9RWEj2exJcko7RsbWoyeAK/LvgqYnfMqO2LY6q',
        'admin_operations',
        'active'
    ),
    (
        NULL,
        'Catalog Admin',
        'catalog@koz.kz',
        '$2a$10$Qgd/j8JglSFSXAI9RWEj2exJcko7RsbWoyeAK/LvgqYnfMqO2LY6q',
        'admin_catalog',
        'active'
    ),
    (
        NULL,
        'Customers Admin',
        'customers@koz.kz',
        '$2a$10$Qgd/j8JglSFSXAI9RWEj2exJcko7RsbWoyeAK/LvgqYnfMqO2LY6q',
        'admin_customers',
        'active'
    )
ON CONFLICT (email) DO UPDATE SET
    store_id = EXCLUDED.store_id,
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

COMMIT;
