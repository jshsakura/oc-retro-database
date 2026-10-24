"""Import kkulleong list gamelists: Korean names and descriptions, permission-based.

Source packs are dated zips from Mupung Cafe (author: kkulleong, direct
permission obtained 2026-10-23). Media payloads are never extracted; only the
gamelist XML name/desc/path observations are imported.
Usage: import-kkul.py --source <_data dir> --input identities.jsonl --output out.jsonl
"""
import argparse, hashlib, json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

SOURCE = 'kkulleong-list'
SYSTEMS = {'nds':'nds','neogeo':'arcade','sfc':'snes','ps1':'ps1','famicom':'nes','psp':'psp',
'gba':'gba','gg':'gg','ngp':'ngp','ngpc':'ngp','ws':'ws','wsc':'ws','gb':'gb','megadrive':'md',
'mastersystem':'sms','gbc':'gbc','arcade patched':'arcade','arcade':'arcade','pcengine':'pce','msx':'msx','ss':'saturn',
'n64':'n64','dreamcast':'dreamcast','gnw':'gw','sega32x':'32x','atari2600':'a2600','segacd':'segacd','3do':'3do'}
META = re.compile(r'\s*\((?:Japan|USA|Europe|World|Korea|Asia|Australia|En|Ja|Ko|Rev\s+[\w.]+|Unl|Beta[^)]*|일본판|북미판|유럽판|한국판|정발판)(?:\s*,\s*[^)]*)*\)\s*$', re.I)
HANGUL = re.compile('[가-힣]')

def bare(v):
    s = v.strip()
    while META.search(s):
        s = META.sub('', s).strip()
    return s

def norm(v):
    return re.sub(r'[^a-z0-9가-힣]+', '', (v or '').lower())

def system_of(relpath):
    """Deepest path component wins: multipacks carry the system in subfolders."""
    for part in reversed(Path(relpath).parts):
        for token in re.split(r'[-,\s]+', part):
            t = token.strip().lower()
            if t in SYSTEMS:
                return SYSTEMS[t]
    return None

def run(args):
    src = Path(args.source)
    rows = {}
    for line in Path(args.input).read_text(encoding='utf-8').splitlines():
        if line.strip():
            r = json.loads(line)
            rows[r['id']] = r
    by_alias, by_title = {}, {}
    for rid, r in rows.items():
        sysname = r['system']
        for a in r.get('aliases', []):
            n = a if isinstance(a, str) else a.get('name')
            if n:
                by_alias.setdefault((sysname, norm(n)), set()).add(rid)
        for t in (r.get('titles') or {}).values():
            if t:
                by_alias.setdefault((sysname, norm(t)), set()).add(rid)
        if sysname != 'arcade':
            by_title.setdefault((sysname, r['titles'].get('ko'), r['titles'].get('en')), set()).add(rid)

    def pick(key):
        cands = by_alias.get(key, set())
        if not cands:
            return None
        if len(cands) == 1:
            return next(iter(cands))
        return min(cands)

    counts = {'sourceRows': 0, 'merged': 0, 'newIdentities': 0, 'descriptions': 0, 'skippedSystem': 0, 'baseIdentities': len(rows)}
    for gl in sorted(src.glob('**/gamelist*.xml')):
        sysname = system_of(gl.relative_to(src))
        if not sysname:
            counts['skippedSystem'] += 1
            continue
        zipdir = gl.relative_to(src).parts[0]
        for g in ET.parse(gl).getroot().findall('game'):
            observed = (g.findtext('name') or '').strip()
            filename = (g.findtext('path') or '').replace('\\', '/').rsplit('/', 1)[-1]
            desc = (g.findtext('desc') or '').strip()
            leaf = Path(filename).stem
            if not observed or not leaf:
                continue
            counts['sourceRows'] += 1
            ko = bare(observed) if HANGUL.search(observed) else None
            en = bare(leaf) if sysname != 'arcade' else None
            rid = pick((sysname, norm(leaf)))
            if rid is None and sysname != 'arcade':
                cands = by_title.get((sysname, ko, en), set())
                if len(cands) == 1:
                    rid = next(iter(cands))
                elif cands:
                    rid = min(cands)
            if rid is None and ko:
                rid = pick((sysname, norm(ko)))
            if rid is None:
                if sysname == 'arcade':
                    rid = SOURCE + ':set:' + leaf
                    by_alias.setdefault((sysname, norm(leaf)), set()).add(rid)
                else:
                    rid = hashlib.sha256(json.dumps([sysname, ko, en], ensure_ascii=False).encode()).hexdigest()
                    by_title.setdefault((sysname, ko, en), set()).add(rid)
                    if ko:
                        by_alias.setdefault((sysname, norm(ko)), set()).add(rid)
            if rid in rows:
                row = rows[rid]
                counts['merged'] += 1
            else:
                row = {'id': rid, 'system': sysname, 'kind': 'unknown', 'titles': {'ko': ko, 'en': en, 'ja': None},
                       'originalTitle': None, 'romanizations': [], 'baseGameId': None, 'aliases': [], 'sources': [],
                       'fingerprints': [], 'links': [], 'releases': []}
                if sysname == 'arcade':
                    row['arcadeNamespace'] = SOURCE
                rows[rid] = row
                counts['newIdentities'] += 1
            aliases = {(a['name'], a.get('kind'), a.get('source')): a for a in row['aliases']}
            for alias in [{'name': leaf, 'kind': 'original-filename-stem', 'language': None, 'source': SOURCE},
                          {'name': observed, 'kind': 'display-label', 'language': 'ko' if ko else None, 'source': SOURCE}]:
                aliases[(alias['name'], alias['kind'], alias['source'])] = alias
            row['aliases'] = [v for k, v in sorted(aliases.items())]
            row['sources'] = sorted(set(row['sources'] + [SOURCE]))
            if desc and not row.get('descriptions'):
                row['descriptions'] = [{'text': desc, 'language': 'ko', 'source': SOURCE}]
                counts['descriptions'] += 1
            row.setdefault('titleEvidence', {})[SOURCE] = {'role': 'display-title', 'file': gl.relative_to(src).as_posix()}
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('x', encoding='utf-8') as f:
        for rid, row in sorted(rows.items()):
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(counts, ensure_ascii=False))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ['source', 'input', 'output']:
        p.add_argument('--' + arg, required=True)
    run(p.parse_args())
