# VPS Deployment Setup Guide

This guide walks you through setting up your VPS for automatic Docker image syncing from GitHub.

## Prerequisites

- VPS with Docker and Docker Compose installed
- PostgreSQL running on your VPS
- GitHub repository with Actions enabled
- Personal Access Token from GitHub (for pulling private images)

## Step 1: Create GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with:
   - `read:packages` (to pull images)
   - `repo` (if private repo)
3. Save the token (you'll need it for your VPS)

## Step 2: Prepare Your VPS

### 2.1 Create Application Directory

```bash
mkdir -p /home/aforsy/aforsy-ai-cv-review/deploy
mkdir -p /home/aforsy/aforsy-ai-cv-review/{uploads,logs,results}
cd /home/aforsy/aforsy-ai-cv-review
```

### 2.2 Create `.env` File

```bash
cat > .env << 'EOF'
# Database - use your existing PostgreSQL on VPS
DATABASE_URL=postgresql://user:password@localhost:5432/aforsy

# Redis (will run in Docker)
REDIS_URL=redis://redis:6379

# API Keys
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index_name

# GitHub Container Registry
GH_USERNAME=asyrofuddien
GH_TOKEN=your_github_token_here

# Webhook
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
WEBHOOK_PORT=5000
APP_DIR=/home/aforsy/aforsy-ai-cv-review

# Node
NODE_ENV=production
PORT=3000
EOF

chmod 600 .env
```

### 2.3 Copy Deployment Files

Copy these files from the repo to your VPS:

- `docker-compose.prod.yml` → `/home/aforsy/aforsy-ai-cv-review/`
- `deploy/vps-update.sh` → `/usr/local/bin/aforsy-update.sh`
- `deploy/webhook-listener.py` → `/usr/local/bin/aforsy-webhook-listener.py`

```bash
chmod +x /usr/local/bin/aforsy-update.sh
chmod +x /usr/local/bin/aforsy-webhook-listener.py
```

## Step 3: Setup Systemd Service for Webhook

Create a systemd service to keep the webhook listener running:

```bash
sudo tee /etc/systemd/system/aforsy-webhook.service > /dev/null << 'EOF'
[Unit]
Description=AFORSY GitHub Webhook Listener
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=aforsy
WorkingDirectory=/home/aforsy/aforsy-ai-cv-review
ExecStart=/usr/local/bin/aforsy-webhook-listener.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/aforsy-webhook.log
StandardError=append:/var/log/aforsy-webhook.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aforsy-webhook.service
sudo systemctl start aforsy-webhook.service
```

Verify it's running:

```bash
sudo systemctl status aforsy-webhook.service
sudo journalctl -u aforsy-webhook.service -f
```

## Step 4: Setup Cron Job for Manual Updates (Optional Backup)

```bash
crontab -e
```

Add this line to check for updates every hour:

```cron
0 * * * * /usr/local/bin/aforsy-update.sh >> /var/log/aforsy-deploy.log 2>&1
```

## Step 5: Configure GitHub Actions Secrets

In your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add these secrets:
   - `VPS_WEBHOOK_URL`: `http://your_vps_ip:5000/webhook` (or use reverse proxy)
   - Any other API keys needed

## Step 6: Setup GitHub Webhook (For Push Events)

1. Go to your repository **Settings → Webhooks**
2. Click **Add webhook**
3. Fill in:
   - **Payload URL**: `http://your_vps_ip:5000/` (should have reverse proxy for HTTPS)
   - **Content type**: `application/json`
   - **Secret**: Use the same value as `GITHUB_WEBHOOK_SECRET` in `.env`
   - **Events**: Select "Let me select individual events" → Check "Push events"
4. Click **Add webhook**

## Step 7: Setup Reverse Proxy (NGINX - Recommended)

To securely expose the webhook to GitHub:

```bash
sudo tee /etc/nginx/sites-available/aforsy-webhook > /dev/null << 'EOF'
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/aforsy-webhook /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Then use `https://your_domain.com` as the Payload URL in GitHub webhook settings.

## Step 8: Initial Deployment

Run the update script manually first to ensure everything works:

```bash
/usr/local/bin/aforsy-update.sh
```

Check logs:

```bash
tail -f /var/log/aforsy-deploy.log
```

## Step 9: Verify Running Containers

```bash
docker ps
docker-compose -f /home/aforsy/aforsy-ai-cv-review/docker-compose.prod.yml logs -f app
```

## Troubleshooting

### Check webhook logs:

```bash
sudo journalctl -u aforsy-webhook.service -n 50
```

### Check deployment logs:

```bash
tail -f /var/log/aforsy-deploy.log
tail -f /var/log/aforsy-webhook.log
```

### Docker login issues:

```bash
echo $GH_TOKEN | docker login ghcr.io -u $GH_USERNAME --password-stdin
```

### Check container health:

```bash
docker-compose -f docker-compose.prod.yml ps
docker logs aforsy-app
```

## How It Works

1. **Push to GitHub** → GitHub Actions workflow triggered
2. **Workflow builds image** → Pushed to GitHub Container Registry
3. **Webhook notified** → VPS receives notification
4. **VPS pulls image** → Latest Docker image downloaded
5. **Containers restart** → New version running

---

**Manual updates** can always be run with:

```bash
/usr/local/bin/aforsy-update.sh
```
