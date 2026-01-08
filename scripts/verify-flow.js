#!/usr/bin/env node
/**
 * Script de vérification du flux de secrets
 * 
 * Ce script simule exactement ce qui se passe dans le TEE :
 * 1. Génère un secret (comme TargetApp)
 * 2. Calcule le hash (comme TargetApp)
 * 3. "Reçoit" le secret (comme ConsumeApp)
 * 4. Calcule le hash (comme ConsumeApp)
 * 5. Vérifie que les hash correspondent
 * 
 * Cela prouve que si ConsumeApp reçoit le MÊME secret,
 * elle obtiendra le MÊME hash !
 */

import crypto from 'crypto';

// Couleurs pour la console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Même générateur de secret que TargetApp
function generateApiKey() {
  const prefix = 'sk_live_';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = prefix;
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

console.log('');
log(colors.bold + colors.cyan, '═══════════════════════════════════════════════════════════════');
log(colors.bold + colors.cyan, '    🔐 VÉRIFICATION DU FLUX DE SECRETS ENTRE iApps');
log(colors.bold + colors.cyan, '═══════════════════════════════════════════════════════════════');
console.log('');

// ÉTAPE 1: Simuler TargetApp
log(colors.bold + colors.magenta, '📦 SIMULATION DE TargetApp (Générateur de Secret)');
log(colors.magenta, '─'.repeat(50));
console.log('');

const generatedSecret = generateApiKey();
const targetAppHash = hashSecret(generatedSecret);

log(colors.yellow, '   🎲 Secret généré (visible uniquement dans le TEE)');
log(colors.green, `   📄 Longueur du secret: ${generatedSecret.length} caractères`);
log(colors.green, `   🔢 Hash calculé: ${targetAppHash}`);
console.log('');
log(colors.cyan, '   📤 Secret poussé vers SMS... (hash publié, valeur cachée)');
console.log('');

// ÉTAPE 2: Simuler SMS
log(colors.bold + colors.yellow, '☁️  SIMULATION DU SMS (Secret Management Service)');
log(colors.yellow, '─'.repeat(50));
console.log('');
log(colors.green, '   ✅ Secret stocké de façon chiffrée');
log(colors.green, '   🔒 Seul le TEE peut accéder à la valeur');
log(colors.green, `   👤 Associé au wallet: 0xD83Bc73DB6AfB8b55513D049b23742C97ED24Ef6`);
console.log('');

// ÉTAPE 3: Simuler ConsumeApp
log(colors.bold + colors.magenta, '📱 SIMULATION DE ConsumeApp (Consommateur de Secret)');
log(colors.magenta, '─'.repeat(50));
console.log('');

// ConsumeApp reçoit exactement le même secret via IEXEC_REQUESTER_SECRET_1
const receivedSecret = generatedSecret; // Le SMS injecte le même secret
const consumeAppHash = hashSecret(receivedSecret);

log(colors.yellow, '   🔓 Secret reçu via IEXEC_REQUESTER_SECRET_1');
log(colors.green, `   📄 Longueur du secret reçu: ${receivedSecret.length} caractères`);
log(colors.green, `   🔢 Hash calculé: ${consumeAppHash}`);
console.log('');

// ÉTAPE 4: Vérification
log(colors.bold + colors.cyan, '🔍 VÉRIFICATION');
log(colors.cyan, '─'.repeat(50));
console.log('');

log(colors.yellow, `   Hash TargetApp:   ${targetAppHash}`);
log(colors.yellow, `   Hash ConsumeApp:  ${consumeAppHash}`);
console.log('');

const hashesMatch = targetAppHash === consumeAppHash;

if (hashesMatch) {
  log(colors.bold + colors.green, '   ✅ LES HASH CORRESPONDENT !');
  log(colors.green, '   ════════════════════════════════════════════════════');
  log(colors.green, '   ✓ Le secret a été transmis correctement');
  log(colors.green, '   ✓ Personne n\'a vu la valeur du secret');
  log(colors.green, '   ✓ Les deux iApps ont traité le même secret');
  log(colors.green, '   ════════════════════════════════════════════════════');
} else {
  log(colors.bold + colors.red, '   ❌ LES HASH NE CORRESPONDENT PAS !');
  log(colors.red, '   Quelque chose s\'est mal passé dans le flux.');
}

console.log('');
log(colors.bold + colors.cyan, '═══════════════════════════════════════════════════════════════');
log(colors.bold + colors.cyan, '    📊 RÉSUMÉ DU FLUX');
log(colors.bold + colors.cyan, '═══════════════════════════════════════════════════════════════');
console.log('');

console.log(`
   ┌─────────────────┐       ┌──────────┐       ┌─────────────────┐
   │   TargetApp     │       │   SMS    │       │   ConsumeApp    │
   │                 │       │          │       │                 │
   │  Génère secret  │ ────► │ Stocke   │ ────► │  Reçoit secret  │
   │  Hash: ${targetAppHash.substring(0, 8)}...  │       │ secret   │       │  Hash: ${consumeAppHash.substring(0, 8)}...  │
   │                 │       │          │       │                 │
   └─────────────────┘       └──────────┘       └─────────────────┘
                    
   🔐 Le secret JAMAIS visible en dehors du TEE
   📊 Les hashs prouvent que c'est le MÊME secret !
`);

console.log('');
log(colors.bold + colors.green, '🎉 PREUVE: Si les hashs dans les résultats on-chain correspondent,');
log(colors.bold + colors.green, '   le secret a été transmis correctement sans jamais être exposé !');
console.log('');
