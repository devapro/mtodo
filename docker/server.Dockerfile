# Node 24+ ships a stable built-in SQLite module (node:sqlite),
# so no native build toolchain is required.
# Build context is the repository root (see docker/docker-compose.yml).
FROM node:24-bookworm-slim

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ .
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
