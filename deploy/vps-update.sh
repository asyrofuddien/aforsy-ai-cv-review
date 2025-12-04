#!/bin/bash

##############################################################
# VPS Auto-Update Script
# This script runs as a service/cron job to pull the latest
# Docker image and restart containers
##############################################################

# Configuration
APP_DIR="/home/aforsy/aforsy-ai-cv-review"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/aforsy-deploy.log"
ENV_FILE="$APP_DIR/.env"
GITHUB_USERNAME="asyrofuddien"
GITHUB_REPO="aforsy-ai-cv-review"
IMAGE_REGISTRY="ghcr.io"

# Create directories
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"

# Initialize log file
touch "$LOG_FILE" 2>/dev/null || true

# Logging function
log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] $1" >> "$LOG_FILE"
  echo "[$timestamp] $1"
}

# Load environment variables from .env file
if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

# Check required variables
if [ -z "$GH_TOKEN" ]; then
  log "ERROR: GH_TOKEN not set in .env"
  exit 1
fi

log "================================"
log "Starting AFORSY VPS Update"
log "================================"

# Pull latest image
log "Pulling latest Docker image: $IMAGE_REGISTRY/$GITHUB_USERNAME/$GITHUB_REPO:main"
if docker pull "$IMAGE_REGISTRY/$GITHUB_USERNAME/$GITHUB_REPO:main"; then
  log "Docker image pulled successfully"
else
  log "ERROR: Failed to pull Docker image"
  exit 1
fi

# Stop and restart containers
log "Stopping old containers..."
cd "$APP_DIR"
docker-compose -f docker-compose.prod.yml down 2>&1 | grep -v "WARNING" || true

log "Starting new containers..."
if docker-compose -f docker-compose.prod.yml up -d; then
  log "Containers started successfully"
else
  log "ERROR: Failed to start containers"
  exit 1
fi

# Health check
sleep 5
if docker-compose -f docker-compose.prod.yml ps | grep -q "aforsy-app"; then
  log "Container health check passed"
else
  log "WARNING: Container may not be running properly"
fi

log "Update completed successfully"
log "================================"
