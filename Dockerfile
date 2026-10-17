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
# Estágio 2: Runtime de Produção (Ubuntu 24.04 LTS com GLIBC 2.39)
# ==========================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Instala Node.js 20 oficial e certificados
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia e instala dependências do backend diretamente
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copia o código do backend
COPY backend/ /app/backend/

# Copia o build estático do frontend para /app/dist (onde server.js procura ../dist)
COPY --from=frontend-builder /app/dist /app/dist

# Cria pastas para uploads e persistência de dados
RUN mkdir -p /app/backend/uploads /app/backend/data

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

# Inicia o servidor (o server.js auto-inicializa as 22 tabelas do SQLite se necessário)
CMD ["node", "server.js"]
