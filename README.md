# Secret Generator iApp for iExec

Cette iApp génère des secrets sécurisés dans un environnement TEE (Trusted Execution Environment) et les rend disponibles pour être utilisés par d'autres iApps.

## 🌐 Réseau cible

**Arbitrum Sepolia Testnet** (Chain ID: 421614)

## 📋 Prérequis

- Node.js v20+
- Docker
- Compte DockerHub
- iApp Generator CLI (`npm install -g @iexec/iapp`)
- Tokens RLC sur Arbitrum Sepolia ([Faucet](https://faucet.iex.ec))

## 🚀 Installation

```bash
# Installer les dépendances
npm install

# Installer le générateur iApp globalement
npm install -g @iexec/iapp
```

## 🔧 Configuration

1. Importer votre wallet :

```bash
iapp wallet import
```

2. Configurer les variables d'environnement :

```bash
export PRIVATE_KEY=0x...  # Votre clé privée
```

## 📦 Build & Test

### Tester localement

```bash
# Test basique (génère un secret aléatoire)
iapp test

# Test avec arguments (format: targetAddress,secretName,secretType)
iapp test --args "0x123...abc,my-api-key,api-key"

# Types de secrets disponibles:
# - api-key     : Format prefix_randomstring (ex: abcd_Kj2n8...)
# - password    : Mot de passe fort avec caractères spéciaux
# - token       : Token format JWT-like
# - uuid        : UUID v4
# - hex         : 64 caractères hexadécimaux
# - private-key : Clé privée Ethereum (0x...)
# - random      : Bytes aléatoires en base64 (défaut)
```

## 🚀 Déploiement

### Déployer sur Arbitrum Sepolia

```bash
iapp deploy --chain arbitrum-sepolia-testnet
```

L'adresse de votre iApp sera affichée après le déploiement.

### Exécuter l'iApp déployée

```bash
iapp run <YOUR_IAPP_ADDRESS> --chain arbitrum-sepolia-testnet --args "0xTargetApp,my-secret,api-key"
```

## 📤 Utiliser le secret généré

Après l'exécution, récupérez le fichier `result.json` et utilisez le script fourni pour pousser le secret :

```bash
# Définir votre clé privée
export PRIVATE_KEY=0x...

# Pousser le secret vers le SMS
node scripts/push-secret.js ./output/result.json --chain arbitrum-sepolia-testnet
```

## 🔐 Comment utiliser le secret dans une autre iApp

### 1. Lors de l'exécution de l'iApp cible

```javascript
import { IExecDataProtectorCore } from "@iexec/dataprotector";

const dataProtectorCore = new IExecDataProtectorCore(window.ethereum);

const response = await dataProtectorCore.processProtectedData({
  app: "0xYourTargetAppAddress",
  secrets: {
    1: "my-secret-name", // Le nom du secret poussé
  },
});
```

### 2. Dans le code de l'iApp cible

```javascript
// Le secret est accessible via la variable d'environnement
const secret = process.env.IEXEC_REQUESTER_SECRET_1;

// Utiliser le secret
console.log("Secret récupéré:", secret);
```

## 📁 Structure du projet

```
secret/
├── src/
│   └── app.js              # Code principal de l'iApp
├── scripts/
│   └── push-secret.js      # Script pour pousser les secrets
├── input/                  # Fichiers d'entrée (test local)
├── output/                 # Fichiers de sortie (test local)
├── cache/                  # Cache Docker
├── Dockerfile              # Configuration Docker
├── iapp.config.json        # Configuration iApp
├── package.json            # Dépendances npm
└── README.md               # Ce fichier
```

## 🔗 Liens utiles

- [Documentation iExec](https://docs.iex.ec/)
- [iApp Generator](https://docs.iex.ec/references/iapp-generator)
- [DataProtector SDK](https://docs.iex.ec/references/dataProtector)
- [iExec Explorer](https://explorer.iex.ec/)
- [Faucet RLC](https://faucet.iex.ec/)

## 📍 Adresses importantes (Arbitrum Sepolia)

| Contract      | Address                                    |
| ------------- | ------------------------------------------ |
| Diamond Proxy | 0xB2157BF2fAb286b2A4170E3491Ac39770111Da3E |
| AppRegistry   | 0x9950D94fb074182ee93ff79A50Cd698C4983281F |
| Workerpool    | 0xB967057a21dc6A66A29721d96b8Aa7454B7c383F |
| RLC Token     | 0x9923eD3cbd90CD78b910c475f9A731A6e0b8C963 |

## ⚠️ Notes importantes

1. **Les secrets sont immuables** : Une fois poussé, un secret ne peut pas être modifié. Utilisez un nom différent si vous devez créer un nouveau secret.

2. **Sécurité TEE** : Les secrets sont générés dans un environnement d'exécution de confiance (TEE) et ne sont jamais exposés en clair en dehors de celui-ci.

3. **Coût** : L'exécution d'une iApp consomme des tokens RLC. Assurez-vous d'avoir suffisamment de RLC sur Arbitrum Sepolia.
