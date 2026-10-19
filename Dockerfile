# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --ignore-scripts --no-audit --no-fund
COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 DATABASE_PATH=/data/wangxueban.sqlite NODE_OPTIONS=--max-old-space-size=192
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/server/package.json apps/server/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace shenwang-bff --workspace @wangxueban/contracts
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node db ./db
COPY --chown=node:node config ./config
COPY --chown=node:node prompts ./prompts
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
