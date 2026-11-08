"""Verify the accepted encrypted chat build and preserved non-chat source contracts."""
from __future__ import annotations
import argparse
import base64
import gzip
import hashlib
import json
import re
import subprocess
from datetime import datetime,timezone
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT=Path(__file__).resolve().parents[1]

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--package',default=str(ROOT/'docs'));parser.add_argument('--expect-manifest',required=True);parser.add_argument('--output',required=True)
 args=parser.parse_args();package=Path(args.package).resolve();contract=json.loads((ROOT/'reports/research-chat-preserved-contracts-20261109.json').read_text())
 unchanged=[]
 for name,wanted in contract['files'].items():
  actual=subprocess.check_output(['git','hash-object','--',name],cwd=ROOT,text=True).strip();assert actual==wanted,name;unchanged.append(name)
 gate=(package/'index.html').read_text();name=re.search(r'data-manifest="([^"]+)"',gate).group(1);assert name==args.expect_manifest
 manifest=json.loads((package/name).read_text());assert manifest['version']==hashlib.sha256(json.dumps(manifest['assets'],sort_keys=True).encode()).hexdigest()[:20]
 password=(ROOT/'.runtime/pages-password').read_text().rstrip(chr(13)+chr(10))
 key=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=base64.b64decode(manifest['salt']),iterations=manifest['iterations']).derive(password.encode());aes=AESGCM(key)
 assets=[]
 for source,target in manifest['assets'].items():
  encrypted=(package/target).read_bytes();assert hashlib.sha256(encrypted).hexdigest()==Path(target).stem
  raw=gzip.decompress(aes.decrypt(encrypted[:12],encrypted[12:],source.encode()));assert raw==(ROOT/source).read_bytes(),source
  assets.append({'source':source,'encrypted':target,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
 server_sources={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted((ROOT/'service').glob('*.py'))}
 report={'tested_at':datetime.now(timezone.utc).isoformat(),'manifest':name,'encrypted_assets_verified':len(assets),'preserved_files_verified':len(unchanged),'baseline_commit':contract['baseline_head'],'package':str(package),'source_injected':False,'passed':True,'assets':assets,'server_source_sha256':server_sources,'model_calls':0}
 Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({key:report[key] for key in ['manifest','encrypted_assets_verified','preserved_files_verified','passed']},ensure_ascii=False))

if __name__=='__main__':main()
