"""
Fetches a model from Meshy (meshy.ai) into the repository, so its API key stays a repository secret (MESHY_API_KEY)
and never reaches a dev machine or agent. Run by .github/workflows/meshy.yml: write into scripts/meshy/request.txt
"latest" (the newest finished model of any kind that has its textures) or a task id, then a folder under unity/ModelSources to put it in,
and push. The model (GLB, and FBX if there is one), its textures and what Meshy says of it are committed back.

    MESHY_API_KEY=... python3 scripts/meshy/fetch.py latest captain-ship
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = 'https://api.meshy.ai/openapi'
# Every kind of task that makes a model, newest first.
KINDS = ['v2/text-to-3d', 'v1/text-to-3d', 'v1/image-to-3d', 'v2/image-to-3d', 'v1/multi-image-to-3d', 'v1/retexture', 'v1/remesh',
         'v1/text-to-texture', 'v1/texture', 'v1/texturing', 'v1/rigging']
# (GitHub refuses a file over 100 MB.)
LIMIT = 95 * 1024 * 1024


def get(url, raw=False):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {os.environ["MESHY_API_KEY"]}'} if url.startswith(API) else {})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read() if raw else json.loads(r.read())


def tasks():
    found = []
    for kind in KINDS:
        try:
            got = get(f'{API}/{kind}?page_size=50&sort_by=-created_at')
        except urllib.error.HTTPError as e:
            print(f'{kind}: {e.code}')
            continue
        items = got if isinstance(got, list) else got.get('result', got.get('data', []))
        print(f'{kind}: {len(items)} tasks')
        for t in items:
            t['_kind'] = kind
            found.append(t)
    return found


def main():
    want, folder = (sys.argv[1:] + ['latest', 'captain-ship'])[:2]
    every = tasks()
    def textured(t): return bool(t.get('texture_urls')) or bool((t.get('model_urls') or {}).get('glb') and t.get('should_texture'))
    for t in sorted(every, key=lambda t: -(t.get('created_at') or 0))[:20]:
        print(f"  {t.get('id')} {t['_kind']} {t.get('status')} created {t.get('created_at')} {'textured' if textured(t) else 'untextured'} "
              f"{t.get('name') or t.get('prompt') or ''} [{', '.join(sorted(k for k, v in t.items() if v and k.endswith('urls')))}]"[:220])
    # (The newest that has its textures: a bare model, made to be textured, is not what is wanted.)
    done = [t for t in every if t.get('status') == 'SUCCEEDED' and t.get('model_urls') and textured(t)]
    pick = max(done, key=lambda t: t.get('created_at') or 0) if want == 'latest' else next((t for t in every if t.get('id') == want), None)
    if pick is None and want != 'latest':
        # (A task made in Meshy's own site, not listed: asked for by its id, of each kind in turn.)
        for kind in KINDS:
            try:
                pick = get(f'{API}/{kind}/{want}')
                pick['_kind'] = kind
                print(f'{want}: found as {kind}')
                break
            except urllib.error.HTTPError as e:
                print(f'{want} as {kind}: {e.code}')
    if pick is None: sys.exit(f'no finished task {want}')
    print(f"fetching {pick['id']} ({pick['_kind']})")
    out = os.path.join('unity', 'ModelSources', folder, f"meshy-{pick['id']}")
    os.makedirs(out, exist_ok=True)
    files = {f'model.{k}': u for k, u in (pick.get('model_urls') or {}).items() if u and k in ('glb', 'fbx')}
    for i, tex in enumerate(pick.get('texture_urls') or []):
        for k, u in tex.items():
            if u: files[f'texture{i or ""}-{k}.png'] = u
    # (What Meshy says of it, without its signed links, and which files it offers.)
    print('task:', json.dumps({k: (v if 'url' not in k else sorted(v) if isinstance(v, dict) else '…') for k, v in pick.items()})[:1500])
    for name, url in files.items():
        try:
            data = get(url, raw=True)
        except urllib.error.HTTPError as e:
            print(f'  {name}: {e.code}, left out')
            continue
        if len(data) > LIMIT:
            print(f'  {name}: {len(data) >> 20} MB, too big for git, left out')
            continue
        with open(os.path.join(out, name), 'wb') as f: f.write(data)
        print(f'  {name}: {len(data) >> 10} KB')
    # (Not its links: signed, and soon stale.)
    meta = {k: v for k, v in pick.items() if 'url' not in k}
    with open(os.path.join(out, 'meshy.json'), 'w') as f: json.dump(meta, f, indent=2)


if __name__ == '__main__':
    main()
