#!/usr/bin/env python3
"""Research acceptance against the actual encrypted preview, without building it."""
from __future__ import annotations
import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('ZGCLAB_TEST_URL','http://127.0.0.1:8789/')
OUT=Path(os.environ.get('ZGCLAB_RESEARCH_PREVIEW_ARTIFACTS','/home/ubuntu/log/zgclab-research-preview'))


def run():
    OUT.mkdir(parents=True,exist_ok=True)
    checks,errors=[],[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=shutil.which('google-chrome'),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
        page.set_default_timeout(45000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        model_requests=[]
        page.on('request',lambda request:model_requests.append(request.url) if request.url.split('?')[0].endswith(('/api/chat','/api/search')) else None)
        def passed(label,**evidence):
            checks.append({'check':label,'status':'PASS',**evidence})
            print(json.dumps(checks[-1],ensure_ascii=False),flush=True)
        def go(hash,selector):
            page.evaluate('(hash)=>location.hash=hash',hash)
            page.locator(selector).wait_for()
        page.goto(BASE+'#/evidence?angle=social&id=social-1')
        page.locator('#accessPassword').fill((ROOT/'.runtime/pages-password').read_text().strip())
        page.locator('#accessSubmit').click()
        page.locator('#researchReadingMode').wait_for()
        assert page.locator('[data-reading="original"] .research-paragraph p').inner_text()=='A-State Faces Setback in High-Scoring Matchup Versus South Alabama, 56-49 https://t.co/4uChDuOQVI'
        assert '99cd4b9d4d5f202dbf7b201998c175b5b6535078e8ce3536b2eb4ac3d2d76649' in page.locator('.research-provenance').inner_text()
        page.locator('#researchReadingMode').select_option('original')
        assert page.locator('[data-reading="translation"]').is_hidden()
        page.locator('#researchReadingMode').select_option('parallel')
        page.locator('[data-paragraph-anchor="original-1"]').click()
        assert 'p=original-1' in page.url
        page.locator('#copyResearchCitation').click()
        fallback=page.locator('#researchCopyFallback')
        if fallback.count():
            text=fallback.input_value()
            assert '原文 URL：https://x.com/ArkansasState/status/2108426110039908459' in text
            assert '#/record/social/social-1' in text
            assert '数据版本：f064c896c123cbf4' in text
        page.screenshot(path=str(OUT/'evidence-social-preview.png'),full_page=True)
        passed('encrypted preview loads exact unmodified Arkansas original, full provenance, modes and paragraph/citation route')
        go('#/evidence?angle=clue&id=clue-1','#researchReadingMode')
        original='\n'.join(page.locator('[data-reading="original"] .research-paragraph p').all_inner_texts())
        assert len(original)==1808
        assert 'Jenny Town' in original and 'manifests/official_web/' in page.locator('.research-provenance').inner_text()
        assert not page.locator('h3').filter(has_text='解析第').count()
        passed('CFR clue-1 exact full original length, manifest and no invented PDF pages')
        go('#/evidence?angle=social&id=social-1613','#researchReadingMode')
        assert '2026-08-22T17:52:00Z' in page.locator('.research-provenance').inner_text()
        assert 'postId=content_id' in page.locator('.research-provenance').inner_text()
        passed('recovered publication date displays actual basis while original field stays missing')
        go('#/evidence?angle=news&id=news-3665','#researchReadingMode')
        assert '译文字段是占位说明' in page.locator('#researchBody').inner_text()
        assert '无法翻译' in page.locator('[data-reading="translation"]').inner_text()
        passed('real explicit translation placeholder remains labeled')
        go('#/coverage?issue=translation','#coverageSummary')
        text=page.locator('#coverageSummary').inner_text()
        for value in ['120 / 120','1,018','626','392','325']:
            assert value in text,(value,text)
        assert '325' in page.locator('#researchCoverageCount').inner_text()
        page.locator('#coverageIssue').select_option('sources')
        assert page.locator('.research-coverage-table tbody tr').count()==12
        assert '监测证据未接入' in page.locator('#coverageSources').inner_text()
        page.wait_for_function("document.querySelector('#coverageServiceStatus')?.textContent.includes('采集任务证据')",timeout=90000)
        status=page.locator('#coverageServiceStatus').inner_text()
        assert '未接入采集任务证据' in status
        assert '检索服务' in status
        page.screenshot(path=str(OUT/'coverage-preview.png'),full_page=True)
        passed('actual 120 observed cells, 1018 original missing, 626 recovered, 392 unresolved, 325 placeholders; service failure stays disconnected')
        go('#/changes','#researchChangesCount')
        assert '首次打开' in page.locator('#researchBaselineNotice').inner_text()
        assert page.locator('#researchFingerprintCoverage').get_attribute('data-full-fingerprint-count')=='6989'
        assert '6,989/6,989' in page.locator('#researchFingerprintCoverage').inner_text()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        page.wait_for_function("document.querySelector('#researchServiceStatus')?.textContent.includes('采集任务证据')",timeout=90000)
        storage=page.locator('#researchChangesStorage').inner_text()
        assert '浏览器已确认保存' in storage
        baseline=page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).researchChanges.real.baseline")
        assert baseline['compact'] is True
        assert len(baseline['records'])==6989
        go('#/collection-plan','#collectionPlanCount')
        go('#/changes','#researchChangesCount')
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        page.locator('#markSnapshotViewed').click()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        page.screenshot(path=str(OUT/'changes-zero-preview.png'),full_page=True)
        passed('first/second/acknowledged identical snapshot has zero changes and real compact baseline is persisted',serialized_chars=len(json.dumps(baseline,ensure_ascii=False,separators=(',',':'))))
        page.locator('#checkResearchVersion').click()
        page.wait_for_function("!document.querySelector('#checkResearchVersion').disabled",timeout=90000)
        version_message=page.locator('#researchVersionCheck').inner_text()
        assert any(message in version_message for message in ['未能检查','未发现新发布','不一致','无法确认']),version_message
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        passed('manual latest-version check keeps local comparison usable and reports service snapshot availability honestly',message=version_message)
        page.evaluate("()=>{const w=JSON.parse(localStorage.getItem('zgclab.workspace.v1'));w.researchChanges.real.baseline.fullFingerprintCount=0;w.researchChanges.real.baseline.records['social:social-1'][0]='previous-index-comparison';w.researchChanges.real.subscription={scope:'watchlist',kind:'all',queryHash:'',notify:false,savedAt:'2026-11-08T00:00:00Z'};localStorage.setItem('zgclab.workspace.v1',JSON.stringify(w));}")
        page.reload()
        page.locator('#accessPassword').fill((ROOT/'.runtime/pages-password').read_text().strip())
        page.locator('#accessSubmit').click()
        page.locator('#researchChangesCount').wait_for()
        assert '比较能力已升级' in page.locator('#researchBaselineNotice').inner_text()
        assert '匹配 0 条变化' in page.locator('#researchChangesCount').inner_text()
        upgraded=page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).researchChanges.real")
        assert upgraded['baseline']['fullFingerprintCount']==6989
        assert upgraded['importedStates'][0]['baseline']['fullFingerprintCount']==0
        assert upgraded['importedStates'][0]['baseline']['records']['social:social-1'][0]=='previous-index-comparison'
        assert upgraded['subscription']['scope']=='watchlist'
        assert page.locator('#exportPreviousResearchBaseline').is_visible()
        page.screenshot(path=str(OUT/'changes-capability-upgrade-preview.png'),full_page=True)
        passed('actual encrypted preview upgrades old zero-fingerprint baseline to 6989 with zero false changes, preserves old baseline and watchlist subscription')

        go('#/related?angle=clue&id=clue-289','#relationGroup')
        page.locator('#relationGroupName').fill('预览手动资料组')
        page.locator('#createRelationGroup').click()
        page.locator('#manualRelationAngle').select_option('social')
        page.locator('#manualRelationId').fill('social-1')
        page.locator('#addManualRelation').click()
        assert 'Arkansas State' in page.locator('#relationSaved').inner_text()
        page.locator('[data-remove-relation]').first.click()
        assert not page.locator('#relationSaved [data-remove-relation]').count()
        assert '候选' in page.locator('#relatedCandidates').inner_text()
        passed('related query-param route candidate explanations and manual group add/remove persist safely')
        go('#/collection-plan','#collectionPlanCount')
        assert page.locator('.research-plan-card').count()==10
        assert page.locator('.research-nav a').filter(has_text='未来采集建议').count()==1
        page.locator('[data-create-plan="publication-basis"]').click()
        page.locator('[data-plan-status="publication-basis"]').select_option('doing')
        with page.expect_download() as download:
            page.locator('#exportCollectionPlan').click()
        assert download.value.suggested_filename.endswith('.csv')
        passed('independent future-collection navigation, ten recommendations, task status and export')
        page.set_viewport_size({'width':390,'height':844})
        for route,selector in [('#/evidence?angle=social&id=social-1','#researchReadingMode'),('#/related?angle=clue&id=clue-289','#relationGroup'),('#/coverage?issue=sources','#coverageSummary'),('#/changes','#researchChangesCount'),('#/collection-plan','#collectionPlanCount')]:
            go(route,selector)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route
        page.screenshot(path=str(OUT/'collection-plan-preview-390.png'),full_page=True)
        passed('all five encrypted-preview routes fit 390px phone width')
        assert not model_requests,model_requests
        passed('research route navigation and version checks send no chat or search/model requests',model_requests=len(model_requests))
        assert not errors,errors
        browser.close()
    (OUT/'results.json').write_text(json.dumps({'target':BASE,'passed':len(checks),'errors':errors,'checks':checks},ensure_ascii=False,indent=2))

if __name__=='__main__':run()
