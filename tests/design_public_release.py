#!/usr/bin/env python3
"""Independent verification of the published encrypted design release, on social.

PREPARE ONLY until the coordinator supplies PUBLIC READY and both exact values:
  ZGCLAB_DESIGN_EXPECTED_MANIFEST=manifest-<20 hex>.json
  ZGCLAB_DESIGN_EXPECTED_COMMIT=<full 40 hex commit>
  python3 tests/design_public_release.py

ZGCLAB_PUBLIC_VERIFY_URL optionally overrides the fixed GitHub Pages URL.
Each invocation creates an exclusive directory below
/home/ubuntu/log/zgclab-ui-design-20261109/public/. No Git commands, build,
provider changes, raw-data writes, model generation, tracing, or HAR recording.
Only the exact previously verified Arkansas count question may reach /api/chat;
/api/search and every other business mutation are blocked and fail the review.
All workspace edits use disposable browser contexts. Passwords stay in memory.
"""
from __future__ import annotations

import base64
import csv
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

ROOT = Path('/home/ubuntu/zgclab-1-web')
BUILD_INPUT = ROOT / 'reports/research-design-build-inputs-20261109.json'
PUBLIC_URL = 'https://co-minder.github.io/zgclab-data-page-1/'
ARTIFACT_ROOT = Path('/home/ubuntu/log/zgclab-ui-design-20261109/public')
QUESTION = '阿肯色州立大学有多少条资料？'
SOURCE_VERSION = 'f064c896c123cbf4'
RESEARCH_VERSION = 'a8acd9d0b712fbe06a65'
TOTALS = {'news': 3675, 'clue': 1468, 'social': 1846}
ORIGINAL = 'A-State Faces Setback in High-Scoring Matchup Versus South Alabama, 56-49 https://t.co/4uChDuOQVI'
ORIGINAL_URL = 'https://x.com/ArkansasState/status/2108426110039908459'
SIZES = [(1440, 1000), (390, 844), (768, 1024)]
PROVENANCE_LABELS = [
    '快照记录 ID', '数据版本', '研究侧车版本', '原文 URL', '发布字段原值', '日期状态',
    '恢复日期', '日期恢复依据', '日期恢复身份校验', '日期恢复原始候选', '未恢复 / 恢复原因',
    '采集时间', '发现时间', '采集 / 发布来源', '原文对象哈希', '哈希字段 / 算法',
    'manifest / 报告路径', '日期恢复来源', '原始对象路径', '缺失原因',
]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def id_digest(values):
    return digest(('\n'.join(sorted(values)) + '\n').encode())


def load_assignment(path):
    source = path.read_text(encoding='utf-8')
    return json.loads(source.split('=', 1)[1].strip().rstrip(';'))


def parts(value):
    return [p.strip() for p in re.split(r'\n\s*\n|\n', str(value or '').replace('\r\n', '\n').replace('\r', '\n')) if p.strip()]


def structured(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')) if isinstance(value, (dict, list)) else str(value or '')


class Reference:
    """Read immutable delivery values independently of application JS functions."""
    def __init__(self):
        self.meta = load_assignment(ROOT / 'data/meta.js')
        self.research = load_assignment(ROOT / 'data/research.js')
        self.rows = {angle: load_assignment(ROOT / ('data/' + angle + '.js')) for angle in TOTALS}
        self.by_id = {row['id']: (angle, row) for angle, rows in self.rows.items() for row in rows}
        self.records = self.research['records']
        self.ids = set(self.by_id)
        self.recovered = {key for key, value in self.records.items() if value['publication']['status'] == 'recovered'}
        self.placeholders = {key for key, value in self.records.items() if value['translation']['status'] == 'placeholder'}
        self.missing = {key for key, (_, row) in self.by_id.items() if not row.get('publish_time')}
        self.unresolved = {key for key, value in self.records.items() if not value['publication'].get('effective')}
        self.cells = self.research['coverage']['cells']
        self.institutions = {str(row['ktid']): row['cn'] for row in self.meta['institutions']}
        self.detail_cache = {}

    def fields(self, identifier):
        entry = self.records[identifier]
        chunk = str(entry['angle']) + '-' + str(entry['evidence']['chunk'])
        if chunk not in self.detail_cache:
            self.detail_cache[chunk] = {row['id']: row['fields'] for row in load_assignment(ROOT / 'data/details' / SOURCE_VERSION / (chunk + '.js'))}
        return self.detail_cache[chunk][identifier]


class Review:
    def __init__(self, manifest, commit, base):
        self.manifest_name, self.commit, self.base = manifest, commit, base
        self.run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:10]
        self.out = ARTIFACT_ROOT / self.run_id
        self.out.mkdir(parents=True, exist_ok=False)
        self.password = ''
        self.page = self.browser = self.context = None
        self.active = 'initialization'
        self.ref = None
        self.project_id = ''
        self.allowed_posts = []
        self.business_responses = []
        self.report = {
            'reviewer': 'PUBLIC-DESIGN-20261109', 'phase': 'published-design',
            'started_at': datetime.now(timezone.utc).isoformat(), 'target': base,
            'expected_manifest': manifest, 'expected_commit': commit,
            'script_sha256': digest(Path(__file__).read_bytes()), 'run_id': self.run_id,
            'artifact_directory': str(self.out), 'checks': [], 'screenshots': [],
            'page_errors': [], 'console_errors': [], 'api_failures': [],
            'blocked_business_requests': [], 'model_business_requests': 0,
            'limitations': [
                'Screenshots and geometry support human design review; no automated aesthetic verdict.',
                'Model availability is checked against returned status; no model generation is tested.',
                'Immutable commit files and encrypted design asset hashes bind content to the supplied commit; Pages does not expose its deployment commit in the document.',
            ],
        }

    def safe(self, value):
        if isinstance(value, dict):
            return {key: '[REDACTED]' if re.fullmatch(r'password|authorization|(?:access_)?token|api[_-]?key|cookie', str(key), re.I) else self.safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [self.safe(item) for item in value]
        if isinstance(value, str) and self.password:
            return value.replace(self.password, '[REDACTED]')
        return value

    def save_json(self, filename, value):
        text = json.dumps(self.safe(value), ensure_ascii=False, indent=2) + '\n'
        require(not self.password or self.password not in text, 'Secret appeared in an artifact')
        target = self.out / filename
        require(not target.exists(), 'Artifact filename must be exclusive')
        target.write_text(text, encoding='utf-8')
        return str(target)

    def run(self, name, action):
        self.active = name
        try:
            evidence = action()
            self.report['checks'].append({'name': name, 'status': 'PASS', 'evidence': evidence})
            print('PASS ' + name, flush=True)
            return True
        except Exception as error:
            item = {'name': name, 'status': 'FAIL', 'error': self.safe(str(error)), 'type': type(error).__name__}
            if self.page and not self.page.is_closed():
                try:
                    item['screenshot'] = self.shot('failure-' + str(len(self.report['checks']) + 1))
                except Exception:
                    pass
            self.report['checks'].append(item)
            print('FAIL ' + name + ': ' + self.safe(str(error))[:500], flush=True)
            return False

    def local_build(self):
        self.build = json.loads(BUILD_INPUT.read_text())
        require(self.build.get('stage') == 'final_design_build', 'Expected the design build input record')
        require(self.build['manifest'] == self.manifest_name, 'Expected manifest differs from the final design build record')
        require(self.build['manifest_version'] == self.manifest_name[9:-5], 'Design manifest ID mismatch')
        source_hashes = {name: digest((ROOT / name).read_bytes()) for name in self.build['source_sha256']}
        require(source_hashes == self.build['source_sha256'], 'Design sources changed after the frozen build')
        self.manifest_bytes = (ROOT / 'docs' / self.manifest_name).read_bytes()
        self.manifest = json.loads(self.manifest_bytes)
        require(len(self.manifest['assets']) == self.build['asset_count'] == 418, 'Encrypted asset count changed')
        require(self.manifest['version'] == self.build['manifest_version'], 'Encrypted manifest version differs')
        require(self.manifest['cipher'] == 'AES-256-GCM' and self.manifest['kdf'] == 'PBKDF2-SHA256' and self.manifest['iterations'] == 600000, 'Published encryption parameters changed')
        require(self.build.get('source_injected') is False, 'Build was marked as injected')
        self.ref = Reference()
        require(self.ref.meta['version'] == SOURCE_VERSION and self.ref.research['version'] == RESEARCH_VERSION, 'Reference snapshot versions changed')
        require({a: len(rows) for a, rows in self.ref.rows.items()} == TOTALS, 'Reference record totals changed')
        require(len(self.ref.ids) == len(self.ref.records) == 6989, 'Reference IDs are missing or duplicated')
        require(len(self.ref.cells) == 120 and len(self.ref.recovered) == 626 and len(self.ref.placeholders) == 325, 'Reference research counts changed')
        require(len(self.ref.missing) == 1018 and len(self.ref.unresolved) == 392, 'Reference date gap counts changed')
        self.password = (ROOT / '.runtime/pages-password').read_text().rstrip('\r\n')
        require(bool(self.password), 'Existing site password is empty')
        return {'build_input': str(BUILD_INPUT), 'build_input_sha256': digest(BUILD_INPUT.read_bytes()), 'manifest_sha256': digest(self.manifest_bytes), 'asset_count': 418, 'source_sha256': source_hashes}

    def install_guard(self, context):
        def guard(route):
            request = route.request
            path = urlsplit(request.url).path.rstrip('/')
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                route.continue_()
                return
            if path == '/api/session' and request.method == 'POST':
                # Authentication payload/token are never captured or reported.
                route.continue_()
                return
            if '/api/' not in path:
                self.report['blocked_business_requests'].append({'method': request.method, 'path': path, 'reason': 'Unexpected mutation'})
                route.abort()
                return
            try:
                body = request.post_data_json or {}
            except Exception:
                body = {}
            safe = (
                request.method == 'POST' and path == '/api/chat' and len(self.allowed_posts) == 0
                and isinstance(body, dict) and set(body) <= {'message', 'history', 'filters', 'expand', 'semantic'}
                and body.get('message') == QUESTION and body.get('expand') is False
                and body.get('semantic', False) is False and body.get('history') == []
                and body.get('filters') == {'date_field': 'published_at', 'institution': [1002550]}
            )
            if not safe:
                self.report['blocked_business_requests'].append({'method': request.method, 'path': path, 'reason': 'Only the fixed count question with expansion disabled is allowed'})
                route.abort()
                return
            self.allowed_posts.append({'method': 'POST', 'path': path, 'question': QUESTION, 'expand': False, 'institution': [1002550]})
            route.continue_()
        context.route('**/*', guard)

    def attach_page(self, page):
        page.set_default_timeout(30000)
        page.on('pageerror', lambda error: self.report['page_errors'].append(self.safe(str(error))))
        page.on('console', lambda message: self.report['console_errors'].append(self.safe(message.text)) if message.type == 'error' else None)
        def response_seen(response):
            path = urlsplit(response.url).path
            if '/api/' in path and response.status >= 400:
                self.report['api_failures'].append({'path': path, 'status': response.status})
        def request_failed(request):
            path = urlsplit(request.url).path
            if '/api/' in path:
                self.report['api_failures'].append({'path': path, 'failure': self.safe(request.failure)})
        page.on('response', response_seen)
        page.on('requestfailed', request_failed)

    def settle(self, ready):
        self.page.locator(ready).wait_for(state='attached', timeout=60000)
        self.page.wait_for_function("() => document.querySelector('#view') && ![...document.querySelectorAll('#view .skeleton')].some(el=>el.getClientRects().length)", timeout=60000)
        self.page.evaluate('document.fonts.ready')
        self.page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

    def goto(self, hash_, ready):
        route_name = hash_.removeprefix('#/').split('?', 1)[0].split('/', 1)[0]
        active_route = 'explore' if route_name == 'record' else route_name
        self.page.evaluate("hash=>new Promise(resolve=>{if(location.hash===hash){resolve();return;}addEventListener('hashchange',()=>resolve(),{once:true});location.hash=hash;})", hash_)
        self.page.wait_for_function('(name)=>document.body.dataset.route===name', arg=active_route)
        self.settle(ready)

    def unlock(self, page=None):
        page = page or self.page
        page.locator('#accessForm').wait_for(state='visible')
        page.locator('#accessPassword').fill(self.password)
        page.locator('#accessSubmit').click()
        page.locator('#view').wait_for(state='visible', timeout=60000)
        page.locator('#lockSession').wait_for()

    def reveal(self, target):
        for panel in ('report', 'materials'):
            ancestor = target.locator('xpath=ancestor::*[@id="project' + panel.capitalize() + 'Panel"]')
            if ancestor.count() and not target.is_visible():
                self.page.locator('[data-project-panel="' + panel + '"]').click()
        for detail in target.locator('xpath=ancestor::details').all():
            if not detail.evaluate('(el)=>el.open'):
                detail.locator(':scope > summary').click()

    def click(self, selector):
        target = self.page.locator(selector)
        self.reveal(target)
        target.click()

    def open_disclosure(self, selector):
        detail = self.page.locator(selector)
        detail.wait_for(state='attached')
        self.reveal(detail)
        require(not detail.evaluate('(el)=>el.open'), 'Technical details should be collapsed initially: ' + selector)
        summary = detail.locator(':scope > summary')
        require(summary.is_visible(), 'Technical summary is unreachable: ' + selector)
        summary.click()
        require(detail.evaluate('(el)=>el.open'), 'Actual summary did not expand technical details')
        require(detail.locator(':scope > :not(summary)').first.is_visible(), 'Expanded technical content remains hidden')
        return detail

    def facts(self, detail):
        values = detail.locator('dl > div').evaluate_all('nodes=>nodes.map(n=>[n.querySelector("dt")?.innerText.trim(),n.querySelector("dd")?.innerText.trim()])')
        require(all(key and value for key, value in values), 'A technical field disappeared or lost its missing-value label')
        return dict(values)

    def shot(self, name):
        target = self.out / (name + '.png')
        require(not target.exists(), 'Screenshot name must be exclusive')
        self.page.screenshot(path=str(target), full_page=False, mask=[self.page.locator('input[type=password],#accessPassword,#asServicePassword')])
        require(target.stat().st_size > 1000, 'Screenshot is empty')
        size = self.page.viewport_size
        self.report['screenshots'].append({'name': name, 'path': str(target), 'viewport': size, 'full_page': False})
        return str(target)

    def download(self, selector, filename):
        with self.page.expect_download() as event:
            self.click(selector)
        item = event.value
        data = Path(item.path()).read_bytes()
        require(self.password.encode() not in data, 'Password appeared in browser export')
        target = self.out / filename
        require(not target.exists(), 'Export filename must be exclusive')
        target.write_bytes(data)
        return data

    def workspace(self, page=None):
        return (page or self.page).evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')||'{}')")

    def public_identity(self):
        response = self.page.goto(self.base + '#/overview', wait_until='domcontentloaded')
        require(response is not None and response.status == 200, 'Public page request failed')
        loaded = urlsplit(self.page.url)
        require(urlunsplit((loaded.scheme, loaded.netloc, loaded.path, '', '')) == self.base, 'Public verification redirected to a different site or package')
        actual = self.page.locator('script[data-manifest]').get_attribute('data-manifest')
        self.report['actual_manifest'] = actual
        require(actual == self.manifest_name, 'Public site still serves a different encrypted manifest: ' + str(actual))
        require(self.page.locator('#accessForm').is_visible() and self.page.locator('#view').count() == 0, 'Fresh public document did not require authentication')
        remote = self.context.request.get(urljoin(self.base, self.manifest_name), timeout=45000)
        require(remote.status == 200 and remote.body() == self.manifest_bytes, 'Public manifest differs from the frozen design manifest bytes')
        commit_base = 'https://raw.githubusercontent.com/co-minder/zgclab-data-page-1/' + self.commit + '/docs/'
        index_response = self.context.request.get(commit_base + 'index.html', timeout=45000)
        commit_manifest = self.context.request.get(commit_base + self.manifest_name, timeout=45000)
        require(index_response.status == 200 and commit_manifest.status == 200, 'Supplied immutable release commit cannot be read')
        match = re.search(r'data-manifest="([^"]+)"', index_response.text())
        require(match and match.group(1) == actual, 'Supplied commit does not reference the public design manifest')
        require(commit_manifest.body() == self.manifest_bytes, 'Supplied commit has different encrypted manifest bytes')
        self.report['release_commit'] = self.commit
        # Verify actual published design sources in memory against build hashes.
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(self.manifest['salt']), iterations=self.manifest['iterations']).derive(self.password.encode())
        verified = {}
        for name, expected in self.build['source_sha256'].items():
            asset = self.manifest['assets'][name]
            response = self.context.request.get(urljoin(self.base, asset), timeout=45000)
            require(response.status == 200, 'Published design asset could not be fetched: ' + name)
            encrypted = response.body()
            require(digest(encrypted) == Path(asset).stem, 'Published ciphertext filename hash mismatch: ' + name)
            plain = gzip.decompress(AESGCM(key).decrypt(encrypted[:12], encrypted[12:], name.encode()))
            require(digest(plain) == expected, 'Published decrypted source differs from final design build: ' + name)
            verified[name] = expected
        del key, plain
        self.unlock()
        self.settle('#view h1')
        return {'manifest': actual, 'manifest_sha256': digest(self.manifest_bytes), 'commit': self.commit, 'published_source_hashes': verified, 'fresh_document_password_required': True}

    def real_snapshot(self):
        self.goto('#/explore?angle=all', '#exCount')
        self.page.wait_for_function("()=>!!document.querySelector('#exCount')?.dataset.query && ['NEWS','CLUE','SOCIAL'].every(angle=>Array.isArray(window['ZGCLAB_'+angle]))")
        actual = self.page.evaluate("({version:ZGCLAB_META.version,total:ZGCLAB_NEWS.length+ZGCLAB_CLUE.length+ZGCLAB_SOCIAL.length,counts:{news:ZGCLAB_NEWS.length,clue:ZGCLAB_CLUE.length,social:ZGCLAB_SOCIAL.length},ids:[...ZGCLAB_NEWS,...ZGCLAB_CLUE,...ZGCLAB_SOCIAL].map(r=>r.id)})")
        require(actual['version'] == SOURCE_VERSION and actual['counts'] == TOTALS and actual['total'] == 6989, 'Published real-data snapshot changed')
        require(len(actual['ids']) == 6989 and set(actual['ids']) == self.ref.ids, 'Published record IDs differ from the real snapshot')
        require(not self.page.locator('#includeSimulation').is_checked(), 'Simulation was enabled by default')
        return {'records': 6989, 'by_angle': TOTALS, 'id_sha256': id_digest(actual['ids']), 'simulation_default': False}

    def service_status(self):
        with self.page.expect_response(lambda r: urlsplit(r.url).path == '/api/status' and r.request.method == 'GET', timeout=45000) as event:
            self.goto('#/assistant?mode=chat&ids=1002550&expand=0&semantic=0', '#asQuestion')
        response = event.value
        require(response.status == 200, 'Actual public service status request failed')
        status = response.json()
        status = status.get('data', status) if isinstance(status.get('data'), dict) else status
        snapshot = status.get('snapshot', {})
        require(snapshot.get('source_version') == SOURCE_VERSION and snapshot.get('research_version') == RESEARCH_VERSION and snapshot.get('total') == 6989, 'Public assistant connects to a different database snapshot')
        self.page.locator('#asServiceStatus .as-model-status').wait_for(state='attached')
        target = self.page.locator('#asServiceStatus .as-model-status')
        self.reveal(target)
        require(target.is_visible(), 'Actual model state is not visible in the service panel')
        rendered = target.inner_text()
        llm = status.get('llm') or status.get('model') or {}
        require(isinstance(llm, dict), 'Service did not report structured model state')
        available, state = llm.get('available'), llm.get('state') or llm.get('status') or ''
        model = llm.get('model') or llm.get('id') or ''
        if isinstance(model, dict):
            model = model.get('name') or model.get('id') or model.get('model') or model.get('model_id') or ''
        if available is True:
            require('模型可用' in rendered, 'Available model state is not rendered')
        elif available is False:
            require('模型暂不可用' in rendered or '模型不可用' in rendered, 'Offline model was presented as available')
            require('模型可用：' not in rendered, 'Offline service falsely claims model availability')
        else:
            require('状态尚未报告' in rendered or '状态未知' in rendered, 'Unknown model state was presented as available')
        require(not state or state in rendered, 'Returned model state is missing from the visible status')
        display = 'DeepSeek V4.1 Flash' if re.search(r'(?:^|/)deepseek-v4\.1-flash$', str(model), re.I) else str(model)
        require(not display or available is False or display in rendered, 'Returned actual model name is missing')
        require('6,989' in self.page.locator('#asServiceStatus').inner_text(), 'Database count is not displayed')
        detail = self.open_disclosure('#asServiceStatus .as-service-details')
        require(SOURCE_VERSION in detail.inner_text(), 'Expanded service details lost source version')
        return {'snapshot': {k: snapshot.get(k) for k in ('schema_version', 'source_version', 'research_version', 'total')}, 'model_available': available, 'model_state': state, 'model': model, 'visible_model_status': rendered}

    def exact_count(self):
        self.goto('#/assistant?mode=chat&ids=1002550&expand=0&semantic=0', '#asQuestion')
        self.page.locator('#asServiceStatus .as-model-status').wait_for(state='attached', timeout=45000)
        keep = self.page.locator('#asKeep')
        self.reveal(keep)
        keep.check()
        require(not self.page.locator('#asExpand').is_checked() and not self.page.locator('#asSemantic').is_checked(), 'Count request still enables model understanding')
        self.page.locator('#asQuestion').fill(QUESTION)
        with self.page.expect_response(lambda r: urlsplit(r.url).path == '/api/chat' and r.request.method == 'POST', timeout=45000) as event:
            self.page.locator('#asSubmit').click()
        response = event.value
        require(response.status == 200, 'Published database count request failed')
        payload = response.json()
        model = payload.get('model', {})
        self.business_responses.append({'path': '/api/chat', 'state': payload.get('state'), 'used': model.get('used'), 'attempted': model.get('attempted')})
        require(payload.get('state') == 'database_answer' and model.get('used') is False and model.get('attempted') is False, 'Count answer used or attempted a model, or substituted local retrieval')
        aggregates = payload.get('aggregates', {})
        expected = {'news': 100, 'clue': 120, 'social': 1}
        require(aggregates.get('matched', {}).get('total') == aggregates.get('scoped', {}).get('total') == 221, 'Exact Arkansas database count is not 221')
        require(aggregates['matched']['by_angle'] == expected and aggregates['scoped']['by_angle'] == expected, 'Arkansas count distribution changed')
        self.page.wait_for_function("()=>!document.querySelector('#asSubmit').disabled && !!document.querySelector('#asTranscript [data-as-citation=A1]')", timeout=45000)
        transcript = self.page.locator('#asTranscript')
        require('221' in transcript.inner_text() and '数据库精确统计' in transcript.inner_text() and '未调用大模型' in transcript.inner_text(), 'Exact-count provenance is missing from the visible answer')
        transcript.locator('.as-citation-ref').filter(has_text='[A1]').first.click()
        require(self.page.evaluate("document.activeElement?.dataset.asCitation") == 'A1', 'A1 citation click did not move keyboard focus')
        aggregate = transcript.locator('[data-as-citation=A1]')
        self.reveal(aggregate)
        require(aggregate.is_visible(), 'Focused aggregate citation remains hidden')
        return {'state': payload['state'], 'count': 221, 'by_angle': expected, 'model_used': False, 'model_attempted': False, 'citation_focus': 'A1', 'saved_chat': bool(self.workspace().get('chatSessions'))}

    def evidence(self):
        self.goto('#/evidence?angle=social&id=social-1', '#researchReadingMode')
        original = self.page.locator('#research-original-1 p').text_content()
        require(original == ORIGINAL == self.ref.fields('social-1')['original_content'], 'Social-1 original text changed or was truncated')
        require(not self.page.locator('#retryEvidenceDetail').count(), 'Full source detail failed to load')
        self.click('[data-copy-paragraph="original-1"]')
        copied = self.page.evaluate('navigator.clipboard.readText()')
        require(all(value in copied for value in (ORIGINAL, ORIGINAL_URL, SOURCE_VERSION, 'social/social-1', 'p=original-1')), 'Copied citation lost literal source, stable ID, paragraph or data version')
        detail = self.open_disclosure('#researchBody details.research-provenance:last-of-type')
        facts = self.facts(detail)
        require(set(PROVENANCE_LABELS) <= set(facts), 'Folded provenance lost original fields')
        fields = self.ref.fields('social-1')
        expected = {'快照记录 ID': 'social-1', '数据版本': SOURCE_VERSION, '研究侧车版本': RESEARCH_VERSION, '原文 URL': ORIGINAL_URL, '发布字段原值': fields['publish_time'], '采集时间': fields['collected_time'], '原文对象哈希': fields['content_hash']}
        require(all(facts.get(k) == v for k, v in expected.items()), 'Expanded provenance contains different source facts')
        require('交付未声明算法' in facts['哈希字段 / 算法'], 'Hash algorithm caveat disappeared')
        require(facts['manifest / 报告路径'] == (fields.get('report_path') or '未提供'), 'Missing manifest/report path was fabricated or dropped')
        self.page.locator('#researchReadingMode').select_option('translation')
        require(self.page.locator('[data-reading=original]').is_hidden(), 'Translation reading mode did not switch')
        self.page.locator('#researchReadingMode').select_option('parallel')
        self.click('[data-copy-paragraph="translation-1"]')
        translated_citation = self.page.evaluate('navigator.clipboard.readText()')
        require(ORIGINAL in translated_citation and '未核验逐段对应' in translated_citation, 'Translation citation lost original text or alignment caveat')
        self.click('#markEvidenceRead')
        self.page.locator('[data-paragraph-anchor="original-1"]').click()
        require(self.page.evaluate('document.activeElement.id') == 'research-original-1', 'Paragraph link lost focus behavior')
        return {'record': 'social-1', 'original_sha256': digest(original.encode()), 'copied_source_url': ORIGINAL_URL, 'source_version': SOURCE_VERSION, 'provenance_fields': facts}

    def research_ids(self):
        actual = self.page.evaluate("() => { const r=ZGCLAB_RESEARCH;return {version:r.version,ids:Object.keys(r.records),recovered:Object.entries(r.records).filter(([id,x])=>x.publication.status==='recovered').map(([id])=>id),placeholders:Object.entries(r.records).filter(([id,x])=>x.translation.status==='placeholder').map(([id])=>id),cells:r.coverage.cells}; }")
        require(actual['version'] == RESEARCH_VERSION and set(actual['ids']) == self.ref.ids, 'Published research record IDs differ')
        require(set(actual['recovered']) == self.ref.recovered and len(actual['recovered']) == 626, 'Date recovery ID set changed')
        require(set(actual['placeholders']) == self.ref.placeholders and len(actual['placeholders']) == 325, 'Translation placeholder ID set changed')
        require(actual['cells'] == self.ref.cells and len(actual['cells']) == 120, 'Published observation cells changed')
        identifier = sorted(self.ref.recovered)[0]
        self.goto('#/evidence?angle=social&id=' + identifier, '#researchReadingMode')
        facts = self.facts(self.open_disclosure('#researchBody details.research-provenance:last-of-type'))
        publication = self.ref.records[identifier]['publication']
        require(facts['恢复日期'] == publication['effective'] and facts['发布字段原值'] == '未提供', 'Recovered date overwrote original missing publication date')
        require('校验' in facts['日期状态'] and 'raw_json.' in facts['日期恢复原始候选'], 'Recovered date lost identity/date evidence')
        require(facts['日期恢复依据'] == structured(publication['basis']) and facts['日期恢复身份校验'] == structured(publication['identity']), 'Recovered date basis or identity changed')
        placeholder = sorted(key for key in self.ref.placeholders if key.startswith('clue-'))[0]
        self.goto('#/evidence?angle=clue&id=' + placeholder, '#researchReadingMode')
        require('占位' in self.page.locator('[data-reading=translation]').inner_text() and self.page.locator('.research-warning[role=status]').is_visible(), 'Placeholder text was presented as verified translation')
        self.click('[data-copy-paragraph="translation-1"]')
        require('不可作译文引用' in self.page.evaluate('navigator.clipboard.readText()'), 'Placeholder citation lost its restriction')
        return {'recovered_count': 626, 'recovered_id_sha256': id_digest(actual['recovered']), 'placeholder_count': 325, 'placeholder_id_sha256': id_digest(actual['placeholders']), 'observation_cells': 120, 'recovered_example': identifier, 'placeholder_example': placeholder}

    def projects(self):
        self.goto('#/projects', '#projectsNew')
        trigger = self.page.locator('#projectsNew')
        trigger.focus()
        self.page.keyboard.press('Enter')
        dialog = self.page.locator('dialog.projects-dialog[open]')
        dialog.wait_for(state='visible')
        require(dialog.evaluate('(el)=>el.matches(":modal")'), 'Project editor is not a native modal')
        targets = [node for node in dialog.locator('button,input,textarea,select,summary,a[href]').all() if node.is_visible() and node.is_enabled() and node.evaluate('(el)=>el.tabIndex>=0')]
        require(len(targets) >= 3, 'Project modal has no keyboard-reachable form')
        targets[-1].focus()
        self.page.keyboard.press('Tab')
        require(dialog.evaluate('(el)=>el.contains(document.activeElement)'), 'Forward Tab escaped the project modal')
        targets[0].focus()
        self.page.keyboard.press('Shift+Tab')
        require(dialog.evaluate('(el)=>el.contains(document.activeElement)'), 'Reverse Tab escaped the project modal')
        self.page.keyboard.press('Escape')
        require(trigger.evaluate('(el)=>el===document.activeElement'), 'Escape did not restore the project trigger focus')
        trigger.click()
        dialog = self.page.locator('dialog.projects-dialog[open]')
        name = '线上设计验收 ' + self.run_id
        dialog.locator('[name=name]').fill(name)
        dialog.locator('[name=description]').fill('独立线上验收；仅此临时浏览器保存。')
        dialog.locator('button[type=submit]').click()
        self.page.locator('#projectMaterialCount').wait_for()
        self.project_id = next(row['id'] for row in self.workspace()['projects'] if row['name'] == name)
        self.goto('#/record/social/social-1', '#addRecordProject')
        self.click('#addRecordProject')
        dialog = self.page.locator('dialog.projects-dialog[open]')
        dialog.locator('select[name=project]').select_option(self.project_id)
        dialog.locator('button[type=submit]').click()
        self.page.wait_for_function("id=>JSON.parse(localStorage.getItem('zgclab.workspace.v1')).projects.find(p=>p.id===id)?.items.some(x=>x.id==='social-1')", arg=self.project_id)
        self.goto('#/projects?id=' + self.project_id, '#projectMaterials')
        note = self.page.locator('[data-material="social:social-1"] [data-item-field=note]')
        self.reveal(note)
        note.fill('线上核验：保留逐字原文、来源与资料版本。')
        note.blur()
        self.click('#projectGenerateReport')
        self.page.wait_for_function("()=>!!document.querySelector('#projectMarkdown')?.value && document.querySelector('#projectCancelReport')?.hidden", timeout=45000)
        markdown = self.page.locator('#projectMarkdown').input_value()
        require(all(text in markdown for text in ('social-1', SOURCE_VERSION, ORIGINAL_URL)), 'Local citation draft lost record/source/version')
        exported = json.loads(self.download('#projectExportJson', 'project-backup.json').decode('utf-8-sig'))
        project = next(row for row in exported['projects'] if row['id'] == self.project_id)
        require(project['items'][0]['id'] == 'social-1' and project['items'][0]['note'].startswith('线上核验'), 'Project JSON export lost material or annotation')
        require(project['report']['markdown'] == markdown, 'Project backup lost the editable sourced report')
        return {'created_project_id': self.project_id, 'materials': len(project['items']), 'keyboard_trap_both_directions': True, 'escape_focus_restored': True, 'report_generation': 'local template; no model request', 'report_sha256': digest(markdown.encode())}

    def related(self):
        self.goto('#/related?angle=social&id=social-1', '#relatedCount')
        require('候选' in self.page.locator('#relatedCount').inner_text(), 'Related page lost candidate status')
        field = self.page.locator('#relationGroupName')
        self.reveal(field)
        field.fill('线上验收资料分组')
        self.click('#createRelationGroup')
        self.page.locator('#manualRelationAngle').select_option('clue')
        self.page.locator('#manualRelationId').fill('clue-1')
        self.click('#addManualRelation')
        records = self.workspace()['relations'][0]['records']
        require({(row['angle'], row['id']) for row in records} == {('social', 'social-1'), ('clue', 'clue-1')}, 'Manual source grouping lost real stable IDs')
        require(self.page.locator('#relationSaved a[href*="id=clue-1"]').is_visible(), 'Saved related record is not reachable')
        return {'human_grouping': True, 'records': records}

    def changes(self):
        self.goto('#/changes', '#researchChangesCount')
        require(re.search(r'完整快照共\s*0\s*条变化', self.page.locator('#researchChangesCount').inner_text()), 'First view reported historical records as new changes')
        coverage = self.page.locator('#researchFingerprintCoverage')
        require(coverage.get_attribute('data-full-fingerprint-count') == coverage.get_attribute('data-record-count') == '6989', 'Full-text fingerprint coverage is incomplete')
        baseline = self.workspace()['researchChanges']['real']['baseline']
        require(baseline['total'] == baseline['fullFingerprintCount'] == len(baseline['records']) == 6989 and baseline.get('compact') is True, 'Saved baseline lost full fingerprints')
        require(set(baseline['records']) == {angle + ':' + key for key, (angle, _) in self.ref.by_id.items()}, 'Saved baseline IDs differ from the real snapshot')
        self.click('#saveChangeSubscription')
        self.service_disclosure('#researchServiceStatus')
        return {'changes': 0, 'baseline_records': 6989, 'full_fingerprints': 6989, 'record_key_sha256': id_digest(baseline['records'])}

    def service_disclosure(self, selector):
        self.page.locator(selector + ' .research-service-details').wait_for(state='attached', timeout=45000)
        detail = self.open_disclosure(selector + ' .research-service-details')
        facts = self.facts(detail)
        require(facts.get('当前快照') == SOURCE_VERSION and '最近记录采集字段' in facts and '最近发现字段' in facts and '采集任务证据' in facts, 'Folded service facts lost source/date/collection boundaries')
        require(facts.get('检索库资料版本') == SOURCE_VERSION and facts.get('检索库研究元数据版本') == RESEARCH_VERSION, 'Research service state is unavailable or version differs')
        return facts

    def coverage(self):
        self.goto('#/coverage', '#coverageSummary')
        summary = self.page.locator('#coverageSummary').inner_text()
        require(re.search(r'120\s*/\s*120', summary) and '626' in summary and '325' in summary, 'Coverage summary lost real cell/recovery/placeholder counts')
        matrix = self.page.locator('.research-matrix-disclosure')
        require(not matrix.evaluate('(el)=>el.open'), 'Technical matrix should start folded')
        matrix.locator(':scope > summary').click()
        require(self.page.locator('#coverageMatrix table').is_visible(), 'Actual matrix summary did not reveal the table')
        matrix_rows = self.page.locator('#coverageMatrix tbody tr').evaluate_all('rows=>rows.map(row=>({name:row.querySelector("th").innerText.trim(),values:[...row.querySelectorAll("td")].map(td=>td.innerText.trim())}))')
        columns = list(dict.fromkeys((cell['angle'], cell.get('platform')) for cell in self.ref.cells))
        inst_ids = list(dict.fromkeys(str(cell['ktid']) for cell in self.ref.cells))
        require(len(matrix_rows) == len(inst_ids) == 20 and sum(len(row['values']) for row in matrix_rows) == 120, 'Matrix omitted institution/source observation cells')
        for row, ktid in zip(matrix_rows, inst_ids):
            require(row['name'] == self.ref.institutions[ktid], 'Matrix institution identity changed')
            expected = []
            for angle, platform in columns:
                cell = next((c for c in self.ref.cells if str(c['ktid']) == ktid and c['angle'] == angle and c.get('platform') == platform), None)
                expected.append(f"{cell['count']:,}" if cell else '—')
            require(row['values'] == expected, 'Matrix cell counts differ for institution ' + ktid)
        exports = {}
        for issue, identifiers in [('publish_time', self.ref.missing), ('effective_date', self.ref.unresolved), ('translation', self.ref.placeholders), ('sources', self.ref.ids)]:
            self.page.locator('#coverageIssue').select_option(issue)
            text = self.page.locator('#researchCoverageCount').inner_text()
            if issue != 'sources':
                require(re.search(r'缺失\s*' + f'{len(identifiers):,}' + r'\s*条', text), 'Coverage issue count differs: ' + issue)
            records = list(csv.DictReader(io.StringIO(self.download('#exportCoverage', 'coverage-' + issue + '.csv').decode('utf-8-sig'))))
            require(len(records) == len(identifiers) and {r['记录ID'] for r in records} == identifiers, 'Coverage export IDs differ: ' + issue)
            require(all(row['数据版本'] == SOURCE_VERSION and row['证据链接'] for row in records), 'Coverage export lost source version or evidence links')
            if issue == 'sources':
                for row in records:
                    p = self.ref.records[row['记录ID']]['publication']
                    require(row['发布时间原值'] == p['original'] and row['恢复日期'] == (p['effective'] if p['status'] == 'recovered' else ''), 'Date recovery export overwrote original publication fields')
            exports[issue] = {'count': len(records), 'id_sha256': id_digest(identifiers)}
        facts = self.service_disclosure('#coverageServiceStatus')
        return {'observation_cells': 120, 'matrix_rows': 20, 'exports': exports, 'service_facts': facts}

    def plan(self):
        self.goto('#/collection-plan', '#collectionPlanCount')
        options = self.page.locator('#planCategory option').evaluate_all('els=>els.map(el=>el.value)')
        require(set(options) == {'all', 'integrity', 'coverage', 'documents', 'relations'}, 'Collection plan lost one of four categories')
        cards = self.page.locator('#collectionPlanList .research-plan-card')
        require(cards.count() == 10 and self.page.locator('#collectionPlanList .research-plan-category').count() == 4, 'Plan did not display ten suggestions across four categories')
        require(re.search(r'10/10', self.page.locator('#collectionPlanCount').inner_text()), 'Visible suggestion total differs')
        self.page.locator('[data-create-plan="publication-basis"]').click()
        task = self.page.locator('[data-plan-status="publication-basis"]')
        task.select_option('doing')
        note = self.page.locator('[data-plan-note="publication-basis"]')
        note.fill('核对真实日期依据，尚未启动采集。')
        note.blur()
        self.page.wait_for_function("()=>JSON.parse(localStorage.getItem('zgclab.workspace.v1')).collectionPlan.tasks['publication-basis'].note?.includes('真实日期依据')")
        require(re.search(r'已创建\s*1\s*个本地待办', self.page.locator('#collectionPlanCount').inner_text()), 'Visible task count did not update after create')
        require(self.page.locator('.research-plan-stats .research-metric').last.locator('strong').inner_text() == '1', 'Plan overview task count is stale')
        self.page.locator('#planStatus').select_option('doing')
        require(self.page.locator('#collectionPlanList .research-plan-card').count() == 1 and '1/10' in self.page.locator('#collectionPlanCount').inner_text(), 'Task status filtering lost visible count')
        self.page.locator('#planStatus').select_option('all')
        return {'categories': 4, 'suggestions': 10, 'created_tasks': 1, 'task_id': 'publication-basis', 'status': 'doing'}

    def backup(self):
        self.goto('#/workspace', '#backupWorkspace')
        data = self.download('#backupWorkspace', 'workspace-backup.json')
        backup = json.loads(data.decode('utf-8-sig'))
        keys = ['projects', 'relations', 'researchChanges', 'collectionPlan', 'chatSessions', 'read']
        require(all(backup.get(key) for key in keys), 'Global backup omitted a research subsystem')
        def inspect(value):
            if isinstance(value, dict):
                require(not any(re.fullmatch(r'password|authorization|access_?token|api[_-]?key|cookie', str(k), re.I) for k in value), 'Credential field appeared in workspace export')
                for item in value.values():
                    inspect(item)
            elif isinstance(value, list):
                for item in value:
                    inspect(item)
        inspect(backup)
        restored = self.browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        self.install_guard(restored)
        page = restored.new_page()
        self.attach_page(page)
        try:
            page.goto(self.base + '#/workspace', wait_until='domcontentloaded')
            require(page.locator('script[data-manifest]').get_attribute('data-manifest') == self.manifest_name, 'Backup restore context received a different public build')
            self.unlock(page)
            page.locator('#importWorkspace').set_input_files({'name': 'public-design-backup.json', 'mimeType': 'application/json', 'buffer': data})
            page.wait_for_function("id=>JSON.parse(localStorage.getItem('zgclab.workspace.v1')||'{}').projects?.some(p=>p.id===id)", arg=self.project_id)
            actual = self.workspace(page)
            require(all(actual.get(key) == backup.get(key) for key in keys), 'Global backup changed research state during roundtrip')
        finally:
            restored.close()
        return {'fresh_context_restore': True, 'preserved_fields': keys, 'backup_sha256': digest(data), 'password_or_token_exported': False}

    def responsive(self):
        routes = [
            ('assistant', '#/assistant?mode=chat&ids=1002550&expand=0&semantic=0', '#asQuestion', '#asSubmit'),
            ('projects', '#/projects?id=' + self.project_id, '#projectMaterials', '#projectsNew'),
            ('evidence', '#/evidence?angle=social&id=social-1', '#researchReadingMode', '#copyResearchCitation'),
            ('related', '#/related?angle=social&id=social-1', '#relatedCount', '#manageRelationGroup'),
            ('changes', '#/changes', '#researchChangesCount', '#markSnapshotViewed'),
            ('coverage', '#/coverage', '#coverageSummary', '#exportCoverage'),
            ('plan', '#/collection-plan', '#collectionPlanCount', '#exportCollectionPlan'),
        ]
        shots = {(name, 1440) for name, *_ in routes} | {('assistant', 390), ('projects', 390), ('plan', 390), ('coverage', 768)}
        measurements = []
        for width, height in SIZES:
            self.page.set_viewport_size({'width': width, 'height': height})
            for name, hash_, ready, primary in routes:
                self.goto(hash_, ready)
                if name == 'assistant':
                    self.page.locator('#asServiceStatus .as-model-status').wait_for(state='attached', timeout=45000)
                if name in ('changes', 'coverage'):
                    self.page.locator(('#researchServiceStatus' if name == 'changes' else '#coverageServiceStatus') + ' .research-service-details').wait_for(state='attached', timeout=45000)
                overflow = self.page.evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth})')
                require(overflow['page'] <= width + 1, f'{name} overflows the {width}px page')
                control = self.page.locator(primary)
                self.reveal(control)
                control.scroll_into_view_if_needed()
                rect = control.bounding_box()
                require(control.is_visible() and control.is_enabled() and rect is not None, f'{name} main action is unreachable at {width}px')
                require(rect['height'] >= (32 if width <= 768 else 28) and rect['height'] <= 120 and rect['width'] >= 44, f'{name} main action dimensions are impractical at {width}px: {rect}')
                require(rect['x'] >= -1 and rect['x'] + rect['width'] <= width + 1 and rect['y'] >= -1 and rect['y'] + rect['height'] <= height + 1, f'{name} main action is outside the viewport at {width}px')
                measurements.append({'route': name, 'viewport': {'width': width, 'height': height}, 'page_overflow': overflow['page'] - width, 'primary_action': primary, 'action_bounds': rect})
                if (name, width) in shots:
                    if width == 1440:
                        self.page.evaluate('scrollTo(0,0)')
                    self.shot(name + '-' + str(width))
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.goto('#/assistant?mode=chat&ids=1002550&expand=0&semantic=0', '#asQuestion')
        self.page.locator('#asServiceStatus .as-model-status').wait_for(state='attached', timeout=45000)
        self.page.evaluate('scrollTo(0,0)')
        more = self.page.locator('.mobile-more')
        summary = more.locator(':scope > summary')
        if more.evaluate('(el)=>el.open'):
            summary.click()
        require(summary.is_visible(), 'Mobile More navigation is hidden')
        summary.focus()
        self.page.keyboard.press('Enter')
        require(more.evaluate('(el)=>el.open'), 'Mobile More cannot be activated with the keyboard')
        for href in ('#/assistant', '#/projects', '#/changes', '#/coverage', '#/collection-plan'):
            require(more.locator('a[href="' + href + '"]').is_visible(), 'Mobile More lost route ' + href)
        nav = more.locator('nav').bounding_box()
        require(nav and nav['x'] >= -1 and nav['x'] + nav['width'] <= 391 and nav['y'] >= 0 and nav['y'] + nav['height'] <= 845, 'Mobile More popup is clipped outside its viewport')
        self.page.keyboard.press('Tab')
        require(self.page.evaluate("!!document.activeElement.closest('.mobile-more nav')"), 'Mobile More links are not keyboard reachable')
        self.shot('mobile-more-390')
        more.locator('a[href="#/projects"]').click()
        self.settle('#projectBody')
        require(self.page.locator('body').get_attribute('data-route') == 'projects' and not more.evaluate('(el)=>el.open'), 'Mobile navigation did not visit Projects and close')
        self.save_json('viewport-measurements.json', measurements)
        return {'routes': 7, 'viewports': [1440, 390, 768], 'measured_states': len(measurements), 'mobile_more_keyboard_and_navigation': True, 'screenshots': len(shots) + 1}

    def legacy_filters(self):
        self.page.set_viewport_size({'width': 1440, 'height': 1000})
        self.goto('#/explore?angle=social&accountHandles=ArkansasState&platforms=X', '#exCount')
        self.page.wait_for_function("()=>!!document.querySelector('#exCount')?.dataset.query")
        rows = self.page.locator('#exBody tr[data-id]')
        require(rows.count() == 1 and rows.first.get_attribute('data-id') == 'social-1', 'Existing handle and platform filters did not find exactly the real social-1 record')
        trigger = self.page.locator('#openFilters')
        trigger.click()
        dialog = self.page.locator('#exFilterDialog')
        require(dialog.evaluate('(el)=>el.open && el.matches(":modal")'), 'Existing filters no longer open an independent modal')
        self.page.keyboard.press('Escape')
        require(not dialog.evaluate('(el)=>el.open'), 'Escape did not close existing filters')
        require(trigger.evaluate('(el)=>el===document.activeElement'), 'Filter Escape did not restore trigger focus')
        return {'record': 'social-1', 'results': 1, 'filters_modal': True, 'escape_focus_restored': True}

    def authentication(self):
        self.goto('#/collection-plan', '#collectionPlanCount')
        persisted = self.workspace()
        for turn in range(2):
            clean = self.page.evaluate(r"password=>{const all=[...Object.entries(localStorage),...Object.entries(sessionStorage)];return {passwordAbsent:!JSON.stringify(all).includes(password),keyAbsent:!all.some(([key])=>/access\.key/i.test(key))}}", self.password)
            require(clean['passwordAbsent'] and clean['keyAbsent'], 'Password or access key was persisted in browser storage')
            self.page.reload(wait_until='domcontentloaded')
            require(self.page.locator('#accessForm').is_visible() and self.page.locator('#view').count() == 0, 'Refresh ' + str(turn + 1) + ' did not lock the encrypted site')
            require(self.page.locator('script[data-manifest]').get_attribute('data-manifest') == self.manifest_name, 'Refresh changed the published manifest')
            self.unlock()
            self.settle('#collectionPlanCount')
            require(not self.page.locator('#includeSimulation').is_checked(), 'Refresh enabled simulation')
            restored = self.workspace()
            require(all(restored.get(key) == persisted.get(key) for key in ('projects', 'relations', 'researchChanges', 'collectionPlan', 'chatSessions', 'read')), 'Refresh lost saved workspace research state')
        self.page.locator('#lockSession').click()
        self.page.locator('#accessForm').wait_for(state='visible')
        require(self.page.locator('#view').count() == 0, 'Explicit Lock did not remove decrypted app content')
        return {'fresh_document_locked': True, 'refreshes_requiring_password': 2, 'password_persisted': False, 'access_key_persisted': False, 'explicit_lock': True}

    def final_network(self):
        require(not self.report['blocked_business_requests'], 'An unauthorized business request was attempted')
        require(len(self.allowed_posts) == len(self.business_responses) == 1, 'Did not observe exactly one allowed count request and response')
        require(all(item['used'] is False and item['attempted'] is False for item in self.business_responses), 'A business response used or attempted a model')
        require(not self.report['api_failures'], 'An actual API request failed; optional service failures are not skipped')
        require(not self.report['page_errors'] and not self.report['console_errors'], 'Browser reported script or console errors')
        self.report['model_business_requests'] = sum(item['used'] is True or item['attempted'] is True for item in self.business_responses)
        return {'count_posts': 1, 'search_posts': 0, 'model_used': False, 'model_attempted': False, 'page_errors': 0, 'console_errors': 0, 'api_failures': 0}

    def execute(self):
        if not self.run('Frozen final design build and independent reference', self.local_build):
            return
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            self.browser = pw.chromium.launch(headless=True, executable_path=shutil.which('google-chrome') or '/usr/bin/google-chrome', args=['--no-sandbox', '--disable-dev-shm-usage'])
            self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True, permissions=['clipboard-read', 'clipboard-write'])
            self.install_guard(self.context)
            self.page = self.context.new_page()
            self.attach_page(self.page)
            try:
                # A stale public release is a hard gate: do not test it as design.
                if not self.run('Actual encrypted public manifest and exact release commit', self.public_identity):
                    return
                for name, action in [
                    ('Real 6989-record snapshot and simulation default off', self.real_snapshot),
                    ('Actual assistant database and truthful model status', self.service_status),
                    ('Arkansas 221 database answer without model; A1 click focus', self.exact_count),
                    ('Literal social-1 body, citation and expanded complete provenance', self.evidence),
                    ('Exact recovery/placeholder IDs and honest evidence states', self.research_ids),
                    ('Project create, keyboard trap, Escape focus and sourced backup', self.projects),
                    ('Explicit related-material grouping with stable real IDs', self.related),
                    ('Zero initial changes and all 6989 full-text fingerprints', self.changes),
                    ('120 coverage cells and precise gap/export record IDs', self.coverage),
                    ('Four plan categories, ten suggestions and visible created task count', self.plan),
                    ('Independent fresh-context global backup roundtrip', self.backup),
                    ('390/768/1440 viewport screenshots, action bounds and mobile More', self.responsive),
                    ('Existing ArkansasState plus X filters and Escape modal behavior', self.legacy_filters),
                    ('Two refreshes require password, retain workspace and explicit Lock', self.authentication),
                    ('Zero browser errors and zero model business requests', self.final_network),
                ]:
                    self.run(name, action)
            finally:
                self.browser.close()

    def finish(self):
        self.report['allowed_business_requests'] = self.allowed_posts
        self.report['business_responses'] = self.business_responses
        self.report['model_business_requests'] = sum(item['used'] is True or item['attempted'] is True for item in self.business_responses)
        self.report['model_usage_verified'] = len(self.business_responses) == 1 and all(item['used'] is False and item['attempted'] is False for item in self.business_responses)
        self.report['finished_at'] = datetime.now(timezone.utc).isoformat()
        self.report['passed'] = sum(item['status'] == 'PASS' for item in self.report['checks'])
        self.report['failed'] = sum(item['status'] == 'FAIL' for item in self.report['checks'])
        self.report['verdict'] = 'PASS' if self.report['failed'] == 0 and len(self.report['checks']) == 17 else 'FAIL'
        path = self.save_json('results.json', self.report)
        print(json.dumps({key: self.report[key] for key in ('verdict', 'passed', 'failed', 'expected_manifest', 'expected_commit', 'model_business_requests')} | {'report': path}, ensure_ascii=False), flush=True)
        return 0 if self.report['verdict'] == 'PASS' else 1


def main():
    manifest = os.environ.get('ZGCLAB_DESIGN_EXPECTED_MANIFEST', '')
    commit = os.environ.get('ZGCLAB_DESIGN_EXPECTED_COMMIT', '')
    if not re.fullmatch(r'manifest-[a-f0-9]{20}\.json', manifest):
        raise SystemExit('ZGCLAB_DESIGN_EXPECTED_MANIFEST must contain the exact final manifest filename; no default is permitted')
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise SystemExit('ZGCLAB_DESIGN_EXPECTED_COMMIT must contain the exact full release commit; no Git HEAD fallback is permitted')
    base = os.environ.get('ZGCLAB_PUBLIC_VERIFY_URL', PUBLIC_URL)
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit('Public verification URL must be an HTTPS site URL without credentials, query or fragment')
    base = base.rstrip('/') + '/'
    review = Review(manifest, commit, base)
    try:
        review.execute()
    except Exception as error:
        review.report['checks'].append({'name': review.active, 'status': 'FAIL', 'type': type(error).__name__, 'error': review.safe(str(error))})
    return review.finish()


if __name__ == '__main__':
    raise SystemExit(main())
