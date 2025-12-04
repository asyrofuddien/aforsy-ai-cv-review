#!/bin/bash

##############################################################
# VPS Auto-Update Script
# This script runs as a service/cron job to pull the latest
# Docker image and restart containers
##############################################################

set -e

# Configuration
LOG_FILE="/var/log/aforsy-deploy.log"
APP_DIR="/home/aforsy/aforsy-ai-cv-review"
WEBHOOK_PORT=5000
GITHUB_USERNAME="asyrofuddien"
GITHUB_REPO="aforsy-ai-cv-review"
IMAGE_REGISTRY="ghcr.io"

# Ensure app directory exists
mkdir -p "$APP_DIR"

##############################################################
# Logging function
##############################################################
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

##############################################################
# Docker login to GitHub Container Registry
##############################################################
docker_login() {
  log "Logging into GitHub Container Registry..."
  
  # Check if GH_TOKEN is set
  if [ -z "$GH_TOKEN" ]; then
    log "ERROR: GH_TOKEN not set in environment"
    return 1
  fi
  
  # Login to registry
  echo "$GH_TOKEN" | docker login $IMAGE_REGISTRY -u $GITHUB_USERNAME --password-stdin 2>&1 || {
    log "ERROR: Failed to login to Docker registry"
    return 1
  }
  
  log "GitHub Container Registry login successful"
}

##############################################################
# Pull latest image and restart containers
##############################################################
update_docker_image() {
  log "Pulling latest Docker image..."
  
  cd "$APP_DIR"
  
  # Pull the latest image
  docker pull "$IMAGE_REGISTRY/$GITHUB_USERNAME/$GITHUB_REPO:main" || {
    log "ERROR: Failed to pull Docker image"
    return 1
  }
  
  log "Stopping old containers..."
  docker-compose -f docker-compose.prod.yml down || true
  
  log "Starting new containers..."
  docker-compose -f docker-compose.prod.yml up -d
  
  log "Docker image updated and containers restarted successfully"
  
  # Health check
  sleep 5
  if docker-compose -f docker-compose.prod.yml ps | grep -q "aforsy-app"; then
    log "Container health check passed"
  else
    log "WARNING: Container may not be running properly"
    return 1
  fi
}

##############################################################
# Webhook server to listen for GitHub Actions trigger
##############################################################
start_webhook_server() {
  log "Starting webhook server on port $WEBHOOK_PORT..."
  
  # Create a simple webhook listener in the background
  nohup python3 /usr/local/bin/aforsy-webhook-listener.py > "$LOG_FILE" 2>&1 &
  
  log "Webhook server started (PID: $!)"
}

##############################################################
# Main execution
##############################################################
main() {
  log "================================"
  log "Starting AFORSY VPS Update"
  log "================================"
  
  # Login to Docker registry
  docker_login
  
  # Update and restart
  if update_docker_image; then
    log "Update completed successfully"
  else
    log "Update failed - check logs for details"
    exit 1
  fi
  
  log "================================"
}

# Run main function
main "$@"
