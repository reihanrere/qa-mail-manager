# syntax=docker/dockerfile:1

# ---- build ----
FROM oven/bun:1.3-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Same-origin API: nginx forwards /api to the backend container
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

# ---- runtime ----
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
