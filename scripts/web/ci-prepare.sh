#!/bin/sh
# Verify the pinned release source and sync manifest.json and the debian changelogs
# to the app version.
# POSIX tools only: the package runner has git but no node.
#   ci-prepare.sh <expected_sha> <expected_version>
set -eu

expected_sha="${1:?expected source sha}"
expected_version="${2:?expected app version}"

[ "$(git rev-parse HEAD)" = "$expected_sha" ] || { echo "Checked-out commit is not $expected_sha" >&2; exit 1; }

version="$(sed -n -E '0,/"version"[[:space:]]*:/s/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' package.json)"
[ "$version" = "$expected_version" ] || { echo "Desktop/web version mismatch: package.json=$version expected=$expected_version" >&2; exit 1; }
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' || { echo "Unsupported version $version" >&2; exit 1; }

# A pre-release must sort before its release in deb and rpm: 1.0.9-beta.1 -> 1.0.9~beta.1
pkg_version="$(printf '%s' "$version" | tr '-' '~')"
sed -i -E "s/^([[:space:]]*\"version\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"$pkg_version\"/" manifest.json
[ "$(grep -c "\"version\": \"$pkg_version\"" manifest.json)" -eq 2 ] || { echo "manifest.json version sync failed" >&2; exit 1; }

# The repo publisher expects 45flow-web_<version>-<build><codename>_all.deb.
build_number="$(sed -n -E '0,/"build_number"[[:space:]]*:/s/^[[:space:]]*"build_number"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' manifest.json)"
printf '%s' "$build_number" | grep -Eq '^[0-9]+$' || { echo "Unsupported build_number $build_number" >&2; exit 1; }
sed -i -E "s/^([[:space:]]*\"build_number\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"$build_number\"/" manifest.json
[ "$(grep -c "\"build_number\": \"$build_number\"" manifest.json)" -eq 2 ] || { echo "manifest.json build number sync failed" >&2; exit 1; }
changelog_date="$(LC_ALL=C date -R)"
for dir in packaging/ubuntu-* packaging/debian-*; do
  codename="${dir##*-}"
  changelog="$dir/changelog"
  [ -f "$changelog" ] || { echo "Missing changelog: $changelog" >&2; exit 1; }
  header="45flow-web ($pkg_version-$build_number$codename) $codename; urgency=medium"
  [ "$(head -n 1 "$changelog")" != "$header" ] || continue
  tmp="$(mktemp "$dir/.changelog.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  {
    cat <<EOF
$header

  * 45Flow browser UI $version.

 -- 45Drives <info@45drives.com>  $changelog_date

EOF
    cat "$changelog"
  } > "$tmp"
  chmod 644 "$tmp"
  mv "$tmp" "$changelog"
  trap - EXIT HUP INT TERM
done
echo "45flow-web $pkg_version-$build_number from $expected_sha"
