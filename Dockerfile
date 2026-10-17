# ==========================================
# Estágio 1: Build do Frontend React (Vite)
# ==========================================
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ==========================================
# Estágio 2: Build do Backend (Compilando sqlite3 nativamente)
# ==========================================
FROM node:20-bookworm-slim AS backend-builder

WORKDIR /app/backend

# Instala ferramentas necessárias para compilar sqlite3 contra a glibc do Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --omit=dev --build-from-source=sqlite3

# ==========================================
# Estágio 3: Imagem Final de Produção (Super leve)
# ==========================================
FROM node:20-bookworm-slim

WORKDIR /app

# Copia código do backend e os módulos nativos já compilados
COPY backend/ /app/backend/
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules

# Copia o build estático do frontend para /app/dist (onde server.js procura ../dist)
COPY --from=frontend-builder /app/dist /app/dist

WORKDIR /app/backend

# Cria pastas para uploads e persistência de dados
RUN mkdir -p /app/backend/uploads /app/backend/data

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

# Inicia o servidor (o server.js auto-inicializa as 22 tabelas do SQLite se necessário)
CMD ["node", "server.js"]
