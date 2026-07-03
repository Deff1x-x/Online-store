import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const databaseSslEnabled = process.env.DATABASE_SSL === 'true';

export const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: databaseSslEnabled ? { rejectUnauthorized: false } : false,
});

export const query = (text, params) => {
  return pool.query(text, params);
};
