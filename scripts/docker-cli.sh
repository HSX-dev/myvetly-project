#!/bin/bash

# ===========================================
# VETLY API DOCKER CLI HELPER
# ===========================================
# Quick commands for local Docker development
# Usage: ./scripts/docker-cli.sh [command]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$PROJECT_DIR"

case "$1" in
    # Development commands
    dev|start)
        echo -e "${GREEN}Starting development environment...${NC}"
        docker-compose -f docker-compose.dev.yml up -d
        echo -e "${GREEN}API running at http://localhost:3001${NC}"
        ;;
    
    dev:build)
        echo -e "${GREEN}Building and starting development environment...${NC}"
        docker-compose -f docker-compose.dev.yml up -d --build
        ;;
    
    dev:logs)
        docker-compose -f docker-compose.dev.yml logs -f api
        ;;
    
    dev:stop)
        echo -e "${YELLOW}Stopping development environment...${NC}"
        docker-compose -f docker-compose.dev.yml down
        ;;
    
    dev:restart)
        docker-compose -f docker-compose.dev.yml restart api
        ;;
    
    # Production commands
    prod|prod:start)
        echo -e "${GREEN}Starting production environment...${NC}"
        docker-compose -f docker-compose.prod.yml up -d
        ;;
    
    prod:build)
        echo -e "${GREEN}Building production image...${NC}"
        docker build --platform linux/amd64 -t vetly-api:latest .
        ;;
    
    prod:logs)
        docker-compose -f docker-compose.prod.yml logs -f api
        ;;
    
    prod:stop)
        docker-compose -f docker-compose.prod.yml down
        ;;
    
    # Utility commands
    shell)
        echo -e "${GREEN}Opening shell in API container...${NC}"
        docker-compose -f docker-compose.dev.yml exec api sh
        ;;
    
    redis-cli)
        echo -e "${GREEN}Opening Redis CLI...${NC}"
        docker-compose -f docker-compose.dev.yml exec redis redis-cli
        ;;
    
    clean)
        echo -e "${YELLOW}Cleaning up Docker resources...${NC}"
        docker-compose -f docker-compose.dev.yml down -v --rmi local
        docker system prune -f
        ;;
    
    status)
        echo -e "${GREEN}Container Status:${NC}"
        docker-compose -f docker-compose.dev.yml ps
        ;;
    
    health)
        echo -e "${GREEN}Checking API health...${NC}"
        curl -s http://localhost:3001/api && echo " - API is healthy!" || echo " - API is not responding"
        ;;
    
    *)
        echo "Vetly API Docker CLI"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Development Commands:"
        echo "  dev, start      Start development environment"
        echo "  dev:build       Build and start development environment"
        echo "  dev:logs        View development logs"
        echo "  dev:stop        Stop development environment"
        echo "  dev:restart     Restart API container"
        echo ""
        echo "Production Commands:"
        echo "  prod            Start production environment"
        echo "  prod:build      Build production Docker image"
        echo "  prod:logs       View production logs"
        echo "  prod:stop       Stop production environment"
        echo ""
        echo "Utility Commands:"
        echo "  shell           Open shell in API container"
        echo "  redis-cli       Open Redis CLI"
        echo "  clean           Clean up Docker resources"
        echo "  status          Show container status"
        echo "  health          Check API health"
        ;;
esac
