FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM node:24-alpine
ENV NODE_ENV=production BOCHUPATH_HOST=0.0.0.0 BOCHUPATH_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/domain ./src/domain
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/.bochupath && chown node:node /app/.bochupath
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
