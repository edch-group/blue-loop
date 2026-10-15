#!/usr/bin/env bash
# Each line of scripts/meshy/request.txt, run by .github/workflows/meshy.yml:
#   <task id or latest> <name> [nobake]   fetch a model from Meshy, keep its files as a GitHub release
#                                         (model-<name>-<task>), and bake it (scripts/bake-<name>.py) unless "nobake"
#   rebake <name>                         bake again from the newest model kept for <name>, its files from its release
# The originals never go into git (Meshy's are hundreds of MB): only what is baked from them (unity/Assets/Resources/Models)
# and what Meshy says of each (unity/ModelSources/<name>/meshy-<task>/meshy.json).
set -uo pipefail
into="${RUNNER_TEMP:-/tmp}/meshy"
while read -r first name flag; do
  [ -z "${first:-}" ] && continue
  echo "== $first $name $flag"
  if [ "$first" = rebake ]; then
    meta=$(ls -td unity/ModelSources/"$name"/meshy-*/ | head -1)
    release=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['_release'])" "$meta/meshy.json")
    folder="$into/$(basename "$meta")"
    mkdir -p "$folder"
    gh release download "$release" --dir "$folder" --clobber || { echo "no release $release"; continue; }
  else
    out=$(python3 scripts/meshy/fetch.py "$first" "$name" "$into" | tee /dev/stderr) || { echo "fetch failed"; continue; }
    folder=$(echo "$out" | sed -n 's/^FOLDER=//p'); release=$(echo "$out" | sed -n 's/^RELEASE=//p')
    [ -z "$folder" ] && continue
    # (Kept as a release, outside the repository: prerelease, never the "latest" release.)
    if gh release view "$release" >/dev/null 2>&1; then
      gh release upload "$release" "$folder"/* --clobber
    else
      gh release create "$release" "$folder"/* --title "$name model ($release)" --notes "Meshy's original for $name: scripts/meshy/run.sh keeps it, scripts/bake-$name.py bakes it." --prerelease --latest=false
    fi
  fi
  if [ "${flag:-}" != nobake ] && [ -f "scripts/bake-$name.py" ]; then
    python3 "scripts/bake-$name.py" "$folder" 2>&1 | grep -v -i "plugin\|cannot load"
  fi
done < scripts/meshy/request.txt
