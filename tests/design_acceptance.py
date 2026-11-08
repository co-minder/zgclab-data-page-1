#!/usr/bin/env python3
"""Independent encrypted-release UI review. No language-model calls permitted."""
import argparse
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path('/home/ubuntu/zgclab-1-web')
REPORT = ROOT / 'reports/research-design-review-20261109.json'
ARTIFACTS = Path('/home/ubuntu/log/zgclab-ui-design-20261109/qa')
ROUTES = [
    ('assistant-search', '#/assistant?mode=search&expand=0&semantic=0', '#asQuestion'),
    ('assistant-chat', '#/assistant?mode=chat&expand=0&semantic=0', '#asQuestion'),
    ('projects-empty', '#/projects', '#projectBody'),
    ('evidence-social', '#/evidence?angle=social&id=social-1', '#researchReadingMode'),
    ('evidence-clue', '#/evidence?angle=clue&id=clue-1', '#researchReadingMode'),
    ('related', '#/related?angle=social&id=social-1', '#researchBody'),
    ('changes', '#/changes', '#researchBody'),
    ('coverage', '#/coverage', '#coverageSummary'),
    ('plan', '#/collection-plan', '#researchBody'),
]
SIZES = [(1440, 1000), (390, 844), (768, 1024)]

async def unlock(page, password):
    await page.locator('#accessPassword').fill(password)
    await page.locator('#accessSubmit').click()
    await page.locator('#view').wait_for(state='visible', timeout=60000)

async def settle(page, ready):
    await page.locator(ready).wait_for(state='attached', timeout=45000)
    await page.wait_for_function("""() => {
        const root = document.querySelector('#view');
        return root && ![...root.querySelectorAll('.skeleton')].some(x => x.getClientRects().length);
    }""", timeout=45000)
    await page.evaluate('document.fonts.ready')
    await page.wait_for_timeout(350)

async def snapshot(page, name, directory, reset_scroll=True):
    directory.mkdir(parents=True, exist_ok=True)
    if reset_scroll:
        await page.evaluate('window.scrollTo(0,0)')
    target = directory / (name + '.png')
    await page.screenshot(path=str(target), full_page=False)
    metrics = await page.evaluate("""() => {
        const view = document.querySelector('#view');
        const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        const visible = node => !!node.getClientRects().length && getComputedStyle(node).visibility!=='hidden';
        return {
            title:view.querySelector('h1')?.textContent,
            width:innerWidth,height:innerHeight,
            pageHeight:document.documentElement.scrollHeight,
            horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
            firstContent:[...view.querySelectorAll('.research-paragraph p,.research-related-card,.project-material,.research-plan-card,.rec-card,.as-evidence')].filter(visible).slice(0,3).map(node=>({label:node.textContent.trim().slice(0,90),...rect(node)})),
            headingStyle:(()=>{const node=view.querySelector('h1');const css=node&&getComputedStyle(node);return css?{size:css.fontSize,weight:css.fontWeight,lineHeight:css.lineHeight}:null})(),
            topbar:rect(document.querySelector('.topbar')),
            content:rect(view),
            primaryActions:[...view.querySelectorAll('.primary')].filter(visible).map(node=>({label:node.textContent.trim(),...rect(node)})),
            visibleControls:[...view.querySelectorAll('button,input,select,textarea,summary')].filter(visible).map(node=>({tag:node.tagName,label:node.getAttribute('aria-label')||node.textContent.trim().slice(0,70),...rect(node)})),
            openTechnicalDetails:[...view.querySelectorAll('details[open]')].map(node=>node.querySelector('summary')?.textContent.trim()),
            bodyTextLength:view.textContent.length,
        };
    }""")
    metrics['screenshot'] = str(target)
    return metrics

async def seed_project(page, password):
    # Every item is from the decrypted release, in a disposable browser context.
    await page.evaluate("""() => {
        const inst=id=>window.ZGCLAB_META.institutions.find(x=>String(x.ktid)===String(id))?.cn || String(id);
        const picks=[['social',window.ZGCLAB_SOCIAL[0]],['clue',window.ZGCLAB_CLUE[0]],['news',window.ZGCLAB_NEWS[0]]];
        const now=new Date().toISOString();
        const items=picks.map(([angle,r],i)=>({angle,id:r.id,title:r.title_cn||r.title_en||r.title||r.clue_title||r.id,ktid:String(r.ktid),institution:inst(r.ktid),date:r.publish_time||r.founddate||'',url:r.content_url||r.original_url||r.source_url||r.url||'',dataVersion:window.ZGCLAB_META.version,simulation:false,snippet:(r.original_content||r.content||r.summary||'').slice(0,220),note:i===0?'核查原文出处并保留可引用证据。':'',excerpt:'',status:i===0?'verified':'pending',selected:true,addedAt:now,updatedAt:now}));
        const workspace=JSON.parse(localStorage.getItem('zgclab.workspace.v1')||'{"favorites":[],"queries":[]}');
        workspace.projects=[{id:'qa-design-fixture',name:'人工智能政策与机构动态',description:'独立设计验收：仅使用当前真实快照材料。',archived:false,createdAt:now,updatedAt:now,items,report:{markdown:'',materialKeys:[],dataVersion:window.ZGCLAB_META.version,updatedAt:'',generatedAt:''}}];
        localStorage.setItem('zgclab.workspace.v1',JSON.stringify(workspace));
    }""")
    await page.reload(wait_until='domcontentloaded')
    await unlock(page, password)
    await page.evaluate("location.hash='#/projects?id=qa-design-fixture'")
    await settle(page, '#projectMaterials')

async def goto(page, hash_, ready):
    await page.evaluate('(hash)=>location.hash=hash', hash_)
    await settle(page, ready)

async def reveal(locator):
    # Use real workspace switches when the narrow layout displays one pane.
    for pane,button in [('#projectReportPanel','[data-project-panel="report"]'),('#projectMaterialsPanel','[data-project-panel="materials"]')]:
        if await locator.locator('xpath=ancestor::*[@id="'+pane[1:]+'"]').count() and not await locator.is_visible():
            control=locator.page.locator(button)
            if await control.count() and await control.is_visible():
                await control.click()
    # Use each disclosure's actual summary to reach an intentionally hidden action.
    details = locator.locator('xpath=ancestor::details[not(@open)]')
    for detail in await details.all():
        if not await detail.evaluate('(el)=>el.open'):
            await detail.locator(':scope > summary').click()

async def click(page, selector):
    locator = page.locator(selector)
    await reveal(locator)
    await locator.click()

async def download(page, selector):
    async with page.expect_download() as event:
        await click(page, selector)
    item = await event.value
    payload = Path(await item.path()).read_bytes()
    return item.suggested_filename, payload

async def functional_checks(page, context, phase, password, args):
    checks = phase['checks']
    def passed(name, evidence=None):
        checks.append({'name': name, 'passed': True, **({'evidence':evidence} if evidence is not None else {})})
        print('PASS '+name, flush=True)
    async def screenshot(name, selector=None):
        if selector:
            target=page.locator(selector).first
            await reveal(target)
            await target.scroll_into_view_if_needed()
        phase['snapshots'][name] = await snapshot(page,name,ARTIFACTS/args.phase,reset_scroll=selector is None)
    async def exported_json(selector):
        _, payload = await download(page,selector)
        return json.loads(payload.decode('utf-8-sig'))
    await page.set_viewport_size({'width':1440,'height':1000})
    real = await page.evaluate("({count:Object.values(window.ZGCLAB_META.totals).filter(x=>typeof x==='number'),total:window.ZGCLAB_NEWS.length+window.ZGCLAB_CLUE.length+window.ZGCLAB_SOCIAL.length,version:window.ZGCLAB_META.version})")
    assert real['total'] == 6989
    assert not await page.locator('#includeSimulation').is_checked()
    passed('real data preserved and simulation default off', {'records':real['total'],'sourceVersion':real['version']})

    # Select a real material using intersecting filters, edit it and restore it
    # from the exported project backup. All state is in this new browser context.
    await goto(page,'#/projects?id=qa-design-fixture','#projectMaterials')
    assert await page.locator('[data-material]').count() == 3
    await reveal(page.locator('#projectStatus'))
    await page.locator('#projectStatus').select_option('verified')
    await reveal(page.locator('#projectAngle'))
    await page.locator('#projectAngle').select_option('social')
    await reveal(page.locator('#projectMaterialSearch'))
    await page.locator('#projectMaterialSearch').fill('Arkansas')
    assert await page.locator('[data-material]').count() == 1
    assert await page.locator('[data-material]').get_attribute('data-material') == 'social:social-1'
    await screenshot('projects-multiple-filters-1440','#projectMaterials')
    passed('project search, status and angle intersect using real material')
    note = page.locator('[data-material="social:social-1"] [data-item-field="note"]')
    await reveal(note)
    await note.fill('QA独立核查：A-State原文和来源链接需逐字保留。')
    await note.blur()
    await page.wait_for_timeout(450)
    await click(page,'#projectGenerateReport')
    await page.wait_for_function("() => !!document.querySelector('#projectMarkdown')?.value && document.querySelector('#projectCancelReport')?.hidden",timeout=45000)
    markdown = await page.locator('#projectMarkdown').input_value()
    assert 'social-1' in markdown and real['version'] in markdown and 'https://' in markdown
    passed('project citation draft keeps stable record, source URL and data version')
    project_backup = await exported_json('#projectExportJson')
    project = project_backup['projects'][0]
    assert len(project['items']) == 3
    assert project['items'][0]['note'].startswith('QA独立核查')
    assert project['report']['markdown'] == markdown
    filename, csv = await download(page,'#projectExportCsv')
    assert 'social-1' in csv.decode('utf-8-sig') and 'clue-1' in csv.decode('utf-8-sig')
    passed('project JSON and CSV export preserve all materials across current filters', {'records':len(project['items'])})
    await page.locator('#projectMaterialSearch').fill('QA-no-matching-record-20261109')
    assert await page.locator('[data-material]').count() == 0
    await screenshot('projects-no-results-1440','#projectMaterials')
    passed('project no-results state and filters leave saved materials intact')
    await page.locator('#projectMaterialSearch').fill('')
    await page.locator('#projectStatus').select_option('')
    await page.locator('#projectAngle').select_option('')
    await click(page,'#projectArchive')
    assert await page.locator('#projectMarkdown').is_disabled()
    assert await page.locator('#projectGenerateReport').is_disabled()
    await screenshot('projects-archived-disabled-1440')
    passed('archived project blocks report and material editing')
    await click(page,'#projectArchive')
    assert not await page.locator('#projectMarkdown').is_disabled()

    # Literal source text, exact paragraph citation, mode controls and read marker.
    await goto(page,'#/evidence?angle=social&id=social-1','#researchReadingMode')
    original = await page.locator('#research-original-1 p').text_content()
    assert original == 'A-State Faces Setback in High-Scoring Matchup Versus South Alabama, 56-49 https://t.co/4uChDuOQVI'
    await click(page,'[data-copy-paragraph="original-1"]')
    citation = await page.evaluate('navigator.clipboard.readText()')
    assert original in citation and real['version'] in citation and 'social/social-1' in citation
    assert 'https://x.com/ArkansasState/status/2108426110039908459' in citation
    passed('copied original citation exactly includes text, record, source, version')
    await page.locator('#researchReadingMode').select_option('translation')
    assert await page.locator('[data-reading="original"]').is_hidden()
    assert await page.locator('[data-reading="translation"]').is_visible()
    await page.locator('#researchReadingMode').select_option('original')
    assert await page.locator('[data-reading="translation"]').is_hidden()
    await page.locator('#researchReadingMode').select_option('parallel')
    await click(page,'[data-copy-paragraph="translation-1"]')
    translated_citation = await page.evaluate('navigator.clipboard.readText()')
    translated = await page.locator('#research-translation-1 p').text_content()
    assert translated in translated_citation and original in translated_citation
    assert '未核验逐段对应' in translated_citation
    passed('reading modes and translated citation retain alignment caveat')
    await click(page,'#markEvidenceRead')
    assert '已读' in await page.locator('#markEvidenceRead').text_content()
    read = await page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).read")
    assert any(key.endswith(':social:social-1') for key in read)
    await page.locator('[data-paragraph-anchor="original-1"]').click()
    assert 'p=original-1' in page.url
    assert await page.evaluate("document.activeElement?.id") == 'research-original-1'
    passed('read status persists and paragraph deep-link moves focus')
    await goto(page,'#/evidence?angle=clue&id=clue-1','#researchReadingMode')
    assert await page.locator('#researchReadingColumns').is_visible()
    await goto(page,'#/evidence?angle=social&id=qa-missing-record','#researchBody')
    assert re.search('未找到|没有找到|不存在',await page.locator('#researchBody').text_content())
    await screenshot('evidence-not-found-1440')
    passed('clue evidence and missing-record recovery link remain available')

    # Related records remain explicit human grouping; this never triggers models.
    await goto(page,'#/related?angle=social&id=social-1','#relationGroupName')
    assert await page.locator('#addManualRelation').is_disabled()
    await screenshot('related-no-group-disabled-1440')
    await reveal(page.locator('#relationGroupName'))
    await page.locator('#relationGroupName').fill('QA研究分组')
    await click(page,'#createRelationGroup')
    await page.locator('#manualRelationAngle').select_option('clue')
    await page.locator('#manualRelationId').fill('clue-1')
    await click(page,'#addManualRelation')
    assert 'clue-1' in await page.locator('#relationSaved').inner_html()
    groups=await page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).relations")
    assert len(groups[0]['records']) == 2
    await screenshot('related-saved-group-1440','#relationSaved')
    passed('explicit human relation group saves real source and known clue record')

    await goto(page,'#/collection-plan','#planCategory')
    await reveal(page.locator('#planCategory'))
    await page.locator('#planCategory').select_option('integrity')
    await page.locator('#planPriority').select_option('P0')
    await page.locator('#planSearch').fill('发布时间')
    assert await page.locator('[data-create-plan]').count() == 1
    await click(page,'[data-create-plan]')
    task=page.locator('[data-plan-status="publication-basis"]')
    await reveal(task)
    await task.select_option('doing')
    await page.locator('[data-plan-note="publication-basis"]').fill('核查原始发布日期依据')
    await page.locator('[data-plan-note="publication-basis"]').blur()
    await screenshot('plan-multiple-filters-task-1440')
    _, plan_csv=await download(page,'#exportCollectionPlan')
    assert 'publication-basis' in plan_csv.decode('utf-8-sig')
    await page.locator('#planSearch').fill('QA-no-matching-plan')
    assert await page.locator('#exportCollectionPlan').is_disabled()
    await screenshot('plan-no-results-disabled-1440')
    passed('plan intersecting filters, local task state, export and empty state')

    await goto(page,'#/coverage','#coverageIssue')
    await reveal(page.locator('#coverageIssue'))
    await page.locator('#coverageIssue').select_option('translation')
    await page.locator('#coverageInstitution').select_option('1002550')
    await page.locator('#coverageAngle').select_option('social')
    await screenshot('coverage-multiple-filters-1440')
    assert '当前范围' in await page.locator('#researchCoverageCount').text_content()
    passed('coverage issue, institution and angle scope update together')
    await goto(page,'#/changes','#researchChangesCount')
    assert '0' in await page.locator('#researchChangesCount').text_content()
    assert '6,989' in await page.locator('#researchBody').text_content()
    await click(page,'#saveChangeSubscription')
    assert await page.evaluate("!!JSON.parse(localStorage.getItem('zgclab.workspace.v1')).researchChanges")
    passed('first change baseline keeps 6989 historical records and zero new items')

    # Open the technical disclosures to confirm original facts remain reachable.
    for route,ready,target in [('coverage','#coverageIssue','#coverageServiceStatus'),('changes','#researchChangesCount','#researchServiceStatus')]:
        await goto(page,'#/'+route,ready)
        disclosure=page.locator(target+' .research-service-details')
        assert not await disclosure.evaluate('(el)=>el.open')
        await disclosure.locator(':scope > summary').click()
        assert real['version'] in await disclosure.inner_text()
        assert '最近记录采集字段' in await disclosure.inner_text()
        passed(route+' technical snapshot fields accessible through real summary')
    await goto(page,'#/evidence?angle=social&id=social-1','#researchReadingMode')
    provenance=page.locator('.research-provenance').last
    assert not await provenance.evaluate('(el)=>el.open')
    await provenance.locator(':scope > summary').click()
    assert '原文 URL' in await provenance.inner_text() and real['version'] in await provenance.inner_text()
    assert 'social-1' in await provenance.inner_text()
    passed('evidence provenance closed by default and actual source fields preserved')

    # Only literal /search and an exact database-count /chat may reach the service.
    await goto(page,'#/assistant?mode=search&expand=0&semantic=0','#asQuestion')
    assert await page.locator('#asCopy').is_disabled()
    assert await page.locator('#asExport').is_disabled()
    await page.locator('#asQuestion').focus()
    await page.keyboard.press('Tab')
    focused=await page.evaluate("({tag:document.activeElement?.tagName,id:document.activeElement?.id,outline:getComputedStyle(document.activeElement).outline,shadow:getComputedStyle(document.activeElement).boxShadow})")
    assert focused['id'] and (focused['outline'] != 'rgb(0, 0, 0) none 0px' or focused['shadow'] != 'none')
    phase['focusEvidence']=focused
    await screenshot('assistant-keyboard-focus-1440')
    passed('assistant initial export disabled and keyboard tab focus works',focused)
    await page.locator('#asQuestion').fill('A-State Faces Setback')
    async with page.expect_response(lambda r:'/api/search' in r.url and r.request.method=='POST',timeout=45000) as event:
        await click(page,'#asSubmit')
    response=await event.value
    data=await response.json()
    assert response.ok and not data.get('model',{}).get('used') and not data.get('model',{}).get('attempted')
    await page.wait_for_function("() => !document.querySelector('#asSubmit').disabled",timeout=45000)
    assert 'social-1' in await page.locator('#asSearchResults').inner_html()
    await screenshot('assistant-literal-results-1440','#asSearchResults')
    _, exported=await download(page,'#asExport')
    assert b'social-1' in exported and real['version'].encode() in exported
    passed('real literal API search and Markdown export preserve exact source without model')

    # Delay an already completed literal response in the browser to inspect busy
    # controls and cancel. This reuses recorded response bytes, not new service work.
    gate=asyncio.Event()
    async def delayed(route):
        await gate.wait()
        try:
            await route.fulfill(status=200,json=data)
        except Exception:
            pass
    await context.route('**/api/search',delayed)
    await page.locator('#asQuestion').fill('A-State Faces Setback')
    await click(page,'#asSubmit')
    await page.locator('#asCancel').wait_for(state='visible')
    assert await page.locator('#asSubmit').is_disabled()
    await screenshot('assistant-loading-cancel-1440')
    await click(page,'#asCancel')
    gate.set()
    await context.unroute('**/api/search',delayed)
    await page.wait_for_function("() => !document.querySelector('#asSubmit').disabled",timeout=10000)
    passed('busy search disables duplicate submit and cancel returns usable composer')

    await goto(page,'#/assistant?mode=chat&expand=0&semantic=0','#asQuestion')
    await reveal(page.locator('#asKeep'))
    await page.locator('#asKeep').check()
    await page.locator('#asQuestion').fill('数据库共有多少条记录？')
    async with page.expect_response(lambda r:'/api/chat' in r.url and r.request.method=='POST',timeout=45000) as event:
        await click(page,'#asSubmit')
    response=await event.value
    count=await response.json()
    assert response.ok and count['state']=='database_answer'
    assert not count['model']['used'] and not count['model']['attempted']
    assert count['aggregates']['scoped']['total'] == 6989
    await page.wait_for_function("() => !document.querySelector('#asSubmit').disabled",timeout=45000)
    text=await page.locator('#asTranscript').text_content()
    assert '6,989' in text and '数据库精确统计' in text
    await screenshot('assistant-exact-count-chat-1440','#asTranscript')
    passed('chat exact database aggregate is 6989 and reports no model use',{'records':6989,'modelUsed':False,'modelAttempted':False})

    # Global backup must preserve all subsystems and roundtrip in a second clean
    # context, including exact note/excerpt/report data and selected count chat.
    await goto(page,'#/workspace','#backupWorkspace')
    backup=await exported_json('#backupWorkspace')
    assert backup['projects'][0]['items'][0]['note'].startswith('QA独立核查')
    assert backup['projects'][0]['report']['markdown'] == markdown
    assert backup.get('relations') and backup.get('collectionPlan') and backup.get('researchChanges') and backup.get('chatSessions') and backup.get('read')
    payload=json.dumps(backup,ensure_ascii=False).encode()
    assert password.encode() not in payload
    restored=await context.browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    restore_page=await restored.new_page()
    await restore_page.goto(args.url,wait_until='domcontentloaded')
    await unlock(restore_page,password)
    await goto(restore_page,'#/workspace','#importWorkspace')
    await restore_page.locator('#importWorkspace').set_input_files({'name':'qa-backup.json','mimeType':'application/json','buffer':payload})
    await restore_page.wait_for_function("() => JSON.parse(localStorage.getItem('zgclab.workspace.v1')||'{}').projects?.length === 1")
    roundtrip=await restore_page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1'))")
    assert roundtrip['projects'][0]['report']['markdown'] == markdown
    assert roundtrip['projects'][0]['items'][0]['note'] == backup['projects'][0]['items'][0]['note']
    assert roundtrip['relations'][0]['records'] == backup['relations'][0]['records']
    assert roundtrip['collectionPlan']['tasks']['publication-basis']['status'] == 'doing'
    assert roundtrip['chatSessions'][0]['turns'][0]['question'] == backup['chatSessions'][0]['turns'][0]['question']
    await restored.close()
    passed('workspace export/import roundtrip preserves projects, annotations, report, groups, plan, changes, read state and saved chat')

    # Mobile nav uses actual keyboard activation, and remains reachable on all
    # seven routes despite old and new header styles sharing a document.
    mobile=[]
    for route,ready in [('assistant','#asQuestion'),('projects','#projectBody'),('evidence?angle=social&id=social-1','#researchReadingMode'),('related?angle=social&id=social-1','#relationGroupName'),('changes','#researchChangesCount'),('coverage','#coverageIssue'),('collection-plan','#planCategory')]:
        await goto(page,'#/'+route,ready)
        await page.set_viewport_size({'width':390,'height':844})
        await page.evaluate('scrollTo(0,0)')
        more=page.locator('.mobile-more')
        if await more.evaluate('(el)=>el.open'):
            await more.locator(':scope > summary').click()
        await more.locator(':scope > summary').focus()
        await page.keyboard.press('Enter')
        assert await more.evaluate('(el)=>el.open')
        assert await more.locator('a[href="#/assistant"]').is_visible()
        assert await more.locator('a[href="#/collection-plan"]').is_visible()
        popup=await more.locator('nav').bounding_box()
        assert popup and popup['x']>=0 and popup['x']+popup['width']<=391
        assert popup['y']>=0 and popup['y']+popup['height']<=844
        await page.keyboard.press('Tab')
        assert await page.evaluate("document.activeElement.closest('.mobile-more nav')!==null")
        await more.locator(':scope > summary').focus()
        if route=='assistant':
            await screenshot('mobile-more-open-390')
        await page.keyboard.press('Enter')
        assert not await more.evaluate('(el)=>el.open')
        overflow=await page.evaluate('document.documentElement.scrollWidth-innerWidth')
        assert overflow <= 1
        mobile.append({'route':route,'keyboardToggle':True,'overflow':overflow})
    await page.locator('.mobile-more > summary').click()
    await page.locator('.mobile-more a[href="#/projects"]').click()
    await settle(page,'#projectBody')
    assert await page.locator('body').get_attribute('data-route') == 'projects'
    assert not await page.locator('.mobile-more').evaluate('(el)=>el.open')
    phase['mobileNavigation']=mobile
    passed('mobile More keyboard open/close, every research route reachable and no horizontal overflow',{'routes':len(mobile)})

    await finish_checks(page,context,phase,password,args)

async def finish_checks(page,context,phase,password,args):
    def passed(name,evidence=None):
        phase['checks'].append({'name':name,'passed':True,**({'evidence':evidence} if evidence is not None else {})})
        print('PASS '+name,flush=True)
    # Reuse saved baseline viewports for isolation of legacy overview/explore.
    from PIL import Image, ImageChops
    legacy=[]
    legacy_context=await context.browser.new_context(accept_downloads=True)
    legacy_page=await legacy_context.new_page()
    await legacy_page.goto(args.url,wait_until='domcontentloaded')
    assert await legacy_page.locator('script[data-manifest]').get_attribute('data-manifest') == 'manifest-'+args.expected_manifest+'.json'
    await unlock(legacy_page,password)
    for width,height in SIZES:
        await legacy_page.set_viewport_size({'width':width,'height':height})
        for name,hash_ in [('legacy-overview','#/overview'),('legacy-explore','#/explore')]:
            await goto(legacy_page,hash_,'#view h1')
            await legacy_page.mouse.move(0,0)
            await legacy_page.wait_for_timeout(250)
            key=f'{name}-{width}'
            phase['snapshots'][key]=await snapshot(legacy_page,key,ARTIFACTS/args.phase)
            baseline=Image.open(ARTIFACTS/'before'/(key+'.png')).convert('RGB')
            current=Image.open(ARTIFACTS/args.phase/(key+'.png')).convert('RGB')
            diff=ImageChops.difference(baseline,current)
            changed=sum(pixel!=(0,0,0) for pixel in diff.getdata())/(baseline.width*baseline.height)
            significant=sum(max(pixel)>16 for pixel in diff.getdata())/(baseline.width*baseline.height)
            legacy.append({'page':name,'width':width,'changedPixelRatio':round(changed,6),'significantChangedPixelRatio':round(significant,6),'differenceBasis':'Fresh browser; fixed mouse outside controls. Threshold16 excludes hover tint and antialiasing; original ratio retained.'})
    phase['legacyComparison']=legacy
    assert all(item['significantChangedPixelRatio']<0.015 for item in legacy), legacy
    await legacy_context.close()
    passed('legacy overview/explore unchanged across 390/768/1440',legacy)

    # Exercise existing simulation only after all real-data and legacy checks.
    await page.set_viewport_size({'width':1440,'height':1000})
    await page.locator('#includeSimulation').check()
    await page.wait_for_function("() => window.ZGCLAB_SIM_META && document.querySelector('#includeSimulation').checked && !document.querySelector('#includeSimulation').disabled",timeout=45000)
    total=await page.evaluate("Object.values(window.ZGCLAB_SIM_META.totals).reduce((a,b)=>a+b,0)")
    assert total == 30000
    await page.locator('#includeSimulation').uncheck()
    await page.wait_for_function("() => !document.querySelector('#includeSimulation').checked && !document.querySelector('#includeSimulation').disabled",timeout=45000)
    passed('optional simulation remains 30000 separate records and can be turned off')
    await goto(page,'#/assistant?mode=chat&expand=0&semantic=0','#asQuestion')
    storage=await page.evaluate("({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))})")
    serialized=json.dumps(storage,ensure_ascii=False)
    assert password not in serialized
    assert not any('access.key' in key for key in storage['local'])
    assert 'zgclab.access.key.v1' not in storage['session']
    await page.reload(wait_until='domcontentloaded')
    assert await page.locator('#accessPassword').is_visible()
    assert await page.locator('#view').count() == 0
    passed('password and access key absent from storage; refresh requires unlock again')
    research_metrics=[value for key,value in phase['snapshots'].items() if re.search(r'-(390|768|1440)$',key) and not key.startswith('legacy-')]
    assert all(value['horizontalOverflow']<=1 for value in research_metrics)
    passed('all captured research states avoid horizontal overflow',{'states':len(research_metrics)})
    phase['functionalVerdict']='passed'

async def supplemental_checks(page, context, phase, password, args):
    def passed(name,evidence=None):
        phase['checks'].append({'name':name,'passed':True,**({'evidence':evidence} if evidence is not None else {})})
        print('PASS '+name,flush=True)
    await page.set_viewport_size({'width':1440,'height':1000})
    await goto(page,'#/coverage','#coverageMatrix')
    matrix=page.locator('.research-matrix-disclosure')
    assert not await matrix.evaluate('(el)=>el.open')
    await matrix.locator(':scope > summary').focus()
    await page.keyboard.press('Enter')
    assert await matrix.evaluate('(el)=>el.open')
    assert await page.locator('#coverageMatrix tbody tr').count()==20
    assert await page.locator('#coverageMatrix tbody td').count()==120
    assert '不作合计' in await page.locator('#coverageMatrix').inner_text()
    assert '0 不代表目标入口已完成监测' in await page.locator('#coverageMatrix').inner_text()
    await page.locator('#coverageMatrix').scroll_into_view_if_needed()
    phase['snapshots']['coverage-matrix-keyboard-1440']=await snapshot(page,'coverage-matrix-keyboard-1440',ARTIFACTS/'after',reset_scroll=False)
    passed('coverage matrix keyboard disclosure exposes 20 institutions and 120 source cells',{'institutions':20,'cells':120})

    # The saved UI fixture uses actual decrypted records, explicitly labels its
    # answer as a UI fixture, and never substitutes product JavaScript or CSS.
    await goto(page,'#/related?angle=social&id=social-1','#relatedCandidates')
    fixture=await page.evaluate("""() => {
        const version=window.ZGCLAB_META.version;
        const items=window.ZGCLAB_SOCIAL.slice(0,5).map((r,i)=>({label:'C'+(i+1),id:r.id,angle:'social',ktid:String(r.ktid),title:r.title||r.id,source_url:r.content_url,excerpt:r.original_content,paragraph:'1',field:'original_content',version}));
        const total={total:6989,by_angle:{news:3675,clue:1468,social:1846},by_institution:[],by_platform:[]};
        const aggregate={label:'A1',kind:'database_aggregate',scope:{source_version:version,date_field:'published_at',timezone:'Asia/Shanghai',filters:{ids:[],angle:'all',platforms:[],from:'',to:''},terms:[],strategy:'exact_fixture'},scoped:total,matched:total};
        const turn={id:'as-qa-design-turn',question:'UI回归：核对第五条真实资料引用',answer:'UI回归夹具：第五条资料的原文摘录。 [C5]；数据库精确计数口径。 [A1]',kind:'retrieval',modelInfo:{used:false,attempted:false,reason:'ui_fixture'},mode:'retrieval_only',source:'service',items,aggregates:[aggregate],expansions:['A-State'],requestedExpand:true,requestedSemantic:true,filters:{ids:[],angle:'all',platforms:[],from:'',to:''},query:'A-State',coverage:'UI回归夹具；引用内容来自已解密的真实快照。'};
        return {items,aggregate,version,session:{id:'as-qa-design-saved',kind:'assistant',schema:1,title:'QA视觉交互夹具',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),turns:[turn],filters:turn.filters}};
    }""")
    workspace={'favorites':[],'queries':[],'chatSessions':[fixture['session']]}
    await goto(page,'#/workspace','#importWorkspace')
    await page.locator('#importWorkspace').set_input_files({'name':'qa-chat-fixture.json','mimeType':'application/json','buffer':json.dumps(workspace,ensure_ascii=False).encode()})
    await page.wait_for_function("() => JSON.parse(localStorage.getItem('zgclab.workspace.v1')).chatSessions?.some(x=>x.id==='as-qa-design-saved')")
    await goto(page,'#/assistant?mode=chat&session=as-qa-design-saved&expand=0&semantic=0','#asQuestion')
    await page.locator('[data-as-citation="C5"]').wait_for(state='attached')
    extra=page.locator('.as-more-sources')
    assert not await extra.evaluate('(el)=>el.open')
    assert await page.locator('[data-as-citation="C5"]').is_hidden()
    await page.get_by_role('button',name='查看引用 C5',exact=True).click()
    assert await extra.evaluate('(el)=>el.open')
    assert await page.locator('[data-as-citation="C5"]').is_visible()
    assert await page.evaluate("document.activeElement.dataset.asCitation")=='C5'
    assert fixture['items'][4]['excerpt'] in await page.locator('[data-as-citation="C5"]').text_content()
    assert await page.locator('#asReading').evaluate("el=>el.lastElementChild.id")=='asComposeDock'
    passed('collapsed fifth citation auto-opens, receives focus and preserves exact real excerpt; follow-up composer remains last',{'fixture':'saved UI session from five actual snapshot records; no API model call'})
    for width,height in [(390,844),(1440,1000)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.get_by_role('button',name='查看引用 C5',exact=True).click()
        key=f'assistant-c5-focused-{width}'
        phase['snapshots'][key]=await snapshot(page,key,ARTIFACTS/'after',reset_scroll=False)
    aggregate=page.locator('[data-as-citation="A1"]')
    details=aggregate.locator('.as-aggregate-details')
    assert not await details.evaluate('(el)=>el.open')
    await details.locator(':scope > summary').focus()
    await page.keyboard.press('Enter')
    assert await details.evaluate('(el)=>el.open')
    assert await details.locator('table tbody tr').count()==2
    assert '6,989' in await details.inner_text() and '3,675' in await details.inner_text() and '1,468' in await details.inner_text() and '1,846' in await details.inner_text()
    assert fixture['version'] in await details.inner_text() and 'Asia/Shanghai' in await details.inner_text()
    await aggregate.scroll_into_view_if_needed()
    phase['snapshots']['assistant-aggregate-open-1440']=await snapshot(page,'assistant-aggregate-open-1440',ARTIFACTS/'after',reset_scroll=False)
    passed('A1 aggregate keyboard summary exposes exact count table, date field, timezone and source version')
    process=page.locator('.as-process')
    assert not await process.evaluate('(el)=>el.open')
    await process.locator(':scope > summary').click()
    assert 'A-State' in await process.inner_text()
    captured=[]
    async def mock_retract(route):
        if route.request.method!='POST':
            await route.continue_();return
        body=route.request.post_data_json
        captured.append({'expand':body.get('expand'),'message':body.get('message'),'historyCount':len(body.get('history',[]))})
        items=[{**item,'citation_id':item['label'],'snippet':item['excerpt'],'source_version':item['version']} for item in fixture['items']]
        aggregate={**fixture['aggregate'],'citation_id':'A1'}
        await route.fulfill(status=200,json={'state':'retrieval_only','answer_format':'retrieval_extracts','answer':'UI回归夹具：已撤回扩展，原始来源仍可核对。 [C5] [A1]','citations':items,'aggregate_citations':[aggregate],'model':{'used':False,'attempted':False,'reason':'ui_fixture'},'coverage':{'scoped_records':6989,'matched_records':5},'plan':{'terms':[['A-State']]},'query':body['message']})
    await context.route('**/api/chat',mock_retract)
    await process.locator('[data-as-withdraw]').click()
    await page.wait_for_function("() => !document.querySelector('#asSubmit').disabled")
    assert captured and captured[0]['expand'] is False and captured[0]['historyCount']==0
    assert await page.locator('.as-turn').count()==1
    await reveal(page.locator('#asExpand'))
    assert not await page.locator('#asExpand').is_checked()
    assert not await page.locator('#asSemantic').is_checked()
    assert await page.locator('#asSemantic').is_disabled()
    await context.unroute('**/api/chat',mock_retract)
    passed('real process summary permits expansion withdrawal and replaces current turn without model call',{'mockRequests':captured})
    await page.set_viewport_size({'width':390,'height':844})
    await reveal(page.locator('#asSessions'))
    assert await page.locator('#asSessions option[value="as-qa-design-saved"]').count()==1
    await page.get_by_role('button',name='继续追问 ↓',exact=True).click()
    assert await page.locator('#asQuestion').evaluate('(el)=>el===document.activeElement')
    phase['snapshots']['assistant-filled-followup-390']=await snapshot(page,'assistant-filled-followup-390',ARTIFACTS/'after',reset_scroll=False)
    passed('saved session controls reached through summary and follow-up action focuses composer')
    await goto(page,'#/projects','#projectsNavigation')
    await page.locator('#projectsNavigation > summary').focus()
    await page.keyboard.press('Enter')
    assert await page.locator('#projectsNavigation').evaluate('(el)=>el.open')
    passed('project mobile folder navigation opens with keyboard summary')
    phase['supplementalVerdict']='passed'

async def d02_target_acceptance(args):
    """New manifest: rerun only evidence CSS scope; inherit c43 behavior evidence."""
    import hashlib
    from PIL import Image, ImageChops
    assert args.phase=='after' and args.expected_manifest
    expected='manifest-'+args.expected_manifest+'.json'
    inherited_manifest='manifest-c43bba536e6b6ee9c83f.json'
    assert expected!=inherited_manifest, 'D02 requires MAIN new-build READY manifest'
    document=json.loads(REPORT.read_text())
    inherited=document['phases']['after']
    assert inherited['manifest']==inherited_manifest and inherited['functionalVerdict']=='passed' and inherited['supplementalVerdict']=='passed'
    document.setdefault('releaseHistory',{}).setdefault(inherited_manifest,inherited)
    phase={'startedAt':datetime.now(timezone.utc).isoformat(),'url':args.url,'expectedManifest':expected,'manifest':None,'scope':'D02 evidence desktop CSS plus affected behaviors/mobile and other-route leakage smoke','inheritedEvidence':{'manifest':inherited_manifest,'uniquePassedChecks':len(inherited['checks']),'checksRerun':False,'scope':'Prior 33 checks remain historical c43 evidence; new run only covers changed CSS and explicit affected checks.'},'checks':[],'snapshots':{},'languageModelCalls':0,'sourceInjection':False,'visualVerdict':'pending manual viewport review'}
    directory=ARTIFACTS/'d02-final'/args.expected_manifest
    def passed(name,evidence=None):
        phase['checks'].append({'name':name,'passed':True,**({'evidence':evidence} if evidence is not None else {})})
        print('PASS '+name,flush=True)
    password=(ROOT/'.runtime/pages-password').read_text().strip()
    current={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in inherited['finalSourceHashes']}
    changed=[name for name in current if current[name]!=inherited['finalSourceHashes'][name]]
    assert changed==['research.css'], {'unexpectedChangedFiles':changed}
    phase['sourceHashes']=current
    passed('inheritance gate: only research.css changed from c43 frozen inputs',{'changed':changed})
    errors=[];blocked=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
        async def no_models(route):
            if route.request.method=='POST':
                blocked.append(route.request.url.split('?')[0]);await route.abort()
            else:
                await route.continue_()
        await context.route('**/api/search',no_models);await context.route('**/api/chat',no_models)
        page=await context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        async def capture(key,reset=True):
            phase['snapshots'][key]=await snapshot(page,key,directory,reset_scroll=reset)
        try:
            await page.goto(args.url,wait_until='domcontentloaded')
            phase['manifest']=await page.locator('script[data-manifest]').get_attribute('data-manifest')
            assert phase['manifest']==expected
            await unlock(page,password)
            readings=[]
            for width,height in [(1440,1000),(1024,900),(768,1024),(390,844),(360,800)]:
                await page.set_viewport_size({'width':width,'height':height})
                for angle in ['social','clue']:
                    await goto(page,'#/evidence?angle='+angle+'&id='+angle+'-1','#researchReadingMode')
                    await page.mouse.move(0,0)
                    key='evidence-'+angle+'-'+str(width)
                    await capture(key)
                    metrics=await page.locator('#research-original-1 p').evaluate("""el=>({y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,font:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight,text:el.textContent})""")
                    select=await page.locator('#researchReadingMode').bounding_box()
                    citation=await page.locator('#copyResearchCitation').bounding_box()
                    assert metrics['font']==('14px' if width<=560 else '15px') and metrics['width']>=280, {'width':width,'metrics':metrics}
                    assert phase['snapshots'][key]['horizontalOverflow']<=1
                    if width==1440: assert metrics['y']<=590,metrics
                    if width==1024: assert metrics['y']<=625,metrics
                    if width in [390,768,1440]:
                        old=inherited['snapshots'][key]
                        old_select=next(item for item in old['visibleControls'] if item['tag']=='SELECT' and '原文与译文并列' in item['label'])
                        assert old_select['width']-1 <= select['width'] <= old_select['width']+12, {'currentSelect':select,'c43Select':old_select}
                    if width<=820:
                        assert citation['height'] >= (44 if width<=560 else 40), {'width':width,'citationControl':citation}
                        if key in inherited['snapshots']:
                            baseline=Image.open(inherited['snapshots'][key]['screenshot']).convert('RGB')
                            now=Image.open(directory/(key+'.png')).convert('RGB')
                            difference=ImageChops.difference(baseline,now)
                            ratio=sum(max(pixel)>16 for pixel in difference.getdata())/(now.width*now.height)
                            assert ratio<0.015,{'key':key,'mobileDifference':ratio}
                            metrics['c43SignificantPixelDifference']=round(ratio,6)
                    readings.append({'angle':angle,'width':width,**metrics,'control':select,'citationControl':citation})
            phase['readingMetrics']=readings
            passed('desktop paragraphs meet 1440<=590/1024<=625 with reading font and control widths preserved; mobile evidence unchanged',{'viewports':10})
            for width,height in [(1440,1000),(390,844)]:
                await page.set_viewport_size({'width':width,'height':height})
                for angle in ['social','clue']:
                    await goto(page,'#/evidence?angle='+angle+'&id='+angle+'-1','#researchReadingMode')
                    source=await page.locator('#research-original-1 p').text_content()
                    await click(page,'[data-copy-paragraph="original-1"]')
                    citation=await page.evaluate('navigator.clipboard.readText()')
                    assert source in citation and angle+'/'+angle+'-1' in citation
                    assert 'f064c896c123cbf4' in citation and '原文 URL：https://' in citation
                    translation=await page.locator('#research-translation-1 p').text_content()
                    await click(page,'[data-copy-paragraph="translation-1"]')
                    citation=await page.evaluate('navigator.clipboard.readText()')
                    assert translation in citation and source in citation and '未核验逐段对应' in citation
                    for mode,visible,hidden in [('original','original','translation'),('translation','translation','original')]:
                        await page.locator('#researchReadingMode').select_option(mode)
                        assert await page.locator('[data-reading="'+visible+'"]').is_visible()
                        assert await page.locator('[data-reading="'+hidden+'"]').is_hidden()
                    await page.locator('#researchReadingMode').select_option('parallel')
                    provenance=page.locator('.research-provenance').last
                    assert not await provenance.evaluate('(el)=>el.open')
                    await provenance.locator(':scope > summary').focus();await page.keyboard.press('Enter')
                    assert await provenance.evaluate('(el)=>el.open')
                    assert '原文 URL' in await provenance.inner_text() and 'f064c896c123cbf4' in await provenance.inner_text()
                    await provenance.locator(':scope > summary').focus();await page.keyboard.press('Enter')
                    await page.locator('[data-paragraph-anchor="original-1"]').click()
                    assert await page.evaluate('document.activeElement.id')=='research-original-1'
                    assert 'p=original-1' in page.url
                    await capture('evidence-'+angle+'-focus-'+str(width),False)
            passed('desktop/mobile social and clue exact source/translated citations, reading modes, provenance keyboard and paragraph focus')
            # Compare unaffected routes to c43 viewport evidence in clean state.
            smokes=[(name,hash_,ready) for name,hash_,ready in ROUTES if not name.startswith('evidence-')]
            comparisons=[]
            for width,height in [(1440,1000),(390,844)]:
                await page.set_viewport_size({'width':width,'height':height})
                for name,hash_,ready in smokes:
                    await goto(page,hash_,ready);await page.mouse.move(0,0);await page.wait_for_timeout(200)
                    key=name+'-'+str(width);await capture(key)
                    assert phase['snapshots'][key]['horizontalOverflow']<=1
                    old=inherited['snapshots'][key]
                    old_heading=old.get('headingStyle');new_heading=phase['snapshots'][key].get('headingStyle')
                    assert old_heading==new_heading
                    assert abs(old['topbar']['height']-phase['snapshots'][key]['topbar']['height'])<=1
                    baseline=Image.open(old['screenshot']).convert('RGB');now=Image.open(directory/(key+'.png')).convert('RGB')
                    diff=ImageChops.difference(baseline,now)
                    ratio=sum(max(pixel)>16 for pixel in diff.getdata())/(now.width*now.height)
                    # Service readiness text may settle asynchronously in assistant;
                    # unchanged geometry and scoped selector gate still apply.
                    assert ratio<0.015,{'route':key,'significantDifference':ratio}
                    comparisons.append({'route':key,'significantPixelDifference':round(ratio,6)})
            phase['unaffectedSmoke']=comparisons
            passed('six other research routes retain c43 geometry and actual viewport appearance without CSS leakage',{'scenes':len(comparisons)})
            assert errors==[] and blocked==[]
            passed('no browser page errors and no search/chat API requests or model calls')
            phase['functionalVerdict']='passed'
        except Exception as error:
            phase['functionalVerdict']='failed';phase['failure']={'type':type(error).__name__,'message':str(error)[:2000]}
            import traceback;traceback.print_exc()
            try: await capture('failure',False)
            except Exception: pass
            print('FAIL D02 '+str(error)[:900],flush=True)
        phase['pageErrors']=errors;phase['blockedApiPosts']=blocked
        await browser.close()
    phase['completedAt']=datetime.now(timezone.utc).isoformat()
    document['phases']['d02-final']=phase
    document['finalRelease']={'manifest':phase['manifest'],'inheritedManifest':inherited_manifest,'inheritedChecks':len(inherited['checks']),'affectedFunctionalVerdict':phase['functionalVerdict'],'visualVerdict':'pending manual D02 screenshot review'}
    REPORT.write_text(json.dumps(document,ensure_ascii=False,indent=2))
    print(json.dumps({'phase':'d02-final','manifest':phase['manifest'],'functionalVerdict':phase['functionalVerdict'],'inheritedChecks':len(inherited['checks']),'affectedChecks':len(phase['checks']),'screenshots':len(phase['snapshots']),'languageModelCalls':0,'report':str(REPORT)},ensure_ascii=False),flush=True)
    if phase['functionalVerdict']=='failed':raise SystemExit(1)

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--phase',choices=['before','after'],required=True)
    parser.add_argument('--url',default='http://127.0.0.1:8789/')
    parser.add_argument('--expected-manifest')
    parser.add_argument('--resume-finish',action='store_true')
    parser.add_argument('--supplement',action='store_true')
    parser.add_argument('--d02-target',action='store_true')
    args=parser.parse_args()
    if args.d02_target:
        await d02_target_acceptance(args)
        return
    password=(ROOT/'.runtime/pages-password').read_text().strip()
    document=json.loads(REPORT.read_text()) if REPORT.exists() else {'reviewer':'QA-DESIGN-20261109','baselineHead':'771684bfe45cece83ce08004a65c8c1dcac92d12','phases':{},'findings':[]}
    phase={'startedAt':datetime.now(timezone.utc).isoformat(),'url':args.url,'snapshots':{},'checks':[],'languageModelCalls':0,'visualVerdict':'requires human inspection'}
    if args.resume_finish or args.supplement:
        phase=document['phases']['after']
        phase.pop('failure',None)
        if args.resume_finish:
            phase['functionalVerdict']='continuing after screenshot comparison adaptation'
        phase['resumedAt']=datetime.now(timezone.utc).isoformat()
    errors=[]
    blocked=[]
    api_posts=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,permissions=['clipboard-read','clipboard-write'])
        page=await context.new_page()
        page.on('pageerror',lambda error: errors.append(str(error)))
        async def guard(route):
            if route.request.method=='POST':
                body=route.request.post_data_json or {}
                endpoint='chat' if '/api/chat' in route.request.url else 'search'
                safe=args.phase=='after' and ((endpoint=='search' and body.get('semantic') is False and body.get('expand') is False) or (endpoint=='chat' and body.get('message')=='数据库共有多少条记录？' and body.get('expand') is False))
                if not safe:
                    blocked.append(endpoint)
                    await route.abort()
                else:
                    api_posts.append(endpoint)
                    await route.continue_()
            else:
                await route.continue_()
        await context.route('**/api/search',guard)
        await context.route('**/api/chat',guard)
        await page.goto(args.url,wait_until='domcontentloaded')
        manifest=await page.locator('script[data-manifest]').get_attribute('data-manifest')
        phase['manifest']=manifest
        expected=args.expected_manifest or ('6421c8a18fb064ae7dc9' if args.phase=='before' else None)
        if expected and manifest != 'manifest-'+expected+'.json':
            raise AssertionError('Unexpected encrypted manifest: '+manifest)
        await unlock(page,password)
        if args.supplement:
            try:
                await supplemental_checks(page,context,phase,password,args)
            except Exception as error:
                phase['supplementalVerdict']='failed'
                phase['failure']={'type':type(error).__name__,'message':str(error)[:1800]}
                print('FAIL supplement '+type(error).__name__+': '+str(error)[:700],flush=True)
        elif args.resume_finish:
            try:
                await finish_checks(page,context,phase,password,args)
            except Exception as error:
                phase['functionalVerdict']='failed'
                phase['failure']={'type':type(error).__name__,'message':str(error)[:1800]}
                print('FAIL '+type(error).__name__+': '+str(error)[:700],flush=True)
        else:
            for width,height in SIZES:
                await page.set_viewport_size({'width':width,'height':height})
                for name,hash_,ready in ROUTES:
                    await page.evaluate('(hash)=>location.hash=hash',hash_)
                    await settle(page,ready)
                    key=f'{name}-{width}'
                    phase['snapshots'][key]=await snapshot(page,key,ARTIFACTS/args.phase)
                    print(f'SNAPSHOT {key}',flush=True)
            await page.set_viewport_size({'width':1440,'height':1000})
            await seed_project(page,password)
            for width,height in SIZES:
                await page.set_viewport_size({'width':width,'height':height})
                key=f'projects-filled-{width}'
                phase['snapshots'][key]=await snapshot(page,key,ARTIFACTS/args.phase)
                print(f'SNAPSHOT {key}',flush=True)
            if args.phase=='after':
                for width,height in SIZES:
                    await page.set_viewport_size({'width':width,'height':height})
                    for name,hash_,ready,content in [
                        ('evidence-reading-content','#/evidence?angle=clue&id=clue-1','#researchReadingMode','#researchReadingColumns'),
                        ('related-candidate-content','#/related?angle=social&id=social-1','#relatedCandidates','#relatedCandidates'),
                        ('plan-content','#/collection-plan','#collectionPlanList','#collectionPlanList'),
                        ('coverage-record-content','#/coverage','#coverageRecords','#coverageRecords'),
                        ('changes-empty-content','#/changes','#researchChangesList','#researchChangesList'),
                    ]:
                        await goto(page,hash_,ready)
                        target=page.locator(content)
                        await target.scroll_into_view_if_needed()
                        key=f'{name}-{width}'
                        phase['snapshots'][key]=await snapshot(page,key,ARTIFACTS/args.phase,reset_scroll=False)
                        print('CONTENT '+key,flush=True)
                    await goto(page,'#/projects?id=qa-design-fixture','#projectMaterials')
                    await page.locator('#projectMaterials').scroll_into_view_if_needed()
                    key=f'projects-material-content-{width}'
                    phase['snapshots'][key]=await snapshot(page,key,ARTIFACTS/args.phase,reset_scroll=False)
                try:
                    await functional_checks(page,context,phase,password,args)
                except Exception as error:
                    phase['functionalVerdict']='failed'
                    phase['failure']={'type':type(error).__name__,'message':str(error)[:1800]}
                    try:
                        phase['snapshots']['failure']=await snapshot(page,'failure',ARTIFACTS/args.phase,reset_scroll=False)
                    except Exception:
                        pass
                    print('FAIL '+type(error).__name__+': '+str(error)[:700],flush=True)
        phase['pageErrors']=errors
        phase['safeApiPosts']=phase.get('safeApiPosts',[])+api_posts
        phase['blockedApiPosts']=phase.get('blockedApiPosts',[])+blocked
        await browser.close()
    phase['completedAt']=datetime.now(timezone.utc).isoformat()
    if args.phase=='before':
        phase['functionalVerdict']='baseline capture only'
    document['phases'][args.phase]=phase
    REPORT.write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'phase':args.phase,'snapshots':len(phase['snapshots']),'manifest':phase['manifest'],'pageErrors':errors,'safeApiPosts':api_posts,'blockedApiPosts':len(blocked),'functionalVerdict':phase.get('functionalVerdict'),'report':str(REPORT)},ensure_ascii=False),flush=True)

    if phase.get('functionalVerdict')=='failed' or phase.get('supplementalVerdict')=='failed':
        raise SystemExit(1)

if __name__=='__main__':
    asyncio.run(main())
