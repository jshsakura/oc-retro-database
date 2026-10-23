"""Import Korean description observations from the Tentacle XML lists.

Arcade-family folders carry identical description content, so one canonical
copy per set name is imported. Descriptions attach to the identity that the
name importer created, matched by filename stem within the arcade system.
Usage: import-tentacle-desc.py --source <tentacle clone> --input identities.jsonl --output out.jsonl
"""
import argparse, json
from pathlib import Path
import xml.etree.ElementTree as ET

SOURCE = 'tentacle-romlistkr'
FOLDERS = ['arcade', 'neogeo']  # fba and mame-* are byte-identical to arcade here

def run(args):
    src = Path(args.source)
    rows = {}
    for line in Path(args.input).read_text(encoding='utf-8').splitlines():
        if line.strip():
            r = json.loads(line)
            rows[r['id']] = r
    by_stem = {}
    for rid, r in rows.items():
        if r['system'] != 'arcade':
            continue
        for a in r.get('aliases', []):
            if isinstance(a, dict) and a.get('kind') == 'original-filename-stem' and a.get('source') == SOURCE:
                by_stem.setdefault(a['name'], rid)
    attached = skipped = 0
    for folder in FOLDERS:
        path = src / 'ES-gamelist' / folder / 'gamelist.xml'
        if not path.exists():
            continue
        for g in ET.parse(path).getroot().findall('game'):
            desc = (g.findtext('desc') or '').strip()
            if not desc:
                continue
            leaf = Path((g.findtext('path') or '').rsplit('/', 1)[-1]).stem
            rid = by_stem.get(leaf)
            if not rid:
                skipped += 1
                continue
            row = rows[rid]
            if row.get('descriptions'):
                skipped += 1
                continue
            row['descriptions'] = [{'text': desc, 'language': 'ko', 'source': SOURCE}]
            attached += 1
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x', encoding='utf-8') as f:
        for rid, row in sorted(rows.items()):
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'attached': attached, 'skipped': skipped, 'identities': len(rows)}))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ['source', 'input', 'output']:
        p.add_argument('--' + arg, required=True)
    run(p.parse_args())
