# syntax=docker/dockerfile:1

# ---- build ----
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static binary, stripped of debug info
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ---- runtime ----
FROM alpine:3.22
# ca-certificates: HTTPS to api.mail.tm; tzdata: correct local timestamps in logs
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build /out/api ./api
# Served at /docs and /docs/openapi.yaml
COPY docs ./docs

USER app
ENV APP_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${APP_PORT}/health" >/dev/null || exit 1

ENTRYPOINT ["./api"]
