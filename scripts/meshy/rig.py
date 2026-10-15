"""
Rigs a model already made in Meshy (Meshy's own rigging, as its site does it, but through its API so its files can be
fetched: a rig made on the site is not offered by the API), waits for it, and prints the rigging's task id for
scripts/meshy/fetch.py. Run by scripts/meshy/run.sh for a line "rig <task id> <name>".

    MESHY_API_KEY=... python3 scripts/meshy/rig.py <task id>
"""
import json
import os
import sys
import time
import urllib.request

API = 'https://api.meshy.ai/openapi/v1/rigging'


def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method='POST' if body else 'GET',
                                 headers={'Authorization': f'Bearer {os.environ["MESHY_API_KEY"]}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def main():
    task = call(API, {'input_task_id': sys.argv[1], 'height_meters': 1.8})['result']
    print(f'rigging {sys.argv[1]}: {task}', file=sys.stderr)
    for _ in range(120):
        got = call(f'{API}/{task}')
        print(f"  {got.get('status')} {got.get('progress')}%", file=sys.stderr)
        if got.get('status') == 'SUCCEEDED': break
        if got.get('status') in ('FAILED', 'CANCELED'): sys.exit(f"rigging failed: {got.get('task_error')}")
        time.sleep(15)
    else:
        sys.exit('rigging still not done')
    print(task)


if __name__ == '__main__':
    main()
