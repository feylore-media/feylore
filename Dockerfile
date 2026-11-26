FROM node:26-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.24.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
RUN pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
ARG VERSION=development
ARG REVISION=unknown
ARG BUILD_DATE=unknown
ARG CHANNEL=development
LABEL org.opencontainers.image.title="Feylore" \
      org.opencontainers.image.source="https://github.com/feylore-media/feylore" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.created=$BUILD_DATE
ENV NODE_ENV=production STORAGE_ROOT=/data/storage INGEST_ROOT=/ingest \
    LIBRARY_BOOKS_ROOT=/libraries/books LIBRARY_AUDIOBOOKS_ROOT=/libraries/audiobooks LIBRARY_MUSIC_ROOT=/libraries/music \
    FEYLORE_VERSION=$VERSION FEYLORE_COMMIT=$REVISION FEYLORE_BUILD_DATE=$BUILD_DATE FEYLORE_CHANNEL=$CHANNEL FEYLORE_INSTALLATION_TYPE=docker
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/storage /ingest /libraries/books /libraries/audiobooks /libraries/podcasts /libraries/music /libraries/movies /libraries/tv /libraries/ttrpg \
    && chown -R node:node /data /ingest /libraries
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
COPY drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=150s --retries=3 CMD node -e "Promise.all([3000,3001].map(p=>fetch('http://127.0.0.1:'+p+'/health/ready'))).then(r=>process.exit(r.every(x=>x.ok)?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server/server/supervisor.js"]
