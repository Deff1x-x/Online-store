import app from './app.js';
import { query, pool } from './config/db.js';
import { env } from './config/env.js';

const startServer = async () => {
  try {
    await query('SELECT 1');

    app.listen(env.port, () => {
      console.log(`Server is running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    await pool.end();
    process.exit(1);
  }
};

startServer();
