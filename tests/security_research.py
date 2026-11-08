#!/usr/bin/env python3
"""Independent security regression checks; fixtures only, no real LLM calls.

Run on social from the project root:
    PYTHONDONTWRITEBYTECODE=1 python3 -B tests/security_research.py -v

HTTP checks bind random loopback ports and mock the backend connection.
JS checks execute the checked-in files in isolated Node VMs; no browser storage
or application dataset is read. Only this test file is owned by the review agent.
"""
from __future__ import annotations

import hashlib
import http.client
import json
import socket
import subprocess
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT))

import serve
from service.app import Server as APIServer
from service.auth import Auth
from service.chat import Chat
from service.config import Config
from service.limits import Limits
from service.llm import ModelUnavailable
from service.retrieval import Retriever


def node_probe(source: str) -> dict:
    result = subprocess.run(["node", "-"], input=source, text=True, cwd=ROOT,
                            capture_output=True, timeout=15, check=True)
    return json.loads(result.stdout)


CLIENT_PROBE = r"""
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  let enterJson,releaseJson;
  const parsing=new Promise(resolve=>enterJson=resolve),timers=new Map();
  const window={ZGCLAB_SERVICE_CONFIG:{baseUrl:'https://fixture.invalid'}};
  const context={window,URL,AbortController,DOMException,Date,
    location:{origin:'https://fixture.invalid',href:'https://fixture.invalid/'},
    setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
    fetch:async()=>({ok:true,status:200,json:()=>{enterJson();return new Promise(resolve=>releaseJson=resolve);}})};
  vm.runInNewContext(fs.readFileSync('service-client.js','utf8'),context);
  const api=window.ZGCLAB_SERVICE_CLIENT;
  api.setPassword('fixture-only-password');
  const pending=api.session(),completion=pending.then(()=>true,()=>false);
  await parsing;
  const bodyHasTimeout=timers.size>0;
  api.clear();
  releaseJson({token:'fixture-only-token',expires_in:900});
  await completion;
  let revived=false;
  try{revived=(await api.session())==='fixture-only-token';}catch(_){}
  console.log(JSON.stringify({bodyHasTimeout,revived}));
})().catch(error=>{console.error(error.name);process.exitCode=1;});
"""

BACKUP_PROBE = r"""
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const source=fs.readFileSync('app.js','utf8');
  const start=source.indexOf('$("#importWorkspace").onchange');
  if(start<0)throw new Error('Workspace import integration was moved; update this fixture.');
  const end=source.indexOf('\n  }\n',start),handlerSource=source.slice(start,end);
  const saveStart=source.indexOf('function saveWorkspace(');
  const saveEnd=source.indexOf('\n  }',saveStart)+4;
  const saveSource=source.slice(saveStart,saveEnd);
  const researchWindow={};
  vm.runInNewContext(fs.readFileSync('research.js','utf8'),{globalThis:researchWindow,URL,structuredClone});
  async function run(payload,storageFails,navigateDuringRead=false){
    const initial={favorites:[],queries:[],watchlist:[],read:{}},input={},messages=[];
    const original=JSON.stringify(initial);
    let stored=null,finishRead;
    const routeController=new AbortController();
    const context={window:{ZGCLAB_PROJECTS:require('./projects.js'),ZGCLAB_RESEARCH_UI:researchWindow.ZGCLAB_RESEARCH_UI},
      workspace:initial,ANGLES:['news','clue','social'],instMap:new Map([[1,{}]]),$:()=>input,
      version:1,routeVersion:1,routeController,storageKey:'fixture-only',
      localStorage:{setItem(key,value){if(storageFails)throw new Error('fixture storage quota exceeded');stored=JSON.parse(value);}},
      viewWorkspace(){},showToast(message){messages.push(message);},JSON,Date,Set,AbortController};
    vm.createContext(context);
    vm.runInContext(saveSource+'\n'+handlerSource,context);
    const pending=input.onchange({target:{files:[{size:1000,text:()=>new Promise(resolve=>finishRead=resolve)}]}});
    const activeViewWorkspace=context.workspace;
    if(navigateDuringRead){context.routeVersion++;routeController.abort();context.routeController=new AbortController();}
    finishRead(JSON.stringify(payload));
    await pending;
    const originalUntouched=JSON.stringify(initial)===original;
    if(navigateDuringRead)activeViewWorkspace.projects=[{id:'active-view-edit',items:[]}];
    return {workspace:context.workspace,stored,messages,originalUntouched,
      activeViewEditRetained:!navigateDuringRead||context.workspace.projects?.[0]?.id==='active-view-edit'};
  }
  const restored=await run({version:3,favorites:[],queries:[],projects:[],relations:[{id:'fixture-relation',name:'fixture',records:[{angle:'news',id:'fixture-record'}]}]},false);
  const invalid=await run({favorites:[{angle:'news',id:'fixture',ktid:1}],queries:[],projects:[{id:'invalid-project'}]},false);
  const unsaved=await run({favorites:[{angle:'news',id:'fixture',ktid:1}],queries:[]},true);
  const navigated=await run({favorites:[{angle:'news',id:'fixture',ktid:1}],queries:[]},false,true);
  console.log(JSON.stringify({
    researchRestored:restored.workspace.relations?.length===1&&restored.stored?.relations?.[0]?.id==='fixture-relation',
    invalidImportUntouched:invalid.originalUntouched&&invalid.workspace.favorites.length===0&&invalid.stored===null,
    failedStorageReportsSuccess:unsaved.messages.some(message=>/^备份已合并导入(?:并保存)?$/.test(message)),
    failedStorageWarned:unsaved.stored===null&&/未能保存|未保存|仅.*本次|刷新.*丢失/.test(unsaved.messages.at(-1)||''),
    activeViewEditRetained:navigated.activeViewEditRetained
  }));
})().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
"""


HISTORY_PROBE = r"""
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assistant.js','utf8'),start=source.indexOf('    function buildHistory(');
if(start<0)throw new Error('Assistant history helper moved; update the fixture locator.');
const end=source.indexOf('\n    }',start)+6,context={state:{turns:[]},MAX_QUERY:1200,MAX_HISTORY_MESSAGES:8};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
context.state.turns=[{id:'as-first',kind:'retrieval',question:'FBI 的网络安全资料',answer:'当前返回数据库摘录，未生成模型答案。'}];
const retrieval=context.buildHistory(null);
context.state.turns=Array.from({length:12},(_,i)=>({id:'as-'+i,kind:i%2?'answer':'retrieval',question:'q'.repeat(1200),answer:'a'.repeat(4000)}));
const bounded=context.buildHistory(null);
console.log(JSON.stringify({retainsRetrievalUser:retrieval.some(message=>message.role==='user'&&message.content==='FBI 的网络安全资料'),
  messages:bounded.length,characters:bounded.reduce((sum,message)=>sum+message.content.length,0),
  maxMessage:Math.max(0,...bounded.map(message=>message.content.length))}));
"""


RESEARCH_PRESERVATION_PROBE = r"""
const fs=require('node:fs'),vm=require('node:vm');
const context={module:{exports:{}},URL,structuredClone};
vm.runInNewContext(fs.readFileSync('research.js','utf8'),context);
const research=context.module.exports;
function retained(existing,incoming){
  const workspace={relations:structuredClone(existing)},before=JSON.stringify(workspace);
  try{research.mergeBackup({relations:incoming},workspace);}catch(_){return JSON.stringify(workspace)===before;}
  return existing.every(group=>{
    const target=workspace.relations.find(item=>item.id===group.id);
    return target&&group.records.every(record=>target.records.some(item=>item.angle===record.angle&&item.id===record.id));
  });
}
const groups=Array.from({length:301},(_,i)=>({id:'relation-'+i,name:'Group '+i,records:[{angle:'news',id:'record-'+i}]}));
const records=Array.from({length:5001},(_,i)=>({angle:'news',id:'record-'+i}));
console.log(JSON.stringify({groupsRetained:retained(groups,[structuredClone(groups[0])]),
  membersRetained:retained([{id:'relation-existing',name:'Existing',records}],[{id:'relation-existing',name:'Existing',records:[records[0]]}])}));
"""


class BrowserClientSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.probe = node_probe(CLIENT_PROBE)

    def test_clear_cannot_restore_credentials_from_pending_response_body(self):
        self.assertFalse(self.probe["revived"], "Completing a prior login restored credentials after clear()")

    def test_login_timeout_remains_active_until_response_body_is_parsed(self):
        self.assertTrue(self.probe["bodyHasTimeout"], "Login cleared its timeout before the JSON body arrived")


class WorkspaceImportSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.probe = node_probe(BACKUP_PROBE)

    def test_research_supplement_is_restored(self):
        self.assertTrue(self.probe["researchRestored"])

    def test_invalid_project_cannot_partially_import_favorites(self):
        self.assertTrue(self.probe["invalidImportUntouched"])

    def test_storage_failure_is_not_reported_as_successful_restore(self):
        self.assertFalse(self.probe["failedStorageReportsSuccess"], "Import reported success after persistence failed")
        self.assertTrue(self.probe["failedStorageWarned"], "Persistence failure warning was absent or overwritten")

    def test_switching_routes_during_backup_read_preserves_active_view_edits(self):
        self.assertTrue(self.probe["activeViewEditRetained"], "Late import detached the workspace held by the active view")


class FrontendHistorySecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.probe = node_probe(HISTORY_PROBE)

    def test_retrieval_only_turn_retains_the_users_institution_and_topic(self):
        self.assertTrue(self.probe["retainsRetrievalUser"], "Fallback discarded the user's own question from follow-up history")

    def test_history_stays_within_backend_message_and_character_limits(self):
        self.assertLessEqual(self.probe["messages"], 8)
        self.assertLessEqual(self.probe["characters"], 12000)
        self.assertLessEqual(self.probe["maxMessage"], 4000)


class ResearchMergePreservation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.probe = node_probe(RESEARCH_PRESERVATION_PROBE)

    def test_merging_a_backup_never_drops_existing_groups_over_import_limit(self):
        self.assertTrue(self.probe["groupsRetained"], "Merge silently dropped an existing group instead of rejecting atomically")

    def test_merging_a_backup_never_drops_existing_members_over_import_limit(self):
        self.assertTrue(self.probe["membersRetained"], "Merge silently dropped existing group members instead of rejecting atomically")


class AnswerEvidenceSecurity(unittest.TestCase):
    def test_a_literal_C1_extract_remains_usable(self):
        quote = "该机构仅公布了讨论人工智能政策的研讨会安排"
        payload = {"claims": [{"text": quote, "citations": ["C1"],
                               "quotes": [{"citation_id": "C1", "quote": quote}]}]}
        claims, cited = Chat.validate_claims(payload, [{"citation_id": "C1", "evidence_eligible": True,
                                                       "snippet": quote + "，正文没有描述政策实施结果。"}])
        self.assertEqual(claims[0]["text"], quote)
        self.assertEqual(cited, {"C1"})

    def test_a_real_C1_quote_does_not_validate_an_unrelated_claim(self):
        evidence = [{"citation_id": "C1", "evidence_eligible": True,
                     "snippet": "该机构仅公布了讨论人工智能政策的研讨会安排，正文没有描述政策实施结果。"}]
        payload = {"claims": [{"text": "该机构已全面禁止人工智能研发，并终止所有国际合作。",
                              "citations": ["C1"],
                              "quotes": [{"citation_id": "C1", "quote": "该机构仅公布了讨论人工智能政策的研讨会安排"}]}]}
        try:
            claims, _ = Chat.validate_claims(payload, evidence)
        except ModelUnavailable:
            claims = []
        self.assertFalse(claims, "An unsupported claim passed by attaching a valid but unrelated C1 quotation")

    def test_third_turn_retains_institution_inherited_by_second_turn(self):
        retriever = Retriever.__new__(Retriever)
        retriever.aliases = {1000110: ["FBI", "联邦调查局"], 5775050: ["OpenAI"]}
        retriever.vocabulary = {}
        chat = Chat(retriever, None)
        history = [{"role": "user", "content": "FBI 的网络安全资料"},
                   {"role": "assistant", "content": "fixture answer"},
                   {"role": "user", "content": "那新闻呢"},
                   {"role": "assistant", "content": "fixture answer"}]
        query = chat.context_query("有多少条", history, {})
        self.assertEqual(retriever.make_plan(query, {})["filters"].get("institution"), [1000110],
                         "Third-turn statistics lost the institution from the first turn")


class LoginAvailabilitySecurity(unittest.TestCase):
    def test_bad_passwords_from_shared_proxy_peer_do_not_block_correct_login(self):
        origin = "http://127.0.0.1:8788"
        auth = Auth(Path("/nonexistent-security-auth-fixture"))
        app = SimpleNamespace(config=Config(), auth=auth, limits=Limits(),
                              semaphore=threading.BoundedSemaphore(12))
        server = APIServer(("127.0.0.1", 0), app)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def login(password):
            connection = http.client.HTTPConnection(*server.server_address, timeout=3)
            try:
                connection.request("POST", "/api/session", body=json.dumps({"password": password}),
                                   headers={"Origin": origin, "Content-Type": "application/json"})
                response = connection.getresponse()
                response.read()
                return response.status
            finally:
                connection.close()

        try:
            digest = hashlib.sha256(b"fixture-only-correct").digest()
            with patch.object(auth, "password_digest", return_value=digest):
                rejected = [login("fixture-only-wrong") for _ in range(10)]
                self.assertTrue(all(status in {401, 429} for status in rejected))
                self.assertEqual(login("fixture-only-correct"), 200,
                                 "Correct password was denied because earlier users shared the proxy IP")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


class ProxyOriginSecurity(unittest.TestCase):
    def request(self, headers):
        captured = []
        upstream = serve.http.client.HTTPConnection

        class Response:
            status = 200

            def read(self, amount):
                return b"{}"

            def getheaders(self):
                return [("Content-Type", "application/json")]

        class Backend:
            def __init__(self, *args, **kwargs):
                pass

            def request(self, method, path, body=None, headers=None):
                captured.append(dict(headers or {}))

            def getresponse(self):
                return Response()

            def close(self):
                pass

        class Quiet(serve.Handler):
            def log_message(self, *args):
                pass

        server = serve.ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(serve.http.client, "HTTPConnection", Backend):
                with socket.create_connection(server.server_address, timeout=3) as client:
                    request = "GET /api/status HTTP/1.1\r\n" + "\r\n".join(headers) + "\r\nConnection: close\r\n\r\n"
                    client.sendall(request.encode("ascii"))
                    reply = b""
                    while True:
                        chunk = client.recv(4096)
                        if not chunk:
                            break
                        reply += chunk
            return int(reply.split(b" ", 2)[1]), captured
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            assert serve.http.client.HTTPConnection is upstream

    def test_duplicate_origins_never_reach_backend(self):
        status, captured = self.request(["Host: 127.0.0.1:8788", "Origin: http://127.0.0.1:8788",
                                         "Origin: https://denied.invalid"])
        self.assertEqual(status, 400)
        self.assertFalse(captured)

    def test_exact_same_origin_get_can_infer_origin(self):
        status, captured = self.request(["Host: 127.0.0.1:8788", "Referer: http://127.0.0.1:8788/",
                                         "Sec-Fetch-Site: same-origin"])
        self.assertEqual(status, 200)
        self.assertEqual(captured[0].get("Origin"), "http://127.0.0.1:8788")

    def test_untrusted_referer_cannot_infer_allowed_origin(self):
        _, captured = self.request(["Host: 127.0.0.1:8788", "Referer: https://denied.invalid/",
                                     "Sec-Fetch-Site: same-origin"])
        self.assertTrue(not captured or not captured[0].get("Origin"))

    def test_cross_site_metadata_cannot_infer_allowed_origin(self):
        _, captured = self.request(["Host: 127.0.0.1:8788", "Referer: http://127.0.0.1:8788/",
                                     "Sec-Fetch-Site: cross-site"])
        self.assertTrue(not captured or not captured[0].get("Origin"))


if __name__ == "__main__":
    unittest.main()
