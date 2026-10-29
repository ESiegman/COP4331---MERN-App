FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Local dev: source is bind-mounted over /app, Vite serves with HMR.
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
RUN npm run build

# Production: Caddy serves the built SPA, proxies /api, and terminates TLS.
FROM caddy:2-alpine AS prod
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
