"""Join No-Intro/Redump title records to naming identities without reading any ROM."""
import argparse
import json
from pathlib import Path
import re
import unicodedata
from importlib.util import spec_from_file_location,module_from_spec

spec=spec_from_file_location('tentacle_import',Path(__file__).with_name('import-tentacle.py'))
helper=module_from_spec(spec)
spec.loader.exec_module(helper)
PLATFORMS={
 'nes':'Nintendo - Nintendo Entertainment System','snes':'Nintendo - Super Nintendo Entertainment System',
 'gb':'Nintendo - Game Boy','gbc':'Nintendo - Game Boy Color','gba':'Nintendo - Game Boy Advance',
 'nds':'Nintendo - Nintendo DS','n64':'Nintendo - Nintendo 64','md':'Sega - Mega Drive - Genesis',
 'sms':'Sega - Master System - Mark III','gg':'Sega - Game Gear','pce':'NEC - PC Engine - TurboGrafx 16',
 'pcecd':'NEC - PC Engine CD - TurboGrafx-CD','segacd':'Sega - Mega-CD - Sega CD','saturn':'Sega - Saturn',
 'ps1':'Sony - PlayStation','psp':'Sony - PlayStation Portable','ws':'Bandai - WonderSwan',
 'ngp':'SNK - Neo Geo Pocket','a2600':'Atari - 2600','a7800':'Atari - 7800','lynx':'Atari - Lynx',
 'col':'Coleco - ColecoVision','sg':'Sega - SG-1000','vb':'Nintendo - Virtual Boy','32x':'Sega - 32X',
 'msx':'Microsoft - MSX','wsv':'Watara - Supervision','mini':'Nintendo - Pokemon Mini',
}

def key(name):
    return ''.join(c for c in unicodedata.normalize('NFKC',helper.bare(name)).casefold() if c.isalnum())

def run(args):
    rows=[json.loads(line) for line in Path(args.input).read_text().splitlines() if line]
    index={}
    for row in rows:
        if row['system']=='arcade' or row.get('kind') in ['romhack','homebrew','bootleg','bios']:continue
        if row.get('sources')==['rpi-filename']:continue
        names=[row['titles'].get('en')]+[a if isinstance(a,str) else a['name'] for a in row.get('aliases',[])]
        for name in names:
            if name and re.search('[A-Za-z]',name) and not re.search('[가-힣]',name):
                index.setdefault((row['system'],key(name)),set()).add(row['id'])
    source=Path(args.source)
    count=0;releases=0;files=0
    with Path(args.output).open('x',encoding='utf-8') as output:
        for sys,platform in sorted(PLATFORMS.items()):
            extra=['Bandai - WonderSwan Color'] if sys=='ws' else ['SNK - Neo Geo Pocket Color'] if sys=='ngp' else []
            for title in [platform,*extra]:
                for kind in ['no-intro','redump']:
                    p=source/'metadat'/kind/(title+'.dat')
                    if not p.exists():continue
                    files+=1
                    # libretro DATs put each game at top level and each ROM on one line.
                    text=p.read_text(encoding='utf-8-sig')
                    for block in re.split(r'^game\s*\(\s*$',text,flags=re.M)[1:]:
                        nm=re.search(r'^\s*name\s+"((?:\\.|[^"\\])*)"',block,re.M)
                        if not nm:continue
                        name=nm.group(1).replace('\\"','"')
                        ids=index.get((sys,key(name)),set())
                        if not ids:continue
                        releases+=1
                        serial=re.search(r'^\s*serial\s+"([^"]*)"',block,re.M)
                        region=re.search(r'^\s*region\s+"([^"]*)"',block,re.M)
                        roms=[]
                        for rom in re.findall(r'^\s*rom\s*\((.*)\)\s*$',block,re.M):
                            fields={}
                            for field in ['name','size','crc','md5','sha1']:
                                m=re.search(r'\b'+field+r'\s+(?:"([^"]*)"|([^\s)]+))',rom)
                                if m:fields[field]=m.group(1) or m.group(2)
                            roms.append(fields)
                        for rid in sorted(ids):
                            link={'provider':'libretro','id':sys+'/'+name,'status':'title-unique' if len(ids)==1 else 'ambiguous',
                              'by':'system-and-alias','relation':'release-reference','platform':title,
                              'thumbnailKey':re.sub(r'[&*/:`<>?\\|"]','_',name),'mediaAvailability':'unknown'}
                            release={'system':sys,'name':name,'serial':serial.group(1) if serial else None,
                              'region':region.group(1) if region else None,'roms':roms,'hashScope':'DAT ROM/track; not a container hash'}
                            output.write(json.dumps({'identityId':rid,'sourceFile':p.relative_to(source).as_posix(),'link':link,'release':release},ensure_ascii=False,separators=(',',':'))+'\n')
                            count+=1
    print(json.dumps({'sourceFiles':files,'matchedReleases':releases,'links':count}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ['source','input','output']:p.add_argument('--'+arg,required=True)
    run(p.parse_args())
