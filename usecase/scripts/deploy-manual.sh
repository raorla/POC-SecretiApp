#!/bin/bash
# =============================================================================
# PrivateAI Gateway - Déploiement Manuel des iApps
# =============================================================================
# Ce script guide le déploiement étape par étape

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
BACKEND_ENV="$PROJECT_DIR/backend/.env"

CHAIN_ID=421614
DOCKER_USERNAME="${DOCKER_USERNAME:-}"

print_step() {
    local step=$1
    local title=$2
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Étape $step: $title${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

wait_for_continue() {
    echo ""
    read -p "Appuyez sur ENTRÉE pour continuer..."
    echo ""
}

# Header
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PrivateAI Gateway - Déploiement Manuel des iApps         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Docker Username
print_step "1/6" "Configuration Docker Hub"

if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${YELLOW}Votre username Docker Hub:${NC}"
    read -p "> " DOCKER_USERNAME
    export DOCKER_USERNAME
fi

echo -e "${GREEN}✓${NC} Docker Username: $DOCKER_USERNAME"
wait_for_continue

# Step 2: Init iExec wallet
print_step "2/6" "Initialisation Wallet iExec"

cd "$PROJECT_DIR"

if [ ! -f "chain.json" ]; then
    echo -e "${CYAN}Initialisation iExec...${NC}"
    iexec init --skip-wallet 2>/dev/null || true
fi

if [ ! -f "wallet.json" ]; then
    echo -e "${CYAN}Création d'un nouveau wallet...${NC}"
    iexec wallet create --keystoredir . --password ""
else
    echo -e "${GREEN}✓${NC} Wallet existant trouvé"
fi

WALLET_ADDRESS=$(iexec wallet show --raw 2>/dev/null | jq -r '.address' || echo "")
echo -e "${GREEN}✓${NC} Wallet: $WALLET_ADDRESS"

# Check balance
echo ""
echo -e "${CYAN}Vérification du solde...${NC}"
iexec wallet show --chain $CHAIN_ID 2>/dev/null || true

echo ""
echo -e "${YELLOW}⚠ Assurez-vous d'avoir du xRLC sur Arbitrum Sepolia${NC}"
echo -e "  Faucet: https://faucet.iex.ec"
wait_for_continue

# Step 3: Build Docker images
print_step "3/6" "Construction des images Docker"

echo -e "${CYAN}Building key-manager...${NC}"
cd "$IAPPS_DIR/key-manager"
docker build -t "$DOCKER_USERNAME/privateai-key-manager:latest" .
echo -e "${GREEN}✓${NC} key-manager image built"

echo ""
echo -e "${CYAN}Building ai-oracle...${NC}"
cd "$IAPPS_DIR/ai-oracle"
docker build -t "$DOCKER_USERNAME/privateai-ai-oracle:latest" .
echo -e "${GREEN}✓${NC} ai-oracle image built"

wait_for_continue

# Step 4: Push to Docker Hub
print_step "4/6" "Push vers Docker Hub"

echo -e "${CYAN}Connexion à Docker Hub...${NC}"
echo -e "${YELLOW}Si pas connecté, exécutez: docker login${NC}"
echo ""

echo -e "${CYAN}Push key-manager...${NC}"
docker push "$DOCKER_USERNAME/privateai-key-manager:latest"
echo -e "${GREEN}✓${NC} key-manager pushed"

echo ""
echo -e "${CYAN}Push ai-oracle...${NC}"
docker push "$DOCKER_USERNAME/privateai-ai-oracle:latest"
echo -e "${GREEN}✓${NC} ai-oracle pushed"

wait_for_continue

# Step 5: Deploy to iExec
print_step "5/6" "Déploiement sur iExec"

# Deploy key-manager
echo -e "${CYAN}Déploiement key-manager...${NC}"
cd "$IAPPS_DIR/key-manager"

# Update iexec.json
CHECKSUM=$(docker inspect --format='{{.Id}}' "$DOCKER_USERNAME/privateai-key-manager:latest" | sed 's/sha256:/0x/')
cat > iexec.json << EOF
{
  "app": {
    "owner": "$WALLET_ADDRESS",
    "name": "privateai-key-manager",
    "type": "DOCKER",
    "multiaddr": "docker.io/$DOCKER_USERNAME/privateai-key-manager:latest",
    "checksum": "$CHECKSUM"
  }
}
EOF

iexec app deploy --chain $CHAIN_ID
KEY_MANAGER_APP=$(iexec app show --chain $CHAIN_ID --raw 2>/dev/null | jq -r '.address' || echo "")

if [ -n "$KEY_MANAGER_APP" ]; then
    echo -e "${GREEN}✓${NC} Key Manager déployé: $KEY_MANAGER_APP"
    iexec app publish "$KEY_MANAGER_APP" --chain $CHAIN_ID --price 0 2>/dev/null || true
fi

echo ""

# Deploy ai-oracle
echo -e "${CYAN}Déploiement ai-oracle...${NC}"
cd "$IAPPS_DIR/ai-oracle"

# Update iexec.json
CHECKSUM=$(docker inspect --format='{{.Id}}' "$DOCKER_USERNAME/privateai-ai-oracle:latest" | sed 's/sha256:/0x/')
cat > iexec.json << EOF
{
  "app": {
    "owner": "$WALLET_ADDRESS",
    "name": "privateai-ai-oracle",
    "type": "DOCKER",
    "multiaddr": "docker.io/$DOCKER_USERNAME/privateai-ai-oracle:latest",
    "checksum": "$CHECKSUM"
  }
}
EOF

iexec app deploy --chain $CHAIN_ID
AI_ORACLE_APP=$(iexec app show --chain $CHAIN_ID --raw 2>/dev/null | jq -r '.address' || echo "")

if [ -n "$AI_ORACLE_APP" ]; then
    echo -e "${GREEN}✓${NC} AI Oracle déployé: $AI_ORACLE_APP"
    iexec app publish "$AI_ORACLE_APP" --chain $CHAIN_ID --price 0 2>/dev/null || true
fi

wait_for_continue

# Step 6: Update backend
print_step "6/6" "Configuration du Backend"

echo -e "${CYAN}Mise à jour de $BACKEND_ENV...${NC}"

# Backup
cp "$BACKEND_ENV" "$BACKEND_ENV.backup.$(date +%s)" 2>/dev/null || true

# Update KEY_MANAGER_APP
if [ -n "$KEY_MANAGER_APP" ]; then
    if grep -q "^KEY_MANAGER_APP=" "$BACKEND_ENV"; then
        sed -i "s|^KEY_MANAGER_APP=.*|KEY_MANAGER_APP=$KEY_MANAGER_APP|" "$BACKEND_ENV"
    else
        echo "KEY_MANAGER_APP=$KEY_MANAGER_APP" >> "$BACKEND_ENV"
    fi
fi

# Update AI_ORACLE_APP
if [ -n "$AI_ORACLE_APP" ]; then
    if grep -q "^AI_ORACLE_APP=" "$BACKEND_ENV"; then
        sed -i "s|^AI_ORACLE_APP=.*|AI_ORACLE_APP=$AI_ORACLE_APP|" "$BACKEND_ENV"
    else
        echo "AI_ORACLE_APP=$AI_ORACLE_APP" >> "$BACKEND_ENV"
    fi
fi

# Set SIMULATION_MODE=false
if grep -q "^SIMULATION_MODE=" "$BACKEND_ENV"; then
    sed -i "s|^SIMULATION_MODE=.*|SIMULATION_MODE=false|" "$BACKEND_ENV"
else
    echo "SIMULATION_MODE=false" >> "$BACKEND_ENV"
fi

echo -e "${GREEN}✓${NC} Backend configuré"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✓ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "📦 ${CYAN}Key Manager:${NC} $KEY_MANAGER_APP"
echo -e "📦 ${CYAN}AI Oracle:${NC}   $AI_ORACLE_APP"
echo ""
echo -e "🔗 Explorer iExec:"
echo -e "   https://explorer.iex.ec/apps/$KEY_MANAGER_APP"
echo -e "   https://explorer.iex.ec/apps/$AI_ORACLE_APP"
echo ""
echo -e "🔄 Redémarrez le backend:"
echo -e "   ${CYAN}cd backend && npm run dev${NC}"
echo ""
