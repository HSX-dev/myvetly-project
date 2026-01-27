#!/bin/bash

# ===========================================
# VETLY API DEPLOYMENT SCRIPT
# ===========================================
# Usage: ./scripts/deploy.sh [environment]
# Environments: dev, staging, production

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables
load_env() {
    local env_file="$PROJECT_DIR/.env.$ENVIRONMENT"
    if [ -f "$env_file" ]; then
        log_info "Loading environment from $env_file"
        export $(grep -v '^#' "$env_file" | xargs)
    else
        log_warn "Environment file $env_file not found, using defaults"
    fi
}

# Build Docker image
build_image() {
    log_info "Building Docker image for $ENVIRONMENT..."
    
    local tag="${DOCKER_REGISTRY:-vetly}/vetly-api:${IMAGE_TAG:-latest}"
    
    docker build \
        --platform linux/amd64 \
        -t "$tag" \
        -f "$PROJECT_DIR/Dockerfile" \
        "$PROJECT_DIR"
    
    log_info "Built image: $tag"
}

# Push to registry
push_image() {
    log_info "Pushing image to registry..."
    
    local tag="${DOCKER_REGISTRY:-vetly}/vetly-api:${IMAGE_TAG:-latest}"
    docker push "$tag"
    
    log_info "Pushed image: $tag"
}

# Deploy to DigitalOcean App Platform
deploy_do_app() {
    log_info "Deploying to DigitalOcean App Platform..."
    
    if ! command -v doctl &> /dev/null; then
        log_error "doctl CLI not found. Install it: brew install doctl"
        exit 1
    fi
    
    # Update app spec
    doctl apps update "$DO_APP_ID" --spec "$PROJECT_DIR/.do/app.yaml"
    
    log_info "Deployment triggered on DigitalOcean"
}

# Deploy using Docker Compose
deploy_compose() {
    local compose_file="docker-compose.yml"
    
    case $ENVIRONMENT in
        dev)
            compose_file="docker-compose.dev.yml"
            ;;
        staging)
            compose_file="docker-compose.yml"
            ;;
        production)
            compose_file="docker-compose.prod.yml"
            ;;
    esac
    
    log_info "Deploying with $compose_file..."
    
    cd "$PROJECT_DIR"
    docker-compose -f "$compose_file" up -d --build
    
    log_info "Deployment complete!"
}

# Health check
health_check() {
    local url="${API_URL:-http://localhost:3001}/api"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for API to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            log_info "API is healthy!"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Main
main() {
    log_info "=== Vetly API Deployment ==="
    log_info "Environment: $ENVIRONMENT"
    
    load_env
    
    case $ENVIRONMENT in
        dev)
            deploy_compose
            health_check
            ;;
        staging)
            build_image
            deploy_compose
            health_check
            ;;
        production)
            build_image
            push_image
            deploy_do_app
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            echo "Usage: $0 [dev|staging|production]"
            exit 1
            ;;
    esac
    
    log_info "=== Deployment Complete ==="
}

main "$@"
