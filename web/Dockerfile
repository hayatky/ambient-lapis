# syntax=docker/dockerfile:1.7
FROM node:24.18.0-alpine3.23 AS dependencies

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:24.18.0-alpine3.23 AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY web/ ./
RUN mkdir -p public \
    && npm run build

FROM node:24.18.0-alpine3.23 AS runtime

RUN addgroup -S -g 10001 ambient \
    && adduser -S -D -H -u 10001 -G ambient ambient

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=ambient:ambient /app/.next/standalone ./
COPY --from=build --chown=ambient:ambient /app/.next/static ./.next/static
COPY --from=build --chown=ambient:ambient /app/public ./public
RUN mkdir -p /app/.next/cache \
    && chown ambient:ambient /app/.next/cache

USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const socket=require('node:net').connect(3000,'127.0.0.1');socket.setTimeout(4000);socket.on('connect',()=>{socket.end();process.exit(0)});socket.on('timeout',()=>process.exit(1));socket.on('error',()=>process.exit(1))"]
CMD ["node", "server.js"]
