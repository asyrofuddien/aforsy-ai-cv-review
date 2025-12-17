# Docker Production Deployment Guide

## Quick Start

### 1. Setup Environment Variables

Copy the configuration template and update with your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your production values:

```env
OPENAI_API_KEY=your_key_here
PINECONE_API_KEY=your_key_here
PINECONE_ENVIRONMENT=your_env_here
MONGO_ROOT_PASSWORD=strong_password_here
```

### 2. Build and Run

```bash
# Build the Docker image
docker-compose build

# Start all services (MongoDB, Redis, App)
docker-compose up -d

# View logs
docker-compose logs -f app
```

### 3. Verify Health

```bash
# Check service status
docker-compose ps

# Test app health endpoint
curl http://localhost:3000/health

# Check MongoDB
docker-compose exec mongodb mongosh -u admin -p
```

## Architecture

### Services

- **MongoDB** (Port 27017): Main database with authentication
- **Redis** (Internal): Caching and job queue (not publicly exposed)
- **App** (Port 3000): Main application service

### Networking

- All services run on internal `cv-network` bridge
- Redis is only accessible from the app container
- MongoDB can be accessed from host (for management) but restricted to admin user

### Health Checks

- MongoDB: Custom mongosh health check
- Redis: redis-cli ping command
- App: HTTP health endpoint with 40s start period

## Production Settings

### Environment Variables to Configure

1. **OPENAI_API_KEY** - Required for LLM operations
2. **PINECONE_API_KEY** - Required for vector embeddings
3. **MONGO_ROOT_PASSWORD** - Change from default!
4. **NODE_ENV** - Set to 'production'
5. **CORS_ORIGINS** - Update to your domain

### Port Configuration

- App runs on port 3000 (configurable via PORT env var)
- MongoDB runs on port 27017 (for local management)
- Redis is internal only

### Data Persistence

Volumes are configured for:

- MongoDB data: `mongodb_data`
- MongoDB config: `mongodb_config`
- Redis data: `redis_data` (with AOF persistence enabled)
- App uploads: `./uploads`
- App logs: `./logs`

## Common Commands

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Rebuild on code changes
docker-compose up -d --build

# View MongoDB data
docker-compose exec mongodb mongosh -u admin -p

# Access app logs
docker-compose logs app -f

# Scale workers (if needed)
docker-compose up -d --scale worker=3
```

## Security Checklist

- ✅ Redis not publicly exposed
- ✅ MongoDB authentication enabled
- ✅ Health checks configured
- ✅ Restart policies set
- ✅ Environment variables for secrets
- ✅ Proper file permissions on volumes
- ⚠️ Change MONGO_ROOT_PASSWORD in production
- ⚠️ Use strong API keys
- ⚠️ Set proper CORS_ORIGINS
- ⚠️ Review logs regularly

## Troubleshooting

### App can't connect to MongoDB

```bash
docker-compose logs mongodb
# Verify MONGODB_URI in app environment matches the format
```

### Redis connection issues

```bash
docker-compose logs redis
# Redis should only be connected via `redis://redis:6379`
```

### Health check failing

```bash
docker-compose logs app
# App needs health endpoint at GET /health
# Ensure it returns 200 status code
```

### Port already in use

```bash
# Change port in docker-compose.yml or use PORT env var
PORT=8080 docker-compose up -d
```
