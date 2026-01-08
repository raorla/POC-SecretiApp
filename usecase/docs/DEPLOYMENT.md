# 🚀 Guide de Déploiement - PrivateAI Gateway

Ce guide explique comment passer du **mode simulation** au **mode réel iExec TEE**.

## Table des matières

1. [Comprendre les modes](#comprendre-les-modes)
2. [Prérequis](#prérequis)
3. [Déploiement des iApps](#déploiement-des-iapps)
4. [Configuration du Backend](#configuration-du-backend)
5. [Test en mode réel](#test-en-mode-réel)
6. [Troubleshooting](#troubleshooting)

---

## Comprendre les modes

### Mode Simulation (par défaut)

```bash
SIMULATION_MODE=true
```

- ✅ Pas besoin de déployer les iApps
- ✅ Pas besoin de xRLC
- ✅ Réponses instantanées
- ❌ Clés API stockées localement (pas sécurisé)
- ❌ Pas de TEE, pas de confidentialité

### Mode Réel iExec

```bash
SIMULATION_MODE=false
```

- ✅ Clés API stockées dans le SMS iExec (TEE)
- ✅ Prompts traités dans un environnement TEE
- ✅ Confidentialité totale
- ⚠️ Nécessite des iApps déployées
- ⚠️ Nécessite du xRLC pour les tâches

---

## Prérequis

### 1. Docker

```bash
# Vérifier l'installation
docker --version

# Si Docker n'est pas installé
sudo apt install docker.io  # Ubuntu/Debian
# ou
brew install docker         # macOS
```

### 2. Compte Docker Hub

```bash
# Créer un compte sur https://hub.docker.com
# Puis se connecter
docker login
```

### 3. iExec CLI

```bash
# Installation globale
npm install -g iexec

# Vérifier
iexec --version
```

### 4. Wallet iExec avec xRLC

```bash
# Initialiser le projet iExec
cd usecase
iexec init --skip-wallet

# Créer un wallet
iexec wallet init

# Voir l'adresse
iexec wallet show

# Obtenir des xRLC testnet
# Faucet: https://faucet.iex.ec
```

---

## Déploiement des iApps

### Option 1 : Script Automatique

```bash
# Définir votre username Docker Hub
export DOCKER_USERNAME=votre-username

# Lancer le déploiement
./scripts/deploy-iapps.sh
```

### Option 2 : Déploiement Manuel

```bash
# Lancer le guide interactif
./scripts/deploy-manual.sh
```

### Option 3 : Étape par étape

#### 1. Builder les images Docker

```bash
cd iapps/key-manager
docker build -t $DOCKER_USERNAME/privateai-key-manager:latest .

cd ../ai-oracle
docker build -t $DOCKER_USERNAME/privateai-ai-oracle:latest .
```

#### 2. Push vers Docker Hub

```bash
docker push $DOCKER_USERNAME/privateai-key-manager:latest
docker push $DOCKER_USERNAME/privateai-ai-oracle:latest
```

#### 3. Déployer sur iExec

```bash
# KeyManager
cd iapps/key-manager
iexec app deploy --chain 421614

# Récupérer l'adresse déployée
KEY_MANAGER_APP=$(iexec app show --chain 421614 --raw | jq -r '.address')
echo "Key Manager: $KEY_MANAGER_APP"

# Publier l'ordre (gratuit)
iexec app publish $KEY_MANAGER_APP --chain 421614 --price 0

# AI Oracle
cd ../ai-oracle
iexec app deploy --chain 421614
AI_ORACLE_APP=$(iexec app show --chain 421614 --raw | jq -r '.address')
echo "AI Oracle: $AI_ORACLE_APP"
iexec app publish $AI_ORACLE_APP --chain 421614 --price 0
```

---

## Configuration du Backend

### 1. Mettre à jour le .env

```bash
# backend/.env

# Adresses des iApps déployées
KEY_MANAGER_APP=0x...votre-adresse-key-manager
AI_ORACLE_APP=0x...votre-adresse-ai-oracle

# Désactiver le mode simulation
SIMULATION_MODE=false
```

### 2. Redémarrer le backend

```bash
cd backend
npm run dev
```

### 3. Vérifier

```bash
# Le backend doit afficher:
# 🚀 PrivateAI Gateway API running on port 3001
# 📋 Mode: Production (iExec TEE)
```

---

## Test en mode réel

### 1. Créer une session

```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0xVOTRE_ADRESSE",
    "aiProvider": "openai",
    "encryptedApiKey": "sk-votre-clé-openai"
  }'
```

**Réponse attendue :**

```json
{
  "sessionId": "xxx",
  "taskId": "0x...",
  "status": "pending",
  "message": "Session creation initiated. KeyManager iApp is generating secure session keys."
}
```

### 2. Vérifier la tâche sur l'explorer

Allez sur https://explorer.iex.ec et cherchez votre taskId.

### 3. Une fois la tâche complétée, envoyer un prompt

```bash
curl -X POST http://localhost:3001/api/prompts \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "votre-session-id",
    "prompt": "Hello!",
    "model": "gpt-4"
  }'
```

---

## Troubleshooting

### "Session key not found"

La tâche KeyManager n'est pas encore terminée. Attendez quelques minutes.

### "No workerpool order available"

Aucun workerpool n'accepte votre tâche. Vérifiez :

- Le tag TEE (scone)
- Le prix max du workerpool

### "Insufficient balance"

Vous n'avez pas assez de xRLC. Utilisez le faucet : https://faucet.iex.ec

### "App not deployed"

Les adresses `KEY_MANAGER_APP` ou `AI_ORACLE_APP` sont vides. Déployez les iApps.

### Docker build fails

```bash
# Vérifiez que vous êtes dans le bon dossier
cd iapps/key-manager

# Vérifiez les dépendances
npm install

# Rebuild
docker build --no-cache -t $DOCKER_USERNAME/privateai-key-manager:latest .
```

---

## Architecture en mode réel

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│   Client    │────────▶│   Backend    │────────▶│  iExec Network  │
│  (Browser)  │         │   (Express)  │         │                 │
└─────────────┘         └──────────────┘         │  ┌───────────┐  │
                                                 │  │ KeyManager│  │
                                                 │  │   (TEE)   │  │
                                                 │  └─────┬─────┘  │
                                                 │        │        │
                                                 │        ▼        │
                                                 │  ┌───────────┐  │
                                                 │  │ AI Oracle │  │
                                                 │  │   (TEE)   │──┼──▶ OpenAI/Claude
                                                 │  └───────────┘  │
                                                 └─────────────────┘
```

1. **Client** → Envoie prompt chiffré au Backend
2. **Backend** → Lance une tâche iExec (KeyManager)
3. **KeyManager** → Génère clé de session dans TEE, stocke dans SMS
4. **Backend** → Lance une tâche AI Oracle
5. **AI Oracle** → Récupère clé API depuis SMS, appelle l'IA, chiffre la réponse
6. **Backend** → Récupère le résultat, le renvoie au client
7. **Client** → Déchiffre avec sa clé de session
