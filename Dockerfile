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
# Estágio 2: Build das dependências do Backend (Compila sqlite3 nativamente)
# ==========================================
FROM node:20-bookworm-slim AS backend-builder

WORKDIR /app/backend

# Instala ferramentas essenciais para compilar o sqlite3 na glibc do container
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --omit=dev

# ==========================================
# Estágio 3: Runtime de Produção Oficial
# ==========================================
FROM node:20-bookworm-slim

WORKDIR /app

# Copia código do backend e os módulos nativos compilados contra esta mesma imagem
COPY backend/ /app/backend/
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules

# Copia o build estático do frontend para /app/dist (onde server.js procura ../dist)
COPY --from=frontend-builder /app/dist /app/dist

WORKDIR /app/backend

# Cria pastas para persistência de dados e uploads
RUN mkdir -p /app/backend/data /app/backend/data/uploads

ENV PORT=3001
ENV NODE_ENV=production
ENV DATA_DIR=/app/backend/data
ENV DB_PATH=/app/backend/data/database.sqlite

# Declaração oficial de volume persistente para Docker e Easypanel
VOLUME ["/app/backend/data"]

EXPOSE 3001

# Inicia o servidor (o server.js auto-inicializa as 22 tabelas do SQLite no volume se necessário)
CMD ["node", "server.js"]
