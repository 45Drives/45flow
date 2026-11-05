#!/bin/sh
set -eu
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
corepack enable
corepack prepare yarn@4.6.0 --activate
yarn install --immutable
yarn build:common
yarn build:web
