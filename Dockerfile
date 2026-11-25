FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN mkdir data && chown node data
USER node
ENV DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "dist/server.mjs"]
