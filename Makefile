# Browser (45flow-web) build and deploy helpers for lab servers.
#
#   make install-remote REMOTE_HOST=192.168.123.5   build + push UI, then (re)apply nginx /app config
#   make web-deploy     REMOTE_HOST=192.168.123.5   faster: build + push the UI only
#   make web-nginx      REMOTE_HOST=192.168.123.5   push nginx generator + enable /app only
#   make web-verify     REMOTE_HOST=192.168.123.5   check /app and /app/ respond

REMOTE_USER ?= root
REMOTE_HOST ?= 192.168.123.5
REMOTE      := $(REMOTE_USER)@$(REMOTE_HOST)
HTTPS_PORT  ?= 443

WEB_BUILD_DIR ?= build/renderer
WEB_ROOT      ?= /opt/45drives/45flow-web
HB_DIR        ?= ../houston-broadcaster
HB_APPDIR     ?= /opt/45drives/houston-broadcaster

RSYNC_FLAGS ?= -a --delete --compress

.PHONY: install-remote web-build web-deploy web-nginx web-verify

install-remote: web-deploy web-nginx web-verify

web-build:
	yarn vite build --config vite.config.mjs

web-deploy: web-build
	ssh $(REMOTE) 'mkdir -p $(WEB_ROOT)'
	rsync $(RSYNC_FLAGS) $(WEB_BUILD_DIR)/ $(REMOTE):$(WEB_ROOT)/
	ssh $(REMOTE) 'chmod -R a+rX $(WEB_ROOT); command -v restorecon >/dev/null && restorecon -R $(WEB_ROOT) || true'
	@echo "Deployed. Open https://$(REMOTE_HOST):$(HTTPS_PORT)/app/"

# Safe to repeat; only needed when nginx-config.js changes, until the package ships /app itself.
web-nginx:
	cd $(HB_DIR) && yarn build:server
	scp $(HB_DIR)/dist/nginx-config.js $(REMOTE):$(HB_APPDIR)/dist/nginx-config.js
	ssh $(REMOTE) 'FLOW_WEB_ROOT=$(WEB_ROOT) node $(HB_APPDIR)/dist/nginx-config.js --upgrade --reload'

web-verify:
	curl -ksI https://$(REMOTE_HOST):$(HTTPS_PORT)/app  | head -n 1
	curl -ksI https://$(REMOTE_HOST):$(HTTPS_PORT)/app/ | head -n 1
