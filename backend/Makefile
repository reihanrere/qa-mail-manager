APP_NAME := qa-mail-manager
BIN_DIR := tmp
BIN := $(BIN_DIR)/main
MAIN_PKG := ./cmd/api

.PHONY: help run build dev tidy fmt vet test clean env

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

run: ## Run the API server
	go run $(MAIN_PKG)

dev: ## Run the API server with hot reload (requires air)
	air

build: ## Compile the API binary into tmp/main
	go build -o $(BIN) $(MAIN_PKG)

tidy: ## Tidy go.mod/go.sum
	go mod tidy

fmt: ## Format all Go source files
	gofmt -w .

vet: ## Run go vet
	go vet ./...

test: ## Run tests
	go test ./...

clean: ## Remove build artifacts
	rm -rf $(BIN_DIR)

env: ## Create .env from .env.example if missing
	@test -f .env || cp .env.example .env
