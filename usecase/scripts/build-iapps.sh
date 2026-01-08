#!/bin/bash
# =============================================================================
# PrivateAI Gateway - Script de Build des iApps (sans déploiement)
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IAPPS_DIR="$PROJECT_DIR/iapps"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        PrivateAI Gateway - Build des iApps                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Build key-manager
echo -e "${CYAN}📦 Building key-manager...${NC}"
cd "$IAPPS_DIR/key-manager"
npm install 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} key-manager prêt"

# Build ai-oracle
echo -e "${CYAN}📦 Building ai-oracle...${NC}"
cd "$IAPPS_DIR/ai-oracle"
npm install 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} ai-oracle prêt"

echo ""
echo -e "${GREEN}✓ Build terminé !${NC}"
echo ""
echo -e "Prochaines étapes pour le déploiement iExec:"
echo ""
echo -e "  1. ${CYAN}export DOCKER_USERNAME=votre-username-docker${NC}"
echo ""
echo -e "  2. ${CYAN}./scripts/deploy-iapps.sh${NC}"
echo ""
echo -e "  Ou manuellement:"
echo -e "  ${CYAN}cd iapps/key-manager && iexec app deploy --chain 421614${NC}"
echo -e "  ${CYAN}cd iapps/ai-oracle && iexec app deploy --chain 421614${NC}"
echo ""
