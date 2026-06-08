# Build context is the repository root (see docker/docker-compose.yml).
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Default to a relative base URL so the client talks to the API same-origin
# (nginx proxies /api/ to the server container). Works on localhost, LAN, and
# ngrok without baking a host into the bundle.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
