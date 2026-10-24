"""Merge duplicate identities within one system (non-arcade).

One game may carry many roms and hashes; identities are merged when they
share a normalized alias, or when both normalized ko and en titles match.
Arcade rows are excluded: set namespaces stay separate by design.
Survivor selection is deterministic (most sources, then smallest id).
Usage: dedup.py --input identities.jsonl --output out.jsonl
"""
import argparse, json, re
from pathlib import Path

norm = lambda s: re.sub(r'[^a-z0-9가-힣]+', '', (s or '').lower())

def edges(rows):
    by_alias = {}
    by_title = {}
    by_en = {}
    for i, r in enumerate(rows):
        s = r['system']
        for a in r.get('aliases', []):
            n = a if isinstance(a, str) else a.get('name')
            if n:
                by_alias.setdefault((s, norm(n)), []).append(i)
        ko = (r.get('titles') or {}).get('ko')
        en = (r.get('titles') or {}).get('en')
        if ko and en:
            by_title.setdefault((s, norm(ko), norm(en)), []).append(i)
        if en and len(norm(en)) >= 10:
            by_en.setdefault((s, norm(en)), []).append(i)
    out = set()
    for group in list(by_alias.values()) + list(by_title.values()) + list(by_en.values()):
        for a, b in zip(group, group[1:]):
            out.add((a, b))
    return out

def find(rows, es):
    parent = list(range(len(rows)))
    def find_(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b in es:
        ra, rb = find_(a), find_(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    groups = {}
    for i in range(len(rows)):
        groups.setdefault(find_(i), []).append(i)
    return list(groups.values())

def merge(rows, group):
    def score(i):
        r = rows[i]
        return (-len(r.get('sources', [])) - len(r.get('fingerprints', [])) * 2 - len(r.get('links', [])), r['id'])
    group = sorted(group, key=score)
    keep = rows[group[0]]
    for i in group[1:]:
        d = rows[i]
        aliases = {(a['name'], a.get('kind'), a.get('source')): a for a in keep['aliases']}
        for a in d['aliases']:
            aliases[(a['name'], a.get('kind'), a.get('source'))] = a
        keep['aliases'] = [v for k, v in sorted(aliases.items())]
        keep['sources'] = sorted(set(keep['sources'] + d['sources']))
        keep['fingerprints'] = keep.get('fingerprints', []) + d.get('fingerprints', [])
        keep['links'] = keep.get('links', []) + d.get('links', [])
        keep['releases'] = keep.get('releases', []) + d.get('releases', [])
        for k, v in (d.get('titleEvidence') or {}).items():
            keep.setdefault('titleEvidence', {}).setdefault(k, v)
        for k, v in d.get('descriptions') and zip([f"desc:{x.get('source')}" for x in d['descriptions']], d['descriptions']) or []:
            have = {x.get('source') for x in keep.get('descriptions', [])}
            if v.get('source') not in have:
                keep.setdefault('descriptions', []).append(v)
        for field in ('ko', 'en', 'ja'):
            if not keep['titles'].get(field) and d['titles'].get(field):
                keep['titles'][field] = d['titles'][field]
        if keep.get('kind') in (None, 'unknown') and d.get('kind') not in (None, 'unknown'):
            keep['kind'] = d.get('kind')
        if not keep.get('baseGameId') and d.get('baseGameId'):
            keep['baseGameId'] = d['baseGameId']
    keep['fingerprints'] = sorted({json.dumps(f, ensure_ascii=False, sort_keys=True) for f in keep['fingerprints']}) and [json.loads(x) for x in sorted({json.dumps(f, ensure_ascii=False, sort_keys=True) for f in keep['fingerprints']})]
    keep['links'] = [json.loads(x) for x in sorted({json.dumps(f, ensure_ascii=False, sort_keys=True) for f in keep['links']})]
    return keep

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--remap', default=None, help='write donor-id -> survivor-id json')
    a = ap.parse_args()
    rows = [json.loads(l) for l in Path(a.input).read_text(encoding='utf-8').splitlines() if l.strip()]
    plain = [i for i, r in enumerate(rows) if r['system'] != 'arcade']
    es = edges([rows[i] for i in plain])
    groups = find([rows[i] for i in plain], es)
    new_rows = [r for r in rows if r['system'] == 'arcade']
    merged_count = 0
    remap = {}
    for g in groups:
        gr = [rows[plain[i]] for i in g]
        if len(gr) > 1:
            merged_count += len(gr) - 1
            def score(i):
                r = gr[i]
                return (-len(r.get('sources', [])) - len(r.get('fingerprints', [])) * 2 - len(r.get('links', [])), r['id'])
            survivor = gr[sorted(range(len(gr)), key=score)[0]]
            for d in gr:
                if d['id'] != survivor['id']:
                    remap[d['id']] = survivor['id']
        new_rows.append(merge(gr, list(range(len(gr)))))
    out = Path(a.output)
    with out.open('x', encoding='utf-8') as f:
        for r in sorted(new_rows, key=lambda x: x['id']):
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    if a.remap:
        Path(a.remap).write_text(json.dumps(remap, ensure_ascii=False))
    print(json.dumps({'before': len(rows), 'after': len(new_rows), 'merged_away': merged_count}))

if __name__ == '__main__':
    main()
