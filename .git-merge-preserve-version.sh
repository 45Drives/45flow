#!/bin/bash
# Custom merge driver to preserve version in package.json
# Usage: called automatically by Git during merge

# Arguments from Git:
# %O = ancestor's version, %A = current version, %B = other version
ANCESTOR=$1
CURRENT=$2
OTHER=$3

# Extract our version before merge
OUR_VERSION=$(grep -Po '"version":\s*"\K[^"]+' "$CURRENT")

# Perform normal merge
git merge-file "$CURRENT" "$ANCESTOR" "$OTHER" || true

# Restore our version
sed -i "s/\"version\":[[:space:]]*\"[^\"]*\"/\"version\": \"$OUR_VERSION\"/" "$CURRENT"

exit 0
