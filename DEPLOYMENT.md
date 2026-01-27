# Vetly API Deployment Guide

## Overview

This guide covers deploying the Vetly API to DigitalOcean with Docker, including local development setup and environment management.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalOcean App Platform                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │  Vetly API  │───▶│    Redis    │    │  Load Balancer  │ │
│  │  (NestJS)   │    │  (Managed)  │    │    (Built-in)   │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    Supabase     │
                    │   (External)    │
                    └─────────────────┘
```

## Prerequisites

1. **Docker Desktop** - [Install Docker](https://docs.docker.com/get-docker/)
2. **DigitalOcean CLI (doctl)** - `brew install doctl`
3. **Node.js 20+** - For local development without Docker

## Environment Setup

### Environment Files

| File | Purpose |
|------|---------|
| `.env.example` | Template with all variables |
| `.env.local` | Local development (git-ignored) |
| `.env.staging` | Staging environment |
| `.env.production` | Production environment |

### Required Environment Variables

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# AI Providers
DEEPSEEK_API_KEY=your_deepseek_key
OPENAI_API_KEY=your_openai_key

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_supabase_jwt_secret

# Application
PORT=3000
NODE_ENV=development
```

## Local Development

### Option 1: Without Docker (Recommended for development)

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your values
# Then start the server
npm run dev
```

### Option 2: With Docker

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Start development environment
./scripts/docker-cli.sh dev

# Or with docker-compose directly
docker-compose -f docker-compose.dev.yml up -d

# View logs
./scripts/docker-cli.sh dev:logs

# Stop
./scripts/docker-cli.sh dev:stop
```

### Docker CLI Commands

```bash
./scripts/docker-cli.sh [command]

# Development
dev           # Start development environment
dev:build     # Build and start
dev:logs      # View logs
dev:stop      # Stop containers
dev:restart   # Restart API

# Production
prod          # Start production environment
prod:build    # Build production image
prod:logs     # View logs
prod:stop     # Stop containers

# Utilities
shell         # Open shell in container
redis-cli     # Open Redis CLI
clean         # Clean up Docker resources
status        # Show container status
health        # Check API health
```

## DigitalOcean Deployment

### Initial Setup

1. **Create DigitalOcean Account** and install CLI:
   ```bash
   brew install doctl
   doctl auth init
   ```

2. **Create Container Registry**:
   ```bash
   doctl registry create vetly
   doctl registry login
   ```

3. **Create App**:
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

4. **Set Environment Variables** in DigitalOcean Dashboard:
   - Go to Apps → vetly-api → Settings → App-Level Environment Variables
   - Add all required secrets (SUPABASE_SERVICE_KEY, API keys, etc.)

### Deploy

#### Automatic (GitHub Integration)

Push to `main` branch triggers automatic deployment:
```bash
git push origin main
```

#### Manual Deployment

```bash
# Build and push image
./scripts/deploy.sh production

# Or step by step:
docker build --platform linux/amd64 -t registry.digitalocean.com/vetly/vetly-api:latest .
docker push registry.digitalocean.com/vetly/vetly-api:latest
doctl apps create-deployment $DO_APP_ID
```

### Deployment Script

```bash
# Deploy to different environments
./scripts/deploy.sh dev        # Local Docker
./scripts/deploy.sh staging    # Staging server
./scripts/deploy.sh production # DigitalOcean
```

## DigitalOcean App Platform Configuration

### Recommended Specs

| Environment | Instance Size | Instances | Redis |
|-------------|---------------|-----------|-------|
| Development | - | Local | Local |
| Staging | basic-xxs | 1 | db-s-dev |
| Production | basic-xs | 2 | db-s-1vcpu-1gb |

### Scaling

```bash
# Scale instances
doctl apps update $DO_APP_ID --instance-count 2

# Or update app.yaml and redeploy
```

## Monitoring & Logs

### DigitalOcean

```bash
# View logs
doctl apps logs $DO_APP_ID --type run

# View deployment logs
doctl apps logs $DO_APP_ID --type deploy
```

### Local Docker

```bash
# View logs
docker-compose logs -f api

# Or use CLI
./scripts/docker-cli.sh dev:logs
```

## Health Checks

The API exposes a health endpoint at `/api`:

```bash
curl http://localhost:3001/api
# Response: Hello World!
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   lsof -ti:3001 | xargs kill -9
   ```

2. **Docker build fails**
   ```bash
   docker system prune -f
   docker-compose build --no-cache
   ```

3. **Environment variables not loading**
   - Ensure `.env.local` exists
   - Restart the server after changes
   - Check `app.module.ts` loads `.env.local` first

4. **Redis connection failed**
   ```bash
   # Check Redis is running
   docker-compose ps redis
   
   # Restart Redis
   docker-compose restart redis
   ```

## Security Best Practices

1. **Never commit secrets** - Use `.env.local` (git-ignored)
2. **Use DigitalOcean Secrets** - Mark sensitive vars as SECRET in app.yaml
3. **Rotate API keys** regularly
4. **Enable rate limiting** in production
5. **Use HTTPS** - DigitalOcean provides free SSL

## Cost Estimation (DigitalOcean)

| Resource | Spec | Monthly Cost |
|----------|------|--------------|
| App (basic-xxs) | 512MB RAM | ~$5 |
| App (basic-xs) | 1GB RAM | ~$10 |
| Redis (dev) | 1GB | ~$15 |
| Redis (prod) | 1GB | ~$15 |

**Estimated Total**: $20-25/month for staging, $25-40/month for production
