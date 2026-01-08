#!/bin/bash
# =============================================================================
# PrivateAI Gateway - Script de déploiement des iApps sur iExec
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:-}"
CHAIN_ID=421614

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IAPPS_DIR="$PROJECT_DIR/iapps"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     PrivateAI Gateway - Déploiement iApps iExec            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_requirements() {
    echo -e "${CYAN}📋 Vérification des prérequis...${NC}"
    
    local missing=0
    
    # Docker
    if command -v docker &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker installé"
    else
        echo -e "  ${RED}✗${NC} Docker non installé"
        missing=1
    fi
    
    # Docker daemon
    if docker info &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker daemon actif"
    else
        echo -e "  ${RED}✗${NC} Docker daemon non actif"
        missing=1
    fi
    
    # iExec CLI
    if command -v iexec &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} iExec CLI installé ($(iexec --version 2>/dev/null || echo 'version inconnue'))"
    else
        echo -e "  ${YELLOW}⚠${NC} iExec CLI non installé - installation..."
        npm install -g iexec
    fi
    
    # Docker username
    if [ -z "$DOCKER_USERNAME" ]; then
        echo -e "  ${RED}✗${NC} DOCKER_USERNAME non défini"
        echo ""
        echo -e "  ${YELLOW}Définissez votre username Docker Hub:${NC}"
        echo -e "  ${CYAN}export DOCKER_USERNAME=votre-username${NC}"
        missing=1
    else
        echo -e "  ${GREEN}✓${NC} Docker Hub: $DOCKER_USERNAME"
    fi
    
    # Check iExec wallet
    if [ -f "$PROJECT_DIR/chain.json" ] || [ -f "$IAPPS_DIR/key-manager/chain.json" ]; then
        echo -e "  ${GREEN}✓${NC} Configuration iExec trouvée"
    else
        echo -e "  ${YELLOW}⚠${NC} Wallet iExec non initialisé"
        echo ""
        echo -e "  ${YELLOW}Initialisez votre wallet:${NC}"
        echo -e "  ${CYAN}cd $PROJECT_DIR && iexec wallet init${NC}"
    fi
    
    if [ $missing -eq 1 ]; then
        echo ""
        echo -e "${RED}❌ Prérequis manquants. Corrigez les erreurs ci-dessus.${NC}"
        exit 1
    fi
    
    echo ""
}

build_image() {
    local app_name=$1
    local image_name="$DOCKER_USERNAME/privateai-$app_name:latest"
    
    echo -e "${CYAN}🔨 Construction: $app_name${NC}"
    
    cd "$IAPPS_DIR/$app_name"
    
    # Install dependencies
    npm install --production 2>/dev/null || true
    
    # Build Docker image
    docker build -t "$image_name" . --quiet
    
    echo -e "  ${GREEN}✓${NC} Image construite: $image_name"
}

push_image() {
    local app_name=$1
    local image_name="$DOCKER_USERNAME/privateai-$app_name:latest"
    
    echo -e "${CYAN}📤 Push: $app_name${NC}"
    
    docker push "$image_name" --quiet 2>/dev/null || docker push "$image_name"
    
    echo -e "  ${GREEN}✓${NC} Image poussée: $image_name"
}

sconify_image() {
    local app_name=$1
    local base_image="$DOCKER_USERNAME/privateai-$app_name:latest"
    local tee_image="$DOCKER_USERNAME/privateai-$app_name:tee-scone"
    
    echo -e "${CYAN}🔐 Sconification TEE: $app_name${NC}"
    
    # Use iExec sconify (requires Docker-in-Docker or specific setup)
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e DEBUG=true \
        iexechub/iexec-sconify-image:latest \
        sconify \
        --base="$base_image" \
        --name="$tee_image" \
        --from=node:20-alpine \
        --binary=/usr/local/bin/node \
        --fs-dir=/app \
        --heap=1G \
        --dlopen=2 \
        --no-color \
        --command="node /app/src/app.js" 2>&1 || {
            echo -e "  ${YELLOW}⚠${NC} Sconification manuelle requise"
            echo -e "  ${CYAN}Utilisez: iexec app sconify${NC}"
            return 1
        }
    
    # Push sconified image
    docker push "$tee_image" --quiet 2>/dev/null || docker push "$tee_image"
    
    echo -e "  ${GREEN}✓${NC} Image TEE créée: $tee_image"
}

deploy_app() {
    local app_name=$1
    local image_name="$DOCKER_USERNAME/privateai-$app_name:latest"
    
    echo -e "${CYAN}🚀 Déploiement iExec: $app_name${NC}"
    
    cd "$IAPPS_DIR/$app_name"
    
    # Get wallet address
    local wallet_address=$(iexec wallet show --raw 2>/dev/null | jq -r '.address' || echo "")
    
    if [ -z "$wallet_address" ]; then
        echo -e "  ${YELLOW}⚠${NC} Initialisation du wallet..."
        iexec wallet init --chain $CHAIN_ID
        wallet_address=$(iexec wallet show --raw | jq -r '.address')
    fi
    
    # Get image checksum
    local checksum=$(docker inspect --format='{{.Id}}' "$image_name" 2>/dev/null | sed 's/sha256:/0x/' || echo "0x0")
    
    # Update iexec.json
    cat > iexec.json << EOF
{
  "app": {
    "owner": "$wallet_address",
    "name": "privateai-$app_name",
    "type": "DOCKER",
    "multiaddr": "docker.io/$image_name",
    "checksum": "$checksum",
    "mrenclave": {
      "framework": "SCONE",
      "version": "v5",
      "entrypoint": "node /app/src/app.js",
      "heapSize": 1073741824,
      "fingerprint": ""
    }
  }
}
EOF

    # Deploy
    local deploy_result=$(iexec app deploy --chain $CHAIN_ID 2>&1)
    local app_address=$(echo "$deploy_result" | grep -oP '0x[a-fA-F0-9]{40}' | head -1)
    
    if [ -z "$app_address" ]; then
        echo -e "  ${RED}✗${NC} Échec du déploiement"
        echo "$deploy_result"
        return 1
    fi
    
    echo -e "  ${GREEN}✓${NC} App déployée: $app_address"
    
    # Publish app order (free)
    echo -e "  📋 Publication de l'ordre..."
    iexec app publish "$app_address" --chain $CHAIN_ID --price 0 2>/dev/null || true
    
    echo "$app_address"
}

update_backend() {
    local key_manager=$1
    local ai_oracle=$2
    
    echo -e "${CYAN}⚙️ Configuration backend...${NC}"
    
    # Create backup
    cp "$BACKEND_ENV" "$BACKEND_ENV.backup" 2>/dev/null || true
    
    # Update KEY_MANAGER_APP
    if grep -q "^KEY_MANAGER_APP=" "$BACKEND_ENV" 2>/dev/null; then
        sed -i "s|^KEY_MANAGER_APP=.*|KEY_MANAGER_APP=$key_manager|" "$BACKEND_ENV"
    else
        echo "KEY_MANAGER_APP=$key_manager" >> "$BACKEND_ENV"
    fi
    
    # Update AI_ORACLE_APP
    if grep -q "^AI_ORACLE_APP=" "$BACKEND_ENV" 2>/dev/null; then
        sed -i "s|^AI_ORACLE_APP=.*|AI_ORACLE_APP=$ai_oracle|" "$BACKEND_ENV"
    else
        echo "AI_ORACLE_APP=$ai_oracle" >> "$BACKEND_ENV"
    fi
    
    # Set SIMULATION_MODE=false
    if grep -q "^SIMULATION_MODE=" "$BACKEND_ENV" 2>/dev/null; then
        sed -i "s|^SIMULATION_MODE=.*|SIMULATION_MODE=false|" "$BACKEND_ENV"
    else
        echo "SIMULATION_MODE=false" >> "$BACKEND_ENV"
    fi
    
    echo -e "  ${GREEN}✓${NC} Backend configuré (SIMULATION_MODE=false)"
}

print_summary() {
    local key_manager=$1
    local ai_oracle=$2
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✓ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "📦 ${CYAN}Key Manager:${NC} $key_manager"
    echo -e "📦 ${CYAN}AI Oracle:${NC}   $ai_oracle"
    echo ""
    echo -e "🔗 Voir sur l'explorer:"
    echo -e "   ${BLUE}https://explorer.iex.ec/apps/$key_manager${NC}"
    echo -e "   ${BLUE}https://explorer.iex.ec/apps/$ai_oracle${NC}"
    echo ""
    echo -e "🔄 Redémarrez le backend:"
    echo -e "   ${CYAN}cd $PROJECT_DIR/backend && npm run dev${NC}"
    echo ""
}

# Main
main() {
    print_header
    check_requirements
    
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Étape 1/4: Construction des images Docker${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    build_image "key-manager"
    build_image "ai-oracle"
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Étape 2/4: Push vers Docker Hub${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    push_image "key-manager"
    push_image "ai-oracle"
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Étape 3/4: Déploiement sur iExec${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    KEY_MANAGER_ADDRESS=$(deploy_app "key-manager")
    AI_ORACLE_ADDRESS=$(deploy_app "ai-oracle")
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Étape 4/4: Configuration backend${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    update_backend "$KEY_MANAGER_ADDRESS" "$AI_ORACLE_ADDRESS"
    
    print_summary "$KEY_MANAGER_ADDRESS" "$AI_ORACLE_ADDRESS"
}

# Run
main "$@"
