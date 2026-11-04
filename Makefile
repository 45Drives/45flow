# Browser (45flow-web) build and deploy helpers for lab servers.
#
#   make install-remote REMOTE_HOST=192.168.123.5   build + push UI, then (re)apply nginx /app config
#   make web-deploy     REMOTE_HOST=192.168.123.5   faster: build + push the UI only
#   make web-nginx      REMOTE_HOST=192.168.123.5   push nginx generator + enable /app only
#   make web-verify     REMOTE_HOST=192.168.123.5   check /app, /app/ and the session API respond
#   make web-package                                .tar.gz, .deb and .rpm in build/web-packages (version from package.json)
#   make broadcaster-remote REMOTE_HOST=...         full Broadcaster install (needed once for /api/session)
#   make web-gate GATE=off REMOTE_HOST=...          let an unlicensed server serve /app (GATE=on restores Pro-only); restarts the Broadcaster

REMOTE_USER ?= root
REMOTE_HOST ?= 192.168.123.5
REMOTE      := $(REMOTE_USER)@$(REMOTE_HOST)
HTTPS_PORT  ?= 443

WEB_BUILD_DIR ?= build/web
WEB_ROOT      ?= /opt/45drives/45flow-web
HB_DIR        ?= ../houston-broadcaster
HB_APPDIR     ?= /opt/45drives/houston-broadcaster

RSYNC_FLAGS ?= -a --delete --compress

.PHONY: install-remote web-build web-package web-deploy web-nginx web-verify web-gate broadcaster-remote

install-remote: web-deploy web-nginx web-verify

# Same renderer as the desktop app, built on its own with a version.json (served at /app/version.json).
web-build:
	node scripts/web/build.mjs

web-package:
	node scripts/web/package.mjs

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

# The browser signs in through /api/session, which older Broadcaster builds do not have.
broadcaster-remote:
	$(MAKE) -C $(HB_DIR) install-remote REMOTE_HOST=$(REMOTE_HOST) REMOTE_USER=$(REMOTE_USER) HTTPS_PORT=$(HTTPS_PORT)

# /app is a Pro feature (A-04). On an unlicensed lab server, GATE=off lets it be served for testing.
GATE ?= off
web-gate:
	ssh $(REMOTE) 'f=/etc/default/houston-broadcaster; [ -d /etc/sysconfig ] && f=/etc/sysconfig/houston-broadcaster; \
	  touch $$f && sed -i "/^WEB_APP_LICENSE_GATE=/d" $$f && echo "WEB_APP_LICENSE_GATE=$(GATE)" >> $$f && \
	  systemctl restart houston-broadcaster && echo "WEB_APP_LICENSE_GATE=$(GATE) in $$f; broadcaster restarted"'

web-verify:
	curl -ksI https://$(REMOTE_HOST):$(HTTPS_PORT)/app  | head -n 1
	curl -ksI https://$(REMOTE_HOST):$(HTTPS_PORT)/app/ | head -n 1
	@if [ "$$(curl -ks -o /dev/null -w '%{http_code}' https://$(REMOTE_HOST):$(HTTPS_PORT)/app/)" = "402" ]; then \
	  echo "NOTE: /app/ shows the Pro upgrade page because this server is unlicensed. For testing: make web-gate GATE=off REMOTE_HOST=$(REMOTE_HOST)"; fi
	@printf 'deployed: '; curl -ks https://$(REMOTE_HOST):$(HTTPS_PORT)/app/version.json | tr -d '\n ' || true; echo
	@printf 'local:    '; tr -d '\n ' < $(WEB_BUILD_DIR)/version.json 2>/dev/null || printf '(not built)'; echo
	@code=$$(curl -ks -o /dev/null -w '%{http_code}' https://$(REMOTE_HOST):$(HTTPS_PORT)/api/session); \
	if [ "$$code" = "404" ]; then \
	  echo "WARNING: /api/session not found - sign-in will fail. Run: make broadcaster-remote REMOTE_HOST=$(REMOTE_HOST)"; \
	else echo "/api/session: HTTP $$code (401 expected when signed out)"; fi
