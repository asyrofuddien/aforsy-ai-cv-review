const path = require('node:path');
const backendDir = __dirname;
const frontendDir = path.resolve(backendDir, '../cv-evaluation-frontend');

module.exports = {
  apps: [
    {
      name: 'landly-api',
      cwd: backendDir,
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3001',
        HOST: '127.0.0.1',
      },
      out_file: path.join(backendDir, 'logs/pm2-api-out.log'),
      error_file: path.join(backendDir, 'logs/pm2-api-error.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'landly-web',
      cwd: frontendDir,
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 127.0.0.1 --port 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
        NEXT_PUBLIC_API_URL: 'https://aforsy.biz.id/api',
      },
      out_file: path.join(backendDir, 'logs/pm2-web-out.log'),
      error_file: path.join(backendDir, 'logs/pm2-web-error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
