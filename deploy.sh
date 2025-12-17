#!/bin/bash
set -e

echo "== Pull latest code =="
git pull

echo "== Install dependencies =="
npm install

echo "== Build project =="
npm run build

echo "== Restart PM2 =="
pm2 restart ai-cv-review && pm2 logs ai-cv-review

echo "== Done =="
