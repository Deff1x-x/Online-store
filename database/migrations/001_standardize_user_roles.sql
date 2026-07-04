BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS customers_store_required;
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

ALTER TYPE user_role RENAME TO user_role_legacy;

CREATE TYPE user_role AS ENUM (
    'customer',
    'store_operator',
    'admin_catalog',
    'admin_operations',
    'admin_customers'
);

ALTER TABLE users
    ALTER COLUMN role TYPE user_role
    USING (
        CASE role::TEXT
            WHEN 'Customer' THEN 'customer'
            WHEN 'Store_Op' THEN 'store_operator'
            WHEN 'Admin_1_Catalog' THEN 'admin_catalog'
            WHEN 'Admin_2_Operations' THEN 'admin_operations'
            WHEN 'Admin_3_Customers' THEN 'admin_customers'
            ELSE role::TEXT
        END
    )::user_role;

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';

ALTER TABLE users
    ADD CONSTRAINT customers_store_required
    CHECK (role <> 'customer' OR store_id IS NOT NULL);

DROP TYPE user_role_legacy;

COMMIT;
