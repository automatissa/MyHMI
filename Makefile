# ─── MyHMI — Makefile ─────────────────────────────────────────────────────
FIRMWARE_DIR := firmware
ENV          := esp32dev
NPM          := npm
PIO          := $(shell command -v pio 2>/dev/null || command -v platformio 2>/dev/null || echo pio)

.PHONY: dev build start flash monitor clean help

dev: ## Lancer le serveur de développement (Vite :5173 + Node :3002)
	$(NPM) run dev:full

build: ## Compiler le frontend React → dist/
	$(NPM) run build

start: build ## Compiler puis démarrer le serveur de production (:3002)
	$(NPM) start

flash: ## Compiler + flasher l'ESP32 puis ouvrir le moniteur série
	cd $(FIRMWARE_DIR) && $(PIO) run -e $(ENV) -t upload && \
	$(PIO) device monitor -e $(ENV) --baud 115200

monitor: ## Ouvrir le moniteur série sans reflasher (115200 bauds)
	cd $(FIRMWARE_DIR) && $(PIO) device monitor -e $(ENV) --baud 115200

clean: ## Supprimer dist/, cache Vite et artefacts firmware
	rm -rf dist/ node_modules/.vite
	cd $(FIRMWARE_DIR) && $(PIO) run -e $(ENV) -t clean

help: ## Afficher cette aide
	@echo ""
	@echo "  MyHMI — commandes disponibles"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
	@echo ""
