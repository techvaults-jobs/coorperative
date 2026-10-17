# Builds the web app from the pnpm workspace. On start, migrations run before the server
# (safe while the service runs a single instance; move to a release step before scaling out).
FROM node:22-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @techvaults/web build

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
