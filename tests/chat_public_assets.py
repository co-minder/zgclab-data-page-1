"""Read back every active public encrypted asset and bind it to committed bytes."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
BASE='https://co-minder.github.io/zgclab-data-page-1/'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--commit',required=True);parser.add_argument('--output',required=True)
 args=parser.parse_args();assert re.fullmatch('manifest-[a-f0-9]{20}.json',args.manifest);assert re.fullmatch('[a-f0-9]{40}',args.commit)
 nonce=args.manifest.removeprefix('manifest-').removesuffix('.json')
 manifest=json.loads((ROOT/'docs'/args.manifest).read_text())
 paths=['index.html',args.manifest,'access.js','access.css','favicon.svg',*manifest['assets'].values()]
 def verify(path):
  local=(ROOT/'docs'/path).read_bytes();committed=subprocess.check_output(['git','show',args.commit+':docs/'+path],cwd=ROOT)
  assert local==committed,path+' working package differs from release commit'
  request=urllib.request.Request(BASE+path+'?chatRelease='+nonce,headers={'Cache-Control':'no-cache'})
  for attempt in range(3):
   try:
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request,timeout=30)as response:
     raw=response.read();code=response.status
    break
   except (OSError,urllib.error.URLError):
    if attempt==2:raise
  assert code==200 and raw==committed,path+' public bytes differ from release commit'
  digest=hashlib.sha256(raw).hexdigest()
  if path.startswith('encrypted/'):assert digest==Path(path).stem
  return {'path':path,'bytes':len(raw),'sha256':digest,'public_exact_bytes':True}
 entries=[]
 with ThreadPoolExecutor(max_workers=4)as pool:
  futures=[pool.submit(verify,path)for path in paths]
  for future in as_completed(futures):entries.append(future.result())
 entries.sort(key=lambda item:item['path'])
 report={'checked_at':datetime.now(timezone.utc).isoformat(),'verdict':'PASS','manifest':args.manifest,'release_commit':args.commit,'target':BASE,'cache_bypassed':True,'active_encrypted_objects_verified':len(manifest['assets']),'public_files_verified':len(entries),'total_bytes':sum(item['bytes']for item in entries),'files':entries,'model_calls':0}
 Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({key:report[key]for key in ['verdict','manifest','active_encrypted_objects_verified','public_files_verified','total_bytes']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
