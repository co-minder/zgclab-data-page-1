#!/usr/bin/env python3
"""Research routes and module regression in existing server Chrome/Playwright, no external requests."""
from __future__ import annotations
import csv
import io
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get('ZGCLAB_RESEARCH_ARTIFACTS', '/home/ubuntu/log/zgclab-research-ui'))


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which('google-chrome'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        def route(request):
            url = urlsplit(request.request.url)
            if url.netloc != 'research.test':
                request.abort()
                return
            name = unquote(url.path).lstrip('/') or 'index.html'
            candidate = (ROOT / name).resolve()
            if candidate.is_relative_to(ROOT) and candidate.is_file():
                content_type = 'text/css' if name.endswith('.css') else 'application/javascript' if name.endswith('.js') else 'text/html'
                request.fulfill(status=200, content_type=content_type, body=candidate.read_bytes())
            else:
                request.fulfill(status=404, body='not available in test')
        context.route('**/*',route)
        page = context.new_page()
        page.set_default_timeout(18000)
        page.on('pageerror',lambda error: errors.append(str(error)))
        def passed(label,**evidence):
            checks.append({'check':label,'status':'PASS',**evidence})
            print(json.dumps(checks[-1],ensure_ascii=False),flush=True)
        def go(hash,selector):
            page.evaluate('(hash)=>{location.hash=hash}',hash)
            page.locator(selector).wait_for()
        def download(selector):
            with page.expect_download() as result:
                page.locator(selector).click()
            return list(csv.DictReader(io.StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))

        page.goto('http://research.test/#/record/social/social-1')
        page.locator('.modal').wait_for()
        entry=page.locator('.modal a[href^="#/evidence?"]').first
        assert entry.count(), 'record detail must expose evidence query-param route'
        entry.click()
        page.locator('#researchReadingMode').wait_for()
        assert 'A-State Faces Setback' in page.locator('[data-reading="original"]').inner_text()
        assert page.locator('[data-reading="original"] .research-paragraph').count()==1
        assert '99cd4b9d4d5f202dbf7b201998c175b5b6535078e8ce3536b2eb4ac3d2d76649' in page.locator('.research-provenance').inner_text()
        page.locator('#researchReadingMode').select_option('original')
        assert page.locator('[data-reading="translation"]').is_hidden()
        page.locator('#researchReadingMode').select_option('translation')
        assert page.locator('[data-reading="original"]').is_hidden()
        page.locator('#researchReadingMode').select_option('parallel')
        page.locator('[data-paragraph-anchor="original-1"]').click()
        assert 'p=original-1' in page.url
        page.locator('#markEvidenceRead').click()
        assert page.locator('#markEvidenceRead').inner_text()=='已读'
        page.locator('#copyResearchCitation').click()
        fallback=page.locator('#researchCopyFallback')
        if fallback.count():
            citation=fallback.input_value()
            assert '2108426110039908459' in citation and '数据版本：' in citation and '原文摘录：A-State Faces Setback' in citation
            assert '#/record/social/social-1' in citation and '#/evidence?' in citation
        page.screenshot(path=str(OUT/'evidence-social-1440.png'),full_page=True)
        passed('actual app record-detail entry, Arkansas original/translation modes, hash, paragraph anchor and read marker')

        go('#/evidence?angle=clue&id=clue-1','#researchReadingColumns')
        assert 'Jenny Town' in page.locator('[data-reading="original"]').inner_text()
        assert '不代表 PDF 页码' in page.locator('#researchBody').inner_text()
        assert 'manifests/official_web/' in page.locator('.research-provenance').inner_text()
        assert not page.locator('h3').filter(has_text='解析第').count()
        passed('clue-1 full body, manifest and honest paragraph/PDF boundaries')
        go('#/evidence?angle=social&id=social-1613','#researchReadingColumns')
        assert '2026-08-22T17:52:00Z' in page.locator('.research-provenance').inner_text()
        assert 'postId=content_id' in page.locator('.research-provenance').inner_text()
        passed('recovered Facebook date shows original missing value, actual recovered value and identity basis')
        go('#/evidence?angle=news&id=news-3665','#researchReadingColumns')
        assert '译文字段是占位说明' in page.locator('#researchBody').inner_text()
        assert '无法翻译' in page.locator('[data-reading="translation"]').inner_text()
        passed('real 无法翻译 placeholder is explicitly labeled')

        go('#/related?angle=clue&id=clue-289','#relationGroup')
        assert '候选' in page.locator('#researchBody').inner_text()
        page.locator('#relationGroupName').fill('资料组 <img src=x onerror="window.pwned=1">')
        page.locator('#createRelationGroup').click()
        assert page.locator('#relatedCandidates [data-save-relation]:not([disabled])').count()>0
        page.locator('#relatedCandidates [data-save-relation]:not([disabled])').first.click()
        assert page.locator('#relationSaved [data-remove-relation]').count()==1
        page.locator('#relationSaved [data-remove-relation]').first.click()
        assert page.locator('#relationSaved [data-remove-relation]').count()==0
        page.locator('#manualRelationAngle').select_option('social')
        page.locator('#manualRelationId').fill('social-1')
        page.locator('#addManualRelation').click()
        assert 'social-1' in page.evaluate('localStorage.getItem("zgclab.workspace.v1")')
        assert not page.locator('#researchBody img').count()
        assert page.evaluate('window.pwned') is None
        passed('related route, explainable candidates, local group create/save/remove/manual add and literal malicious name')
        page.evaluate("()=>{window.limitApi={META:ZGCLAB_META,view:document.querySelector('#view'),workspace:{relations:Array.from({length:300},(_,n)=>({id:'relation-limit-'+n,name:'group '+n,records:[{angle:'clue',id:'clue-289'}]}))},entriesFor:async angle=>['news','clue','social'].filter(a=>angle==='all'||a===angle).flatMap(angle=>window['ZGCLAB_'+angle.toUpperCase()].map(r=>({angle,r}))),ensureDetail:async(a,r)=>({fields:r}),saveWorkspace:()=>true,showToast:message=>{window.limitMessage=message}};return ZGCLAB_RESEARCH_UI('related',new URLSearchParams('angle=clue&id=clue-289'),limitApi)}")
        page.locator('#relationGroupName').fill('over limit')
        page.locator('#createRelationGroup').click()
        assert page.evaluate('limitApi.workspace.relations.length')==300
        assert '300' in page.evaluate('limitMessage')
        page.evaluate("()=>{limitApi.workspace.relations=[{id:'relation-full',name:'full',records:Array.from({length:5000},(_,n)=>({angle:'news',id:'news-full-'+n}))}];return ZGCLAB_RESEARCH_UI('related',new URLSearchParams('angle=clue&id=clue-289'),limitApi)}")
        page.locator('#manualRelationAngle').select_option('social')
        page.locator('#manualRelationId').fill('social-1')
        page.locator('#addManualRelation').click()
        assert page.evaluate('limitApi.workspace.relations[0].records.length')==5000
        assert not page.evaluate('limitApi.workspace.relations[0].records.some(r=>r.id==="clue-289")')
        assert '5,000' in page.evaluate('limitMessage')
        passed('related UI respects 300-group and 5000-member boundaries atomically, without partial additions')


        go('#/collection-plan','#collectionPlanCount')
        assert page.locator('.research-plan-card').count()==10
        assert page.locator('.research-nav a').filter(has_text='未来采集建议').count()==1
        page.locator('[data-create-plan="publication-basis"]').click()
        page.locator('[data-plan-status="publication-basis"]').select_option('doing')
        page.locator('[data-plan-note="publication-basis"]').fill('</textarea><script>window.pwned=1</script>')
        page.locator('[data-plan-note="publication-basis"]').blur()
        page.locator('#planPriority').select_option('P0')
        exported=download('#exportCollectionPlan')
        assert len(exported)==len(page.locator('.research-plan-card').all())
        assert any(row['本地待办状态']=='进行中' for row in exported)
        page.screenshot(path=str(OUT/'collection-plan-1440.png'),full_page=True)
        passed('ten recommendations across four categories, independent navigation, local task status/notes and filtered CSV',exported=len(exported))

        go('#/coverage?issue=translation','#coverageSummary')
        assert '120 / 120' in page.locator('#coverageSummary').inner_text()
        assert '325' in page.locator('#researchCoverageCount').inner_text()
        assert '626' in page.locator('#coverageSummary').inner_text()
        assert '392' in page.locator('#coverageSummary').inner_text()
        page.locator('#coverageIssue').select_option('sources')
        assert page.locator('.research-coverage-table tbody tr').count()==12
        assert '监测证据未接入' in page.locator('#coverageSources').inner_text()
        passed('coverage uses all 120 cells, 325 placeholder translations, 626 recovered and 392 unresolved dates')

        # Use direct mount API only for storage failures, service status and synthetic changes.
        page.evaluate('''()=>{
          window.testVersion=0;window.testController=new AbortController();
          window.testWorkspace={favorites:[],queries:[{name:'Arkansas query',hash:'/explore?angle=social&accountHandles=ArkansasState'}],watchlist:[1002550],read:{}};
          window.testRows=['news','clue','social'].flatMap(angle=>window['ZGCLAB_'+angle.toUpperCase()].map(r=>({angle,r})));
          window.testSaveOk=true;
          window.testApi={META:ZGCLAB_META,Q:ZGCLAB_QUERY,view:document.querySelector('#view'),workspace:testWorkspace,
           entriesFor:async angle=>testRows.filter(e=>angle==='all'||e.angle===angle),ensureDetail:async(angle,r)=>({fields:r}),
           titleOf:(angle,r)=>r.title_cn||r.title||r.id,instName:id=>String(id),showToast:()=>{},
           serviceClient:{status:async()=>({service:'zgclab-database',state:'ready',database:'ready'})},
           saveWorkspace:()=>testSaveOk,downloadCsv:(name,headers,rows)=>{window.testExport={name,headers,rows}}};
          window.testMount=async(name,query='')=>{testController.abort();testController=new AbortController();testVersion++;testApi.signal=testController.signal;testApi.version=testVersion;testApi.currentVersion=()=>testVersion;return ZGCLAB_RESEARCH_UI(name,new URLSearchParams(query),testApi)};
        }''')
        page.evaluate('testMount("changes")')
        assert '首次打开' in page.locator('#researchBaselineNotice').inner_text()
        assert page.locator('#researchFingerprintCoverage').get_attribute('data-full-fingerprint-count')=='6989'
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        assert '浏览器已确认保存' in page.locator('#researchChangesStorage').inner_text()
        assert '已就绪（已有快照检索）' in page.locator('#researchServiceStatus').inner_text()
        assert '未接入采集任务证据' in page.locator('#researchServiceStatus').inner_text()
        assert page.evaluate('JSON.stringify(testWorkspace.researchChanges.real.baseline).length*2')<2*1024*1024
        assert page.evaluate('()=>{const restored={};ZGCLAB_RESEARCH_UI.mergeBackup(JSON.parse(JSON.stringify(testWorkspace)),restored);return restored.researchChanges.real.baseline.total===6989}')
        page.evaluate('testMount("changes")')
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        page.screenshot(path=str(OUT/'changes-same-snapshot-1440.png'),full_page=True)
        passed('first baseline and second unchanged snapshot stay at zero; compact baseline persists under 2 MiB; retrieval ready does not imply collection')
        page.evaluate("()=>{testWorkspace.researchChanges.real.baseline.fullFingerprintCount=0;testWorkspace.researchChanges.real.baseline.records['social:social-1'][0]='old-index-hash'}")
        page.evaluate('testMount("changes")')
        assert '比较能力已升级' in page.locator('#researchBaselineNotice').inner_text()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        assert page.evaluate('testWorkspace.researchChanges.real.baseline.fullFingerprintCount')==6989
        assert page.evaluate('testWorkspace.researchChanges.real.importedStates[0].baseline.fullFingerprintCount')==0
        assert page.evaluate('testWorkspace.researchChanges.real.importedStates[0].baseline.records["social:social-1"][0]')=='old-index-hash'
        assert page.locator('#exportPreviousResearchBaseline').is_visible()
        passed('full fingerprint capability upgrade resets comparison to zero and preserves previous baseline/subscription for review/export')

        page.evaluate("void(testApi.serviceClient.status=async()=>({state:'ready',snapshot:{source_version:ZGCLAB_META.version,research_version:ZGCLAB_RESEARCH.version}}))")
        page.locator('#checkResearchVersion').click()
        page.wait_for_function("document.querySelector('#researchVersionCheck').textContent.includes('未发现新发布')")
        assert page.locator('#reloadResearchVersion').is_hidden()
        page.evaluate("void(testApi.serviceClient.status=async()=>({state:'ready',snapshot:{source_version:'service-new-source',research_version:'service-new-research'}}))")
        page.locator('#checkResearchVersion').click()
        page.wait_for_function("document.querySelector('#researchVersionCheck').textContent.includes('不一致')")
        assert page.locator('#reloadResearchVersion').is_visible()
        assert '再次输入访问密码' in page.locator('#researchVersionCheck').inner_text()
        assert '未能检查' not in page.locator('#researchVersionCheck').inner_text()
        page.evaluate("void(testApi.serviceClient.status=async()=>{throw new Error('disconnected')})")
        page.locator('#checkResearchVersion').click()
        page.wait_for_function("document.querySelector('#researchVersionCheck').textContent.includes('未能检查')")
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        assert page.locator('#reloadResearchVersion').is_hidden()
        page.evaluate("void(testApi.serviceClient.status=async()=>({state:'ready',snapshot:{source_version:ZGCLAB_META.version,research_version:ZGCLAB_RESEARCH.version}}))")
        passed('manual latest-version check handles same/mismatched/disconnected service and offers reload with password notice without blocking local compare')

        page.evaluate('''()=>{const row=testRows.find(e=>e.r.id==='social-1').r;row.title+=' changed';testRows.push({angle:'social',r:{id:'social-new-test',ktid:1002550,title:'Arkansas candidate',original_content:'new content',content_url:'https://example.test/new'}})}''')
        page.evaluate('testMount("changes")')
        assert '匹配 2 条变化' in page.locator('#researchChangesCount').inner_text()
        page.locator('#changesScope').select_option('watchlist')
        assert '匹配 2 条变化' in page.locator('#researchChangesCount').inner_text()
        page.locator('#changesNotify').check()
        page.locator('#saveChangeSubscription').click()
        page.locator('#exportResearchChanges').click()
        assert page.evaluate('testExport.rows.length')==2
        page.locator('#markSnapshotViewed').click()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        passed('changed/new snapshot, watchlist, subscription, CSV and mark current snapshot viewed')

        page.evaluate('testSaveOk=false;testWorkspace.researchChanges={schema:1};testMount("changes")')
        assert '仅本次会话保留' in page.locator('#researchChangesStorage').inner_text()
        page.evaluate('testMount("changes")')
        assert '仅本次会话保留' in page.locator('#researchChangesStorage').inner_text()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        page.locator('#saveChangeSubscription').click()
        assert '仅本次会话保留' in page.locator('#researchChangesStorage').inner_text()
        page.evaluate('testApi.META={...ZGCLAB_META,simulation:true};testMount("changes")')
        assert '模拟数据基线' in page.locator('#researchChangesStorage').inner_text()
        assert page.evaluate('testWorkspace.researchChanges.simulation===undefined')
        passed('storage rejection stays honest on reopening, zero-change session baseline and simulation stays outside persistent payload')
        page.evaluate('testApi.META=ZGCLAB_META;testWorkspace={favorites:[],queries:[],watchlist:[],read:{},researchChanges:{schema:1,real:{baseline:{schema:1,records:[]}}}};testApi.workspace=testWorkspace;testMount("changes")')
        assert '首次打开' in page.locator('#researchBaselineNotice').inner_text()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        passed('malformed stored baseline rebuilds locally without breaking the research route')
        page.evaluate('''()=>{testApi.META=ZGCLAB_META;testRows=[{angle:'news',r:{id:'news-hostile',ktid:1,title_cn:'<img src=x onerror="window.pwned=1">',summary_cn:'must not become original',content_cn:'无法翻译',url:'javascript:alert(1)'}}];return testMount('evidence','angle=news&id=news-hostile')}''')
        assert '原文正文未提供' in page.locator('[data-reading="original"]').inner_text()
        assert 'must not become original' not in page.locator('[data-reading="original"]').inner_text()
        assert page.locator('#researchBody img,#researchBody script').count()==0
        assert not page.locator('#researchBody a[href^="javascript:"]').count()
        assert page.evaluate('window.pwned') is None
        passed('empty original, hostile title, unsafe URL remain text with no executable DOM')
        page.evaluate('''async()=>{testRows=[{angle:'social',r:{id:'slow',ktid:1,original_content:'old'}}];let resolve;testApi.ensureDetail=()=>new Promise(r=>resolve=r);const pending=testMount('evidence','angle=social&id=slow');await Promise.resolve();testController.abort();document.querySelector('#view').innerHTML='<p id="routeSentinel">new route</p>';resolve({fields:{original_content:'late old'}});await pending}''')
        assert page.locator('#routeSentinel').inner_text()=='new route'
        passed('aborted route does not write late detail response into new view')

        page.goto('http://research.test/#/evidence?angle=clue&id=clue-1')
        page.reload()
        page.locator('#researchReadingMode').wait_for()
        for width in (390,760,1440):
            page.set_viewport_size({'width':width,'height':900})
            for route_name,selector in [('#/evidence?angle=clue&id=clue-1','#researchReadingMode'),('#/related?angle=clue&id=clue-289','#relationGroup'),('#/collection-plan','#collectionPlanCount'),('#/coverage?issue=sources','#coverageSummary'),('#/changes','#researchChangesCount')]:
                go(route_name,selector)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,route_name)
            page.screenshot(path=str(OUT/f'changes-{width}.png'),full_page=True)
        passed('all five integrated routes fit desktop, tablet and phone without page overflow')
        assert not errors,errors
        browser.close()
    (OUT/'results.json').write_text(json.dumps({'passed':len(checks),'errors':errors,'checks':checks},ensure_ascii=False,indent=2))

if __name__=='__main__':
    run()
