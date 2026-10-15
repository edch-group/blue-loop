#!/usr/bin/env bash
# Each line of scripts/meshy/request.txt, run by .github/workflows/meshy.yml:
#   <task id|latest|rigged> <name> [nobake] fetch a model from Meshy, keep its files as a GitHub release
#                                         (model-<name>-<task>), and bake it (scripts/bake-<name>.py) unless "nobake"
#   rig <task id> <name> [nobake]         rig a model made in Meshy (scripts/meshy/rig.py), then as above with the rigging
#   rebake <name>                         bake again from the newest model kept for <name>, its files from its release
# The originals never go into git (Meshy's are hundreds of MB): only what is baked from them (unity/Assets/Resources/Models)
# and what Meshy says of each (unity/ModelSources/<name>/meshy-<task>/meshy.json).
set -uo pipefail
into="${RUNNER_TEMP:-/tmp}/meshy"
while read -r first name flag more; do
  [ "$first" = rig ] && flag="$flag $more"
  [ -z "${first:-}" ] && continue
  echo "== $first $name $flag"
  if [ "$first" = rig ]; then
    set -- $name $flag; first=$(python3 scripts/meshy/rig.py "$1" "$(gh release view "model-$2-${1:0:8}" --json assets -q '.assets[] | select(.name == "model.glb") | .url' 2>/dev/null)") || { echo "rigging failed"; continue; }; name=$2; flag=${3:-}
  fi
  if [ "$first" = rebake ]; then
    # (The newest Meshy made: a checkout's files are all as old as each other.)
    meta=$(python3 -c "import glob,json,os,sys; print(os.path.dirname(max(glob.glob(f'unity/ModelSources/{sys.argv[1]}/meshy-*/meshy.json'), key=lambda p: json.load(open(p)).get('created_at', 0))))" "$name")
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
