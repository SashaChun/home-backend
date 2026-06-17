# ── Stage 1: install production dependencies ─────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: minimal production runner ───────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -g 10001 -S app && adduser -u 10001 -S -G app app

COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app src ./src
COPY --chown=app:app package.json ./

USER 10001
EXPOSE 4000
CMD ["node", "src/server.js"]
