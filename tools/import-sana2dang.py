"""Import 2017 title/path observations only. Never run upstream installers or read ROMs.

The arcade, fba, neogeo and mame-* folders in this source carry byte-identical
gamelist content (verified before import); only one canonical copy is imported and
the duplicate folders are recorded in the manifest scope instead.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

SOURCE = 'sana2dang-es-koreanlanguage-list'
SYSTEMS = {'arcade':'arcade','sega32x':'32x','mastersystem':'sms','megadrive':'md',
 'pcengine':'pce','gba':'gba','nes':'nes','snes':'snes'}
ARCADE_FOLDERS = ['arcade','fba','mame-advmame','mame-libretro','mame-mame4all','neogeo']
META = re.compile(r'\s*\((?:Japan|USA|Europe|World|Korea|Asia|Australia|En|Ja|Ko|Fr|De|Es|It|Pt|Zh|Nl|Sv|No|Da|Fi|일본판|북미판|유럽판|한국판|정발판)(?:\s*,\s*(?:USA|Europe|En|Ja|Ko|Fr|De|Es|It|Pt|Zh|Nl|Sv|No|Da|Fi))*\)\s*$|\s*\((?:Rev\s+[\w.]+|Unl|Beta(?:\s+\w+)?)\)\s*$',re.I)
HANGUL = re.compile('[가-힣]')

def bare(value):
    s=value.strip()
    while META.search(s): s=META.sub('',s).strip()
    return s

def norm(value):
    return re.sub(r'[^a-z0-9가-힣]+','',value.lower())

def run(args):
    source=Path(args.source)
    rows={}
    for line in Path(args.input).read_text(encoding='utf-8').splitlines():
        if line.strip(): rows[json.loads(line)['id']]=json.loads(line)
    by_alias={}
    by_title={}
    for rid,r in rows.items():
        sys=r['system']
        for a in r.get('aliases',[]):
            name=a if isinstance(a,str) else a.get('name')
            if not name: continue
            by_alias.setdefault((sys,norm(name)),set()).add(rid)
        for t in r['titles'].values():
            if t: by_alias.setdefault((sys,norm(t)),set()).add(rid)
        if sys!='arcade':
            by_title.setdefault((sys,r['titles'].get('ko'),r['titles'].get('en')),set()).add(rid)
    def pick(key):
        # Ambiguous names resolve deterministically; the Tentacle lineage is the
        # canonical target for this Tentacle-derived 2017 snapshot.
        cands=by_alias.get(key,set())
        if not cands: return None
        if len(cands)==1: return next(iter(cands))
        counts['ambiguousResolved']+=1
        tent=[c for c in cands if rows.get(c,{}).get('arcadeNamespace')=='tentacle-romlistkr']
        return tent[0] if len(tent)==1 else min(cands)
    counts={'sourceRows':0,'merged':0,'newIdentities':0,'ambiguousResolved':0,'baseIdentities':len(rows)}
    seen=set()
    imported_folders=sorted(set(SYSTEMS)-set(ARCADE_FOLDERS[1:]))
    for folder in imported_folders:
        sys=SYSTEMS[folder]
        path=source/'ES_fullRomList'/folder/'gamelist.xml'
        if not path.exists(): continue
        for g in ET.parse(path).getroot().findall('game'):
            observed=(g.findtext('name') or '').strip()
            filename=(g.findtext('path') or '').replace('\\','/').rsplit('/',1)[-1]
            leaf=Path(filename).stem
            if not observed or not leaf: continue
            dedupe=(sys,leaf,observed)
            if dedupe in seen: continue
            seen.add(dedupe)
            counts['sourceRows']+=1
            ko=bare(observed) if HANGUL.search(observed) else None
            en=bare(leaf) if sys!='arcade' else None
            rid=pick((sys,norm(leaf)))
            if rid is None and sys!='arcade':
                cands=by_title.get((sys,ko,en),set())
                if len(cands)==1: rid=next(iter(cands))
                elif cands: rid=min(cands)
            if rid is None and ko:
                rid=pick((sys,norm(ko)))
            if rid is None and sys=='arcade':
                # Unknown set names keep their own namespace; never merge into playable sets.
                rid=SOURCE+':set:'+leaf
                by_alias.setdefault((sys,norm(leaf)),set()).add(rid)
            elif rid is None:
                rid=hashlib.sha256(json.dumps([sys,ko,en],ensure_ascii=False).encode()).hexdigest()
                by_title.setdefault((sys,ko,en),set()).add(rid)
                if ko: by_alias.setdefault((sys,norm(ko)),set()).add(rid)
            if rid in rows:
                row=rows[rid]
                counts['merged']+=1
            else:
                row={'id':rid,'system':sys,'kind':'unknown','titles':{'ko':ko,'en':en,'ja':None},
                    'originalTitle':None,'romanizations':[],'baseGameId':None,'aliases':[],'sources':[],
                    'fingerprints':[],'links':[],'releases':[]}
                if sys=='arcade': row['arcadeNamespace']=SOURCE
                rows[rid]=row
                counts['newIdentities']+=1
            aliases={(a['name'],a.get('kind'),a.get('source')):a for a in row['aliases']}
            for alias in [{'name':leaf,'kind':'original-filename-stem','language':None,'source':SOURCE},
                          {'name':observed,'kind':'display-label','language':'ko' if ko else None,'source':SOURCE}]:
                aliases[(alias['name'],alias['kind'],alias['source'])]=alias
            row['aliases']=[v for k,v in sorted(aliases.items())]
            row['sources']=sorted(set(row['sources']+[SOURCE]))
            # A 2017 display label is an alternate observation, never proof of language support.
            row.setdefault('titleEvidence',{})[SOURCE]={'role':'display-title','file':path.relative_to(source).as_posix()}
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf-8') as f:
        for rid,row in sorted(rows.items()): f.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(counts))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['source','input','output']:p.add_argument('--'+arg,required=True)
    run(p.parse_args())
