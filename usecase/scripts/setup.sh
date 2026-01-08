#!/bin/bash

# PrivateAI Gateway - Development Setup Script

set -e

echo "🚀 PrivateAI Gateway - Development Setup"
echo "========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js 20+ is required (found v$NODE_VERSION)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is required${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Setup environment files
echo ""
echo "⚙️  Setting up environment files..."

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}Created .env from .env.example${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env with your configuration${NC}"
fi

if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env 2>/dev/null || true
fi

if [ ! -f "frontend/.env.local" ]; then
    cp frontend/.env.example frontend/.env.local 2>/dev/null || true
fi

if [ ! -f "contracts/.env" ]; then
    cp contracts/.env.example contracts/.env 2>/dev/null || true
fi

# Build contracts
echo ""
echo "🔨 Building contracts..."
cd contracts
npx hardhat compile
cd ..

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env files with your configuration"
echo "  2. Run 'npm run dev' to start development servers"
echo "  3. Deploy iApps with 'npm run deploy:iapps'"
echo "  4. Deploy contracts with 'npm run deploy:contracts'"
echo ""
echo "Documentation: https://docs.iex.ec"
