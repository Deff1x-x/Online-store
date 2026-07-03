import dotenv from 'dotenv';
import app from './app.js';
import { query, pool } from './config/db.js';

dotenv.config();

const port = Number(process.env.PORT || 3000);

const startServer = async () => {
  try {
    await query('SELECT 1');

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    await pool.end();
    process.exit(1);
  }
};

startServer();
