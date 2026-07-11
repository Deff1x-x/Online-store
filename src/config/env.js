import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const developmentJwtSecret = 'development-only-jwt-secret-do-not-use-in-production';
const configuredJwtSecret = process.env.JWT_SECRET?.trim();
const databaseEnvironmentKeys = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
];

if (isProduction) {
  const missingDatabaseKeys = databaseEnvironmentKeys.filter((key) => !process.env[key]);

  if (!configuredJwtSecret || configuredJwtSecret.length < 32 || configuredJwtSecret === 'change_this_secret' || configuredJwtSecret === developmentJwtSecret) {
    throw new Error('JWT_SECRET must be configured with at least 32 non-development characters in production');
  }

  if (missingDatabaseKeys.length > 0) {
    throw new Error(`Missing required production database environment variables: ${missingDatabaseKeys.join(', ')}`);
  }

  if (!Number.isInteger(Number(process.env.DATABASE_PORT)) || Number(process.env.DATABASE_PORT) <= 0) {
    throw new Error('DATABASE_PORT must be a positive integer in production');
  }

  if (process.env.DATABASE_PASSWORD === 'postgres') {
    throw new Error('DATABASE_PASSWORD must not use the development default in production');
  }
}

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 3000),
  jwtSecret: configuredJwtSecret || developmentJwtSecret,
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    name: process.env.DATABASE_NAME || 'online_store',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  },
};
