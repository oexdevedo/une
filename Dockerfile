# ==========================================
# Estágio 1: Build do Frontend React (Vite)
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copia dependências do frontend
COPY package*.json ./
RUN npm install

# Copia código fonte do frontend e gera o build em /app/dist
COPY . .
RUN npm run build

# ==========================================
# Estágio 2: Runtime de Produção (Node.js)
# ==========================================
FROM node:20-bookworm-slim

WORKDIR /app

# Copia e instala dependências do backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copia o código do backend
COPY backend/ ./

# Copia o build estático do frontend para /app/dist (onde server.js procura ../dist)
COPY --from=builder /app/dist /app/dist

# Cria pastas para uploads e persistência de dados
RUN mkdir -p /app/backend/uploads /app/backend/data

# Porta padrão
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

# Inicia o servidor (o server.js auto-inicializa as 22 tabelas do SQLite se necessário)
CMD ["node", "server.js"]
