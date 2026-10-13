#!/usr/bin/env bash
# Haalt de site-zip van een release op en controleert dat die echt uit onze release-workflow komt.
# Draait met code van main (vertrouwd), nooit met code van de te controleren tag.
#
#   scripts/verify-release.sh <tag>      → ./site/ (uitgepakt), faalt bij elke twijfel
#
# Controles:
#   1. tag-formaat;
#   2. de tag-commit is een voorouder van main (geen release van een zijtak);
#   3. release en site-asset zijn door github-actions[bot] gemaakt (een gelekte PAT kan dat niet nabootsen);
#   4. build-attestatie van release.yml voor precies deze tag (tenzij ATTESTATION=off: privé-repo zonder Enterprise).
set -euo pipefail
tag="${1:?tag ontbreekt}"
repo="${GITHUB_REPOSITORY:?}"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || { echo "::error::Ongeldige tag: $tag"; exit 1; }

status=$(gh api "repos/$repo/compare/$tag...main" --jq .status)
[[ "$status" == "ahead" || "$status" == "identical" ]] || { echo "::error::Tag $tag staat niet op main ($status)"; exit 1; }

author=$(gh api "repos/$repo/releases/tags/$tag" --jq .author.login)
uploader=$(gh api "repos/$repo/releases/tags/$tag" --jq '[.assets[] | select(.name | startswith("site-")) | .uploader.login] | unique | join(",")')
[[ "$author" == "github-actions[bot]" && "$uploader" == "github-actions[bot]" ]] || {
  echo "::error::Release of site-asset niet door de release-workflow gemaakt (auteur=$author, uploader=$uploader)"; exit 1; }

rm -rf site site.zip
gh release download "$tag" --repo "$repo" --pattern "site-*.zip" --output site.zip
if [[ "${ATTESTATION:-on}" != "off" ]]; then
  gh attestation verify site.zip --repo "$repo" \
    --signer-workflow "$repo/.github/workflows/release.yml" --source-ref "refs/tags/$tag"
else
  echo "::warning::Attestatie uitgeschakeld (ATTESTATION=off). Alleen herkomstcontrole via tag en uploader."
fi
mkdir site && (cd site && unzip -q ../site.zip)
echo "Release $tag gecontroleerd."
