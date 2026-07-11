BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumtypid = 'user_role'::REGTYPE
          AND enumlabel = 'Customer'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS customers_store_required;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS store_operator_store_required;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS staff_password_required;
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
            ADD CONSTRAINT store_operator_store_required
            CHECK (role <> 'store_operator' OR store_id IS NOT NULL);
        ALTER TABLE users
            ADD CONSTRAINT staff_password_required
            CHECK (role = 'customer' OR password_hash IS NOT NULL);
        DROP TYPE user_role_legacy;
    END IF;
END $$;

COMMIT;
