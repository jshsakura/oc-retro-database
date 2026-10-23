"""Import title/path observations only. Never run upstream installers or read ROMs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

SYSTEMS = {'fba':'arcade','mame-libretro':'arcade','mame-advmame':'arcade','arcade':'arcade','neogeo':'arcade',
 'atomiswave':'arcade','sega32x':'32x','mastersystem':'sms','wonderswan':'ws','wonderswancolor':'ws',
 'ngpc':'ngp','megadrive':'md','pcengine':'pce','gba':'gba','gbc':'gbc','gb':'gb','nes':'nes','snes':'snes','ngp':'ngp','msx':'msx'}
META = re.compile(r'\s*\((?:Japan|USA|Europe|World|Korea|Asia|Australia|En|Ja|Ko|Fr|De|Es|It|Pt|Zh|Nl|Sv|No|Da|Fi|일본판|북미판|유럽판|한국판|정발판)(?:\s*,\s*(?:USA|Europe|En|Ja|Ko|Fr|De|Es|It|Pt|Zh|Nl|Sv|No|Da|Fi))*\)\s*$|\s*\((?:Rev\s+[\w.]+|Unl|Beta(?:\s+\w+)?)\)\s*$',re.I)

def bare(value):
    s=value.strip()
    while META.search(s): s=META.sub('',s).strip()
    return s

def run(args):
    source=Path(args.source)
    existing=json.loads(Path(args.base).read_text())['records']
    for r in existing:
        r['aliases']=[{'name':a,'language':None,'kind':'legacy-alias','source':'legacy-corpus'} if isinstance(a,str) else a for a in r['aliases']]
    rows={r['id']:r for r in existing}
    by_name={(r['system'],r['titles'].get('ko'),r['titles'].get('en')):r['id'] for r in existing if r['system']!='arcade'}
    imported=0
    for p in sorted((source/'ES-gamelist').glob('*/gamelist.xml')):
        sys=SYSTEMS.get(p.parent.name)
        if not sys: continue
        for g in ET.parse(p).getroot().findall('game'):
            observed=(g.findtext('name') or '').strip()
            filename=(g.findtext('path') or '').replace('\\','/').rsplit('/',1)[-1]
            leaf=Path(filename).stem
            if not observed or not leaf:continue
            ko=bare(observed) if re.search('[가-힣]',observed) else None
            en=bare(leaf) if sys!='arcade' else None
            identity=(sys,ko,en)
            if sys=='arcade':
                rid='tentacle:set:'+leaf
            else:
                rid=by_name.get(identity) or hashlib.sha256(json.dumps(identity,ensure_ascii=False).encode()).hexdigest()
                by_name[identity]=rid
            if rid not in rows:
                rows[rid]={'id':rid,'system':sys,'kind':'unknown','titles':{'ko':ko,'en':en,'ja':None},
                    'originalTitle':None,'romanizations':[],'baseGameId':None,'aliases':[],'sources':[],
                    'fingerprints':[],'links':[],'releases':[]}
                if sys=='arcade':rows[rid]['arcadeNamespace']='tentacle-romlistkr'
            row=rows[rid]
            aliases={(a['name'],a.get('kind'),a.get('source')):a for a in row['aliases']}
            for alias in [{'name':leaf,'kind':'original-filename-stem','language':None,'source':'tentacle-romlistkr'},
                          {'name':observed,'kind':'display-label','language':'ko' if ko else None,'source':'tentacle-romlistkr'}]:
                aliases[(alias['name'],alias['kind'],alias['source'])]=alias
            row['aliases']=[v for k,v in sorted(aliases.items())]
            row['sources']=sorted(set(row['sources']+['tentacle-romlistkr']))
            # The source gives a translated display label, not proof of a translated ROM.
            row.setdefault('titleEvidence',{})['tentacle-romlistkr']={'role':'display-title','file':p.relative_to(source).as_posix()}
            imported+=1
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf-8') as f:
        for rid,row in sorted(rows.items()): f.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'sourceRows':imported,'identities':len(rows),'baseIdentities':len(existing)}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['source','base','output']:p.add_argument('--'+arg,required=True)
    run(p.parse_args())
