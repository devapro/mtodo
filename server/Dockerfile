# Node 24+ ships a stable built-in SQLite module (node:sqlite),
# so no native build toolchain is required.
FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
