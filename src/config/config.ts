import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI!,
  jwt: {
    accessSecret: process.env.ACCESS_TOKEN_SECRET!,
    refreshSecret: process.env.REFRESH_TOKEN_SECRET!,
    accessExpiry: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  },
  bcrypt: {
    saltRounds: parseInt(process.env.SALT_ROUNDS || '10'),
  },
};