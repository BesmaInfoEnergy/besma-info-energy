# ==============================================================================
# BESMAINFOENERGY — DOCKERFILE PRODUCTION (FRONTEND + PASSERELLE EXPRESS)
# Conforme Loi Algérienne n° 18-07 & Normes de Sécurité Industrielle SONELGAZ
# ==============================================================================

# Étape 1 : Build de l'interface React/TypeScript (Vite)
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json ./

# Installation propre des dépendances
RUN npm install

# Copie du code source applicatif
COPY index.html tsconfig.json vite.config.ts tailwind.config.js server.ts metadata.json ./
COPY src/ ./src/

# Compilation du frontend de production dans /app/dist
RUN npm run build

# Étape 2 : Image d'exécution légère et sécurisée (Non-Root)
FROM node:22-alpine AS production

WORKDIR /app

# Création d'un utilisateur système non-privilégié pour la sécurité industrielle
RUN addgroup -S besmagroup && adduser -S besmauser -G besmagroup

# Copie des fichiers compilés et du serveur depuis l'étape builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/metadata.json ./

# Création des répertoires de clés et modèles avec permissions restreintes
RUN mkdir -p /app/keys /app/models && chown -R besmauser:besmagroup /app

USER besmauser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Démarrage du serveur Express + Passerelle API
CMD ["npm", "run", "start"]
