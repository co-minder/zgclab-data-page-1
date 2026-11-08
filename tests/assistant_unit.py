#!/usr/bin/env python3
"""Validate assistant backup imports in the existing Node runtime, with no dependencies."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({window:{},URL,URLSearchParams,DOMException,console});
vm.runInContext(fs.readFileSync('assistant.js','utf8'), context);
const assistant = context.window.ZGCLAB_ASSISTANT;
// This exact fixture is captured from the real authenticated /api/status endpoint.
const statusFixture={service:'zgclab-database',state:'ready',authentication_required:true,dataset:'real',database:'ready',snapshot:{schema_version:2,source_version:'f064c896c123cbf4',research_version:'a8acd9d0b712fbe06a65',total:6989,source_generated_at:'2026-11-05T15:10:46+00:00'},llm:{available:true,state:'ready',model:'auto/deepseek-v4.1-flash',health_scope:'relay_health'}};
for (const fixture of [statusFixture,{data:statusFixture}]) {
  const result=assistant.serviceStatusModel(fixture);
  assert.equal(result.count,6989,'database string with snapshot.total must render count');
  assert.equal(result.databaseState,'ready');
  assert.equal(result.modelAvailable,true);
  assert.match(result.modelLabel,/DeepSeek V4\.1 Flash/);
  assert.match(result.modelLabel,/ready/);
}
const unknownStatus=assistant.serviceStatusModel(null);
assert.equal(unknownStatus.modelAvailable,null);
assert.equal(unknownStatus.modelLabel,'模型状态尚未报告');
assert.ok(!unknownStatus.modelLabel.includes('不可用'));
assert.equal(assistant.serviceStatusModel({...statusFixture,llm:{available:false,state:'unreachable',model:'auto/deepseek-v4.1-flash'}}).modelAvailable,false);
console.log('PASS actual API status fixture: database ready + snapshot 6989 + llm ready, wrapped response and unknown availability');

const turn = () => ({id:'as-turn-1',question:'有哪些人工智能资料？',answer:'数据库共 2 条。[A1]',kind:'database',modelInfo:{id:'auto/deepseek-v4.1-flash',used:false,attempted:false,reason:'exact_database_aggregate'},items:[{label:'C3',id:'news-1',angle:'news',ktid:'1000110',title:'Evidence',excerpt:'literal <img onerror=1>',source_url:'javascript:alert(1)',token:'secret-token'}],aggregates:[{label:'A1',scope:{source_version:'real-v1',filters:{institution:[1000110],angle:['news'],date_from:'2026-01-01'},date_field:'published_at',terms:['AI'],strategy:'fts5_and'},scoped:{total:3,by_angle:{news:3,clue:0,social:0}},matched:{total:2,by_angle:{news:2,clue:0,social:0}}}],filters:{ids:['1000110'],angle:'news'},password:'secret-password'});
const saved = () => ({kind:'assistant',id:'as-session-1',title:'Research',created_at:'2026-11-08',updated_at:'2026-11-08',turns:[turn()],password:'secret-password',token:'secret-token'});
const workspace = {favorites:[{id:'keep'}],queries:[{name:'keep'}],read:{keep:true},projects:[{id:'keep'}],other:{keep:true}};
let summary = assistant.mergeBackup({chatSessions:[saved()]},workspace);
assert.equal(summary.added,1);
assert.equal(workspace.chatSessions.length,1);
assert.equal(workspace.chatSessions[0].turns[0].items[0].label,'C3');
assert.equal(workspace.chatSessions[0].turns[0].items[0].source_url,'');
assert.equal(workspace.chatSessions[0].turns[0].aggregates[0].matched.total,2);
assert.equal(workspace.chatSessions[0].turns[0].aggregates[0].scope.filters.ids[0],'1000110');
assert.equal(JSON.stringify(workspace).includes('secret-'),false);
assert.equal(workspace.other.keep,true);
assert.equal(workspace.favorites[0].id,'keep');
assert.equal(assistant.mergeBackup({chatSessions:[saved()]},workspace).skipped,1);
const old=workspace.chatSessions[0];
const changed=saved();changed.turns[0].answer='Different [A1]';
summary=assistant.mergeBackup({chatSessions:[changed]},workspace);
assert.equal(summary.conflicts,1);
assert.equal(workspace.chatSessions.length,2);
assert.equal(workspace.chatSessions[0],old);
assert.match(workspace.chatSessions[1].id,/-import-/);
assert.equal(assistant.mergeBackup({chatSessions:[changed]},workspace).skipped,1);
const before=JSON.stringify(workspace);
for (const invalid of [null,{},[saved(),saved()],Array.from({length:33},(_,i)=>({...saved(),id:'as-'+i})),[{...saved(),turns:[{...turn(),question:'x'.repeat(1201)}]}],[{...saved(),turns:[{...turn(),items:Array.from({length:31},()=>turn().items[0])}]}]]) {
  assert.throws(()=>assistant.mergeBackup({chatSessions:invalid},workspace));
  assert.equal(JSON.stringify(workspace),before,'failed validation must be atomic');
}
const simulation=saved();simulation.id='as-sim';simulation.turns[0].items=[{id:'sim-news-1',angle:'news',label:'C1'}];
assistant.mergeBackup({chatSessions:[simulation]},workspace);
assert.equal(workspace.chatSessions.at(-1).turns[0].items.length,0);
assert.equal(assistant.mergeBackup({},workspace).added,0);
const legacy={...workspace,chatSessions:[{id:'legacy',kind:'other',arbitrary:true}]};
assistant.mergeBackup({chatSessions:[saved()]},legacy);
assert.equal(legacy.chatSessions[0].arbitrary,true);
console.log('PASS backup validation, stable citation IDs, aggregate metadata, secret allowlist, atomic rejection, duplicate/conflict merge, legacy workspace preservation');
const historySource=fs.readFileSync('assistant.js','utf8');
const historyStart=historySource.indexOf('    function buildHistory(');
assert.ok(historyStart>=0);
const historyEnd=historySource.indexOf('\n    async function remoteSearch(',historyStart);
const historyContext=vm.createContext({state:{turns:[]},MAX_QUERY:1200,MAX_HISTORY_MESSAGES:8});
vm.runInContext(historySource.slice(historyStart,historyEnd),historyContext);
const history=()=>JSON.parse(JSON.stringify(historyContext.buildHistory(null)));
historyContext.state.turns=[{id:'as-first',kind:'retrieval',question:'FBI 的网络安全资料',answer:'模型不可用，此检索摘录不能作为已确认事实。'}];
assert.deepEqual(history(),[{role:'user',content:'FBI 的网络安全资料'}], 'fallback must preserve user institution/topic without forwarding its assistant excerpt');
historyContext.state.turns.push({id:'as-second',kind:'answer',question:'那官网的呢？',answer:'模型选取的原文 [C3]'});
assert.deepEqual(history(),[{role:'user',content:'FBI 的网络安全资料'},{role:'user',content:'那官网的呢？'},{role:'assistant',content:'模型选取的原文 [C3]'}]);
assert.deepEqual(JSON.parse(JSON.stringify(historyContext.buildHistory('as-second'))),[{role:'user',content:'FBI 的网络安全资料'}],'retry excludes the replaced turn and later turns');
historyContext.state.turns=Array.from({length:12},(_,i)=>({id:'as-history-'+i,kind:i%3===0?'database':i%3===1?'retrieval':'answer',question:'FBI 网络安全 '+i+' '+ '问'.repeat(1200),answer:'答'.repeat(12000)}));
const boundedHistory=history();
assert.ok(boundedHistory.length<=8);
assert.ok(boundedHistory.every(message=>message.content.length<=4000));
assert.ok(boundedHistory.reduce((sum,message)=>sum+message.content.length,0)<=12000);
assert.equal(boundedHistory[0].role,'user');
assert.ok(boundedHistory.some(message=>message.role==='user'&&message.content.startsWith('FBI 网络安全 11 ')));
historyContext.state.turns=Array.from({length:12},(_,i)=>({id:'as-retrieval-'+i,kind:'retrieval',question:'FBI 网络安全 '+i,answer:'untrusted fallback '+i}));
const fallbackHistory=history();
assert.equal(fallbackHistory.length,8);
assert.ok(fallbackHistory.every(message=>message.role==='user'));
assert.equal(fallbackHistory[0].content,'FBI 网络安全 4');
assert.equal(fallbackHistory.at(-1).content,'FBI 网络安全 11');
historyContext.state.turns=[{id:'as-empty',kind:'retrieval',question:'  ',answer:'not a valid question'}];
assert.deepEqual(history(),[]);
console.log('PASS retrieval-only follow-up retains user institution/topic; excludes fallback assistant content; retries and mixed history obey 8/4000/12000 bounds');

"""

if __name__ == "__main__":
    subprocess.run(["node", "--check", "assistant.js"], cwd=ROOT, check=True)
    subprocess.run(["node", "-e", SCRIPT], cwd=ROOT, check=True)
