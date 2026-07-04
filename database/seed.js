import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/utils/auth.js';

const adminUser = {
  email: 'catalog.admin@kairosime.com',
  password: 'AdminPassword123',
  role: 'admin_catalog',
};

const starterStore = {
  name: 'Kairosime Central Store',
  address: 'Astana, Mangilik El 55',
  status: 'active',
};

const seedDatabase = async () => {
  const client = await pool.connect();

  try {
    console.log('Starting database seed...');

    await client.query('BEGIN');

    const passwordHash = await hashPassword(adminUser.password);

    const adminResult = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         updated_at = NOW()
       RETURNING id, email, role`,
      [adminUser.email, passwordHash, adminUser.role],
    );

    console.log(
      `Admin user is ready: ${adminResult.rows[0].email} (${adminResult.rows[0].role})`,
    );

    const existingStoreResult = await client.query(
      `SELECT id, name, address, status
       FROM stores
       WHERE name = $1 AND address = $2
       LIMIT 1`,
      [starterStore.name, starterStore.address],
    );

    if (existingStoreResult.rowCount > 0) {
      const existingStore = existingStoreResult.rows[0];
      console.log(
        `Starter store already exists: ${existingStore.name} (${existingStore.id})`,
      );
    } else {
      const storeResult = await client.query(
        `INSERT INTO stores (name, address, status)
         VALUES ($1, $2, $3)
         RETURNING id, name, address, status`,
        [starterStore.name, starterStore.address, starterStore.status],
      );

      console.log(
        `Starter store created: ${storeResult.rows[0].name} (${storeResult.rows[0].id})`,
      );
    }

    await client.query('COMMIT');
    console.log('Database seed completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

seedDatabase();
