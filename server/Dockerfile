FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

# Local dev: source is bind-mounted over /app, node --watch reloads on change.
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "src/index.js"]
