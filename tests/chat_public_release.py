"""Verify the published research-chat UI and actual database/model API together.
Explicit manifest/commit inputs are required. One generated answer is authorized.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE='https://co-minder.github.io/zgclab-data-page-1/'
QUESTION='你好，给我看看 近期的就是 对中国最相关的 报道我看看'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--commit',required=True)
 args=parser.parse_args();assert re.fullmatch('manifest-[a-f0-9]{20}.json',args.manifest);assert re.fullmatch('[a-f0-9]{40}',args.commit)
 out=Path('/home/ubuntu/log/zgclab-chat-upgrade-20261109/public')/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');out.mkdir(parents=True,exist_ok=False)
 password=(ROOT/'.runtime/pages-password').read_text().rstrip(chr(13)+chr(10))
 report={'target':BASE,'expected_manifest':args.manifest,'release_commit':args.commit,'started_at':datetime.now(timezone.utc).isoformat(),'artifact_directory':str(out),'checks':[],'page_errors':[],'business_responses':[],'source_injected':False}
 def check(label,condition,evidence=None):
  report['checks'].append({'name':label,'status':'PASS' if condition else 'FAIL','evidence':evidence});assert condition,label
 def response_seen(response):
  if response.request.method=='POST' and urlsplit(response.url).path in ['/api/chat','/api/search']:
   try:
    data=response.json();report['business_responses'].append({'endpoint':urlsplit(response.url).path,'http_status':response.status,'api_revision':data.get('api_revision'),'state':data.get('state'),'model':data.get('model'),'usage':data.get('usage'),'answer_format':data.get('answer_format'),'coverage':data.get('coverage')})
   except Exception:pass
 def reveal(page,target):
  for detail in target.locator('xpath=ancestor::details').all():
   if not detail.evaluate('el=>el.open'):detail.locator(':scope>summary').click()
 def unlock(page):
  page.locator('#accessPassword').fill(password);page.locator('#accessForm').evaluate('el=>el.requestSubmit()');page.locator('#asQuestion').wait_for(timeout=60000)
 try:
  with sync_playwright() as pw:
   browser=pw.chromium.launch(headless=True,executable_path=shutil.which('google-chrome'),args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write']);page=context.new_page();page.set_default_timeout(30000);page.on('pageerror',lambda error:report['page_errors'].append(str(error)));page.on('response',response_seen)
   page.goto(BASE+'?chatRelease='+args.manifest+'#/assistant',wait_until='domcontentloaded');actual=page.locator('script[data-manifest]').get_attribute('data-manifest');report['actual_manifest']=actual
   check('Actual public encrypted manifest',actual==args.manifest,actual);check('Fresh document requires password',page.locator('#accessForm').is_visible())
   manifest_response=context.request.get(BASE+args.manifest);check('Published manifest exact bytes',manifest_response.status==200 and manifest_response.body()==(ROOT/'docs'/args.manifest).read_bytes())
   immutable=context.request.get('https://raw.githubusercontent.com/co-minder/zgclab-data-page-1/'+args.commit+'/docs/index.html');check('Published package bound to immutable release commit',immutable.status==200 and args.manifest in immutable.text())
   unlock(page);check('Default entry is chat',page.locator('#asChatTab').get_attribute('aria-selected')=='true');check('Simulation remains disabled',not page.locator('#includeSimulation').is_checked())
   page.wait_for_function('document.querySelector(".as-connection.is-connected")',timeout=45000)
   status=page.evaluate('ZGCLAB_SERVICE_CLIENT.status()');check('New backend revision and real database',status.get('api_revision')=='research-chat-20261109' and status.get('snapshot',{}).get('total')==6989,{'api_revision':status.get('api_revision'),'snapshot':status.get('snapshot')})
   keep=page.locator('#asKeep');reveal(page,keep);keep.check()
   page.locator('#asQuestion').fill(QUESTION);started=time.monotonic()
   with page.expect_response(lambda r:r.request.method=='POST' and urlsplit(r.url).path=='/api/chat',timeout=125000) as event:page.locator('#asSubmit').click()
   response=event.value;data=response.json();report['original_answer']=data;report['original_seconds']=round(time.monotonic()-started,2)
   check('Original colloquial question gets actual grounded model answer',response.status==200 and data.get('api_revision')=='research-chat-20261109' and data.get('state')=='answered' and data.get('model',{}).get('used')is True and len(data.get('citations',[]))>0,{'state':data.get('state'),'format':data.get('answer_format'),'model':data.get('model'),'seconds':report['original_seconds']})
   page.wait_for_function('document.querySelector("#asSubmit")?.disabled===false',timeout=20000);check('Answer displayed with source controls',bool(page.locator('#asTranscript .as-citation-ref').count()) and len(page.locator('#asTranscript').inner_text())>150)
   page.locator('#asTranscript .as-answer').last.scroll_into_view_if_needed()
   page.screenshot(path=str(out/'original-answer-1440.png'),full_page=False)
   page.locator('#asTranscript .as-citation-ref').first.click();check('Inline citation reveals and focuses evidence',bool(page.evaluate('document.activeElement.dataset.asCitation')))
   page.screenshot(path=str(out/'original-citation-1440.png'),full_page=False)
   # Use a fresh conversation so the prior China topic cannot change this total.
   new_conversation=page.locator('#asNew');reveal(page,new_conversation);new_conversation.click()
   page.locator('#asQuestion').fill('阿肯色州立大学有多少条资料？')
   with page.expect_response(lambda r:r.request.method=='POST' and urlsplit(r.url).path=='/api/chat',timeout=45000)as event:page.locator('#asSubmit').click()
   count=event.value.json();report['count_answer']=count
   check('Exact SQL institution count remains 221 without model',count.get('state')=='database_answer' and count.get('model',{}).get('used')is False and count.get('aggregates',{}).get('matched',{}).get('total')==221,{'state':count.get('state'),'model':count.get('model'),'matched':count.get('aggregates',{}).get('matched',{}).get('total')})
   for width in [390,768,1440]:
    page.set_viewport_size({'width':width,'height':900});overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth');check(str(width)+'px chat has no page overflow',overflow<=1,overflow);page.screenshot(path=str(out/('chat-'+str(width)+'.png')),full_page=False)
   for index in range(2):
    page.reload(wait_until='domcontentloaded');check('Refresh '+str(index+1)+' requires password',page.locator('#accessForm').is_visible());unlock(page)
   check('No page script errors',not report['page_errors'],report['page_errors']);browser.close()
 except Exception as error:report['error']=str(error)
 report['finished_at']=datetime.now(timezone.utc).isoformat();report['passed']=sum(item['status']=='PASS' for item in report['checks']);report['failed']=sum(item['status']=='FAIL' for item in report['checks'])+int('error'in report and not any(item['status']=='FAIL' for item in report['checks']));report['verdict']='PASS' if report['failed']==0 and len(report['checks'])>=15 else 'FAIL'
 text=json.dumps(report,ensure_ascii=False,indent=2);assert password not in text
 (out/'results.json').write_text(text)
 print(json.dumps({'verdict':report['verdict'],'passed':report['passed'],'failed':report['failed'],'report':str(out/'results.json'),'actual_manifest':report.get('actual_manifest')},ensure_ascii=False),flush=True)
 raise SystemExit(report['verdict']!='PASS')

if __name__=='__main__':main()
