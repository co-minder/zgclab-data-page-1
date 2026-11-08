"""Verify the actual redesigned encrypted release and unchanged data/service assets.

Run on social after the central build. No API calls or model generation.
"""
from __future__ import annotations
import base64
import gzip
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT=Path(__file__).resolve().parents[1]

def run():
    baseline=json.loads((ROOT/'reports/research-design-preserved-contracts-20261109.json').read_text())
    unchanged=[]
    for name,expected in baseline['files'].items():
        actual=subprocess.check_output(['git','hash-object','--',name],cwd=ROOT,text=True).strip()
        assert actual==expected,(name,'preserved asset changed')
        unchanged.append(name)
    manifest_name=re.search(r'data-manifest="([^"]+)"',(ROOT/'docs/index.html').read_text()).group(1)
    manifest=json.loads((ROOT/'docs'/manifest_name).read_text())
    password=(ROOT/'.runtime/pages-password').read_text().rstrip(chr(13)+chr(10))
    key=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=base64.b64decode(manifest['salt']),iterations=manifest['iterations']).derive(password.encode())
    aes=AESGCM(key)
    assets=[]
    for name,target in manifest['assets'].items():
        blob=(ROOT/'docs'/target).read_bytes()
        assert hashlib.sha256(blob).hexdigest()==Path(target).stem,(name,'encrypted hash')
        raw=gzip.decompress(aes.decrypt(blob[:12],blob[12:],name.encode()))
        assert raw==(ROOT/name).read_bytes(),(name,'encrypted deployment source mismatch')
        assets.append({'source':name,'encrypted':target,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
    report={'tested_at':datetime.now(timezone.utc).isoformat(),'baseline_head':baseline['baseline_head'],'manifest':manifest_name,'encrypted_assets_verified':len(assets),'preserved_data_backend_auth_query_files':len(unchanged),'passed':True,'model_requests':0,'assets':assets,'scope':'All active encrypted deployment assets match current sources; original data, backend, authentication and query modules remain byte-identical to the reviewed baseline.'}
    (ROOT/'reports/research-design-integrity-20261109.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({key:report[key] for key in ('manifest','encrypted_assets_verified','preserved_data_backend_auth_query_files','passed','model_requests')}),flush=True)

if __name__=='__main__':run()
