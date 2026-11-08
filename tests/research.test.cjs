const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const R = require('../research.js');
const context = {window:{ZGCLAB_DETAILS:{}}};
const load = (name) => vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
for (const name of ['data/meta.js','data/research.js','data/news.js','data/clue.js','data/social.js']) load(name);
const META = context.window.ZGCLAB_META, RESEARCH = JSON.parse(JSON.stringify(context.window.ZGCLAB_RESEARCH));
const all = ['news','clue','social'].flatMap(angle=>context.window['ZGCLAB_'+angle.toUpperCase()].map(r=>({angle,r:JSON.parse(JSON.stringify(r))})));
const delivered = (angle,id) => {
  const row = all.find(e=>e.angle===angle&&e.r.id===id);
  load('data/details/'+META.version+'/'+angle+'-'+row.r._detail+'.js');
  return {entry:row,detail:JSON.parse(JSON.stringify(context.window.ZGCLAB_DETAILS[angle+'-'+row.r._detail].find(d=>d.id===id)))};
};
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const row = (id,fields={})=>({angle:'social',r:{id,ktid:1,title:'A title',original_content:'Original text',chinese_translation:'无法翻译',content_url:'https://example.test/'+id,_has_original:true,_has_translation:true,...fields}});
const supplement = (entries,translations={})=>({records:Object.fromEntries(entries.map(e=>[e.r.id,{angle:e.angle,publication:{original:e.r.publish_time||'',effective:e.r.publish_time||'',status:e.r.publish_time?'provided':'missing',verified:false,basis:[]},translation:{status:translations[e.r.id]||'placeholder'},evidence:{snapshot_original_sha256:hash(e.r.original_content||''),snapshot_translation_sha256:hash(e.r.chinese_translation||''),original_chars:e.r.original_content.length,translation_chars:e.r.chinese_translation.length,missing:[]}}]))});
const group = (id,name,refs=[{angle:'social',id:'social-1'}])=>({id,name,records:refs,createdAt:'2026-11-08',updatedAt:'2026-11-08'});
const task = (status='todo',note='')=>({id:'publication-basis',title:'时间建议',priority:'P0',status,note,createdAt:'2026-11-08',updatedAt:'2026-11-08'});
const workspace=()=>({favorites:[{angle:'social',id:'social-1'}],queries:[{name:'本地查询',hash:'/explore?q=keep'}],read:{keep:true},watchlist:[1],projects:[{id:'keep'}],other:{keep:true}});

test('real sidecar records[id] lookup respects angle, absent metadata remains optional',()=>{
  assert.equal(R.sidecarRow(RESEARCH,'social','social-1').evidence.collected_at,'2026-10-09T13:25:55.493601+00:00');
  assert.equal(R.sidecarRow(RESEARCH,'clue','clue-1').evidence.original_chars,1808);
  assert.deepEqual(R.sidecarRow(RESEARCH,'clue','social-1'),{});
  assert.deepEqual(R.sidecarRow(null,'clue','clue-1'),{});
});
test('Arkansas social-1 and clue-1 use complete detail bodies and retain provenance',()=>{
  const a=delivered('social','social-1'), b=delivered('clue','clue-1');
  const social=R.evidenceModel(a.entry.angle,a.entry.r,a.detail),clue=R.evidenceModel(b.entry.angle,b.entry.r,b.detail);
  assert.match(social.original,/A-State Faces Setback/);assert.equal(social.originalParts.length,1);assert.equal(social.placeholder,false);
  assert.equal(social.fields.content_hash,'99cd4b9d4d5f202dbf7b201998c175b5b6535078e8ce3536b2eb4ac3d2d76649');
  assert.equal(clue.original.length,1808);assert.match(clue.original,/Jenny Town/);assert.match(clue.fields.report_path,/manifests\/official_web/);
  assert.ok(clue.translationParts.length>clue.originalParts.length);assert.deepEqual(clue.pages,[]);
});
test('empty original never uses a summary, real placeholder variants are unambiguous',()=>{
  for (const text of ['无法翻译','翻译失败','暂无翻译','待翻译','【待译】','translation failed','translation unavailable','译文：待完成']) assert.equal(R.isPlaceholder(text),true,text);
  assert.equal(R.isPlaceholder('这份报告讨论无法翻译的术语。'),false);
  const model=R.evidenceModel('news',{summary_cn:'不能代替原文',content_cn:'无法翻译'},null);
  assert.equal(model.original,'');assert.deepEqual(model.originalParts,[]);assert.equal(model.placeholder,true);
});
test('PDF pages require explicit page-numbered parsed text, paragraphs do not invent pages',()=>{
  assert.deepEqual(R.evidenceModel('clue',{original_content:'paragraph1\nparagraph2',original_url:'https://example.test/a.pdf'},null).pages,[]);
  const parsed=R.evidenceModel('clue',{}, {fields:{},parsed_pages:[{page_number:3,text:'real parsed page'},{page:'bad',text:'ignore'},{page:4,text:''}]});
  assert.deepEqual(parsed.pages,[{page:3,text:'real parsed page'}]);
});
test('coverage matches delivered original/recovered/unresolved dates and all 325 placeholder translations',()=>{
  const missing=issue=>all.filter(e=>R.coverageIssue(e,issue,RESEARCH)==='missing').length;
  assert.equal(missing('publish_time'),RESEARCH.quality.counts.publish_time_original_missing);
  assert.equal(missing('effective_date'),RESEARCH.quality.counts.publish_time_unresolved);
  assert.equal(missing('translation'),RESEARCH.quality.counts.translation_placeholder+RESEARCH.quality.counts.translation_missing);
  assert.equal(RESEARCH.coverage.cells.length,120);
  const recovered=all.find(e=>e.r.id==='social-1613');assert.equal(recovered.r.publish_time,undefined);
  assert.equal(R.coverageIssue(recovered,'effective_date',RESEARCH),'present');
});
test('first and second identical snapshots show zero new records regardless of data_status',()=>{
  const entries=[row('a',{data_status:'新增'})],meta=supplement(entries),snapshot=R.snapshotFor(entries,{version:'v1'},meta,'2026-11-08');
  assert.deepEqual(R.compareSnapshots(null,snapshot),[]);
  assert.deepEqual(R.compareSnapshots(snapshot,R.snapshotFor(entries,{version:'v1'},meta)),[]);
  assert.equal(snapshot.fullFingerprintCount,1);
});
test('full original and translation SHA-256 detect same-length tail edits beyond visible excerpt',()=>{
  const entries=[row('a',{original_content:'visible excerpt',chinese_translation:'可见译文'})],meta=supplement(entries,{a:'available'});
  meta.records.a.evidence.snapshot_original_sha256=hash('visible excerpt'+'a'.repeat(3000)+'x');
  meta.records.a.evidence.snapshot_translation_sha256=hash('可见译文'+'甲'.repeat(3000)+'末');
  const baseline=R.snapshotFor(entries,{version:'v1'},meta);
  meta.records.a.evidence.snapshot_original_sha256=hash('visible excerpt'+'a'.repeat(3000)+'y');
  meta.records.a.evidence.snapshot_translation_sha256=hash('可见译文'+'甲'.repeat(3000)+'尾');
  const diff=R.compareSnapshots(baseline,R.snapshotFor(entries,{version:'v2'},meta));
  assert.ok(diff[0].kinds.includes('content'));assert.ok(diff[0].kinds.includes('translation'));assert.equal(diff.length,1);
});
test('source-supplied content_hash is provenance and cannot masquerade as a full-body fingerprint',()=>{
  const entries=[row('a')],meta=supplement(entries);
  delete meta.records.a.evidence.snapshot_original_sha256;delete meta.records.a.evidence.snapshot_translation_sha256;
  meta.records.a.evidence.source_hash={field:'content_hash',value:'looks-like-a-hash',algorithm:'unspecified'};
  assert.equal(R.snapshotFor(entries,{version:'v1'},meta).fullFingerprintCount,0);
});
test('new entries, missing-to-translated, and verified date recovery receive separate changes',()=>{
  const entries=[row('a')],meta=supplement(entries),baseline=R.snapshotFor(entries,{version:'v1'},meta);
  const changed=[row('a',{chinese_translation:'有效中文翻译'}),row('b')],next=supplement(changed,{a:'available'});
  next.records.a.publication={original:'',effective:'2026-09-01T12:00:00Z',status:'recovered',verified:true,basis:['post_id_match']};
  const diffs=R.compareSnapshots(baseline,R.snapshotFor(changed,{version:'v2'},next));
  assert.ok(diffs.find(d=>d.id==='a').kinds.includes('translated'));
  assert.ok(diffs.find(d=>d.id==='a').kinds.includes('recovered'));
  assert.deepEqual(diffs.find(d=>d.id==='b').kinds,['added']);
});
test('related candidates explain URL/title/link signals and sort by record date',()=>{
  const seed={angle:'clue',r:{id:'clue-a',title:'North Korea Strategic Playbook',original_url:'https://example.test/source'}};
  const entries=[seed,{angle:'news',r:{id:'news-a',title_en:'North Korea Strategic Playbook',url:'https://example.test/other',publish_time:'2026-09-02'}},{angle:'social',r:{id:'social-a',title:'unrelated',content_url:'https://example.test/source?utm_source=x',publish_time:'2026-09-01'}},{angle:'news',r:{id:'news-b',title_en:'unrelated',url:'https://example.test/linked',publish_time:'2026-09-03'}}];
  const result=R.relatedCandidates(seed,entries,{fields:{original_content:'See https://example.test/linked'}});
  assert.deepEqual(result.map(e=>e.r.id),['news-b','news-a','social-a']);
  assert.ok(result[0].reasons.some(r=>r.type==='link'));assert.ok(result[1].reasons.some(r=>r.type==='keywords'));assert.ok(result[2].reasons.some(r=>r.type==='url'));
});
test('ready means retrieval ready; collection status requires explicit collection evidence',()=>{
  const facts=Object.fromEntries(R.serviceStatusModel(all,META,RESEARCH,{service:'zgclab-database',state:'ready',database:'ready'}));
  assert.equal(facts['检索服务'],'已就绪（已有快照检索）');assert.equal(facts['采集任务证据'],'未接入采集任务证据');
  assert.equal(Object.fromEntries(R.serviceStatusModel([],META,null,{collection:{state:'running',last_success_at:'actual-time'}}))['采集任务报告最近成功'],'actual-time');
});
test('all four user categories have value, fields, support, gaps, priority and actionable links',()=>{
  assert.equal(new Set(R.planCatalog.map(p=>p.category)).size,4);
  for(const p of R.planCatalog) for(const key of ['title','value','fields','support','gap','priority','issue'])assert.ok(p[key],p.id+':'+key);
});
test('mergeBackup adds and deduplicates records while preserving unrelated workspace fields',()=>{
  const ws=workspace(),before=JSON.stringify(ws),backup={relations:[group('relation-a','研究')],collectionPlan:{schema:1,tasks:{'publication-basis':task()}}};
  const result=R.mergeBackup(backup,ws);assert.equal(result.addedGroups,1);assert.equal(result.addedTasks,1);
  assert.equal(R.mergeBackup(backup,ws).addedGroups,0);assert.equal(ws.relations.length,1);
  const {relations,researchChanges,collectionPlan,...rest}=ws;assert.equal(JSON.stringify(rest),before);
  backup.relations[0].records.push({angle:'clue',id:'clue-1'});
  assert.equal(R.mergeBackup(backup,ws).addedMembers,1);assert.equal(ws.relations[0].records.length,2);
});
test('conflicting names, tasks and baselines keep local state and preserve import copies exactly once',()=>{
  const ws=workspace(),baseline=R.snapshotFor([row('a')],{version:'local'},null);
  ws.relations=[group('relation-a','本地名称')];ws.collectionPlan={schema:1,tasks:{'publication-basis':task('doing','本地批注')}};
  ws.researchChanges={schema:1,real:{baseline,viewedAt:'local-time',subscription:{scope:'watchlist',kind:'all',queryHash:'',notify:false,savedAt:'local-time'}}};
  const backup={relations:[group('relation-a','导入名称')],collectionPlan:{schema:1,tasks:{'publication-basis':task('done','导入批注')}},researchChanges:{schema:1,real:{baseline:R.snapshotFor([row('b')],{version:'import'},null),subscription:{scope:'all',kind:'content',queryHash:'',notify:true,savedAt:'import-time'}}}};
  const result=R.mergeBackup(backup,ws);assert.equal(result.addedGroups,1);assert.equal(result.preservedTaskCopies,1);assert.equal(result.preservedChangeCopies,1);
  assert.equal(ws.relations[0].name,'本地名称');assert.match(ws.relations[1].name,/导入副本/);
  assert.equal(ws.collectionPlan.tasks['publication-basis'].status,'doing');assert.equal(ws.collectionPlan.importedTasks[0].note,'导入批注');
  assert.equal(ws.researchChanges.real.baseline.version,'local');assert.equal(ws.researchChanges.real.subscription.scope,'watchlist');assert.equal(ws.researchChanges.real.importedStates[0].baseline.version,'import');
  const again=R.mergeBackup(backup,ws);assert.equal(again.preservedTaskCopies,0);assert.equal(again.preservedChangeCopies,0);assert.equal(again.addedGroups,0);
  const roundtrip=R.validateWorkspaceSupplement(JSON.parse(JSON.stringify(ws)));
  assert.equal(roundtrip.collectionPlan.importedTasks.length,1);assert.equal(roundtrip.researchChanges.real.importedStates.length,1);
});
test('import without local baseline restores baseline; legacy backups are no-op',()=>{
  const ws=workspace(),before=JSON.stringify(ws);
  assert.equal(R.mergeBackup({favorites:[]},ws).addedGroups,0);assert.equal(JSON.stringify(ws),before);
  const baseline=R.snapshotFor([row('a')],{version:'backup'},null);
  assert.equal(R.mergeBackup({researchChanges:{schema:1,real:{baseline}}},ws).importedBaselines,1);
  assert.equal(ws.researchChanges.real.baseline.version,'backup');
});
test('invalid research imports fail atomically and prototype payloads cannot pollute objects',()=>{
  const ws=workspace(),before=JSON.stringify(ws);
  for (const input of [{relations:'bad'},{relations:[group('relation-a','x',[{angle:'evil',id:'a'}])]},{relations:[group('__proto__','bad')]},{collectionPlan:{schema:1,tasks:{unknown:{id:'unknown',status:'done'}}}},{researchChanges:{schema:7}},{relations:Array.from({length:301},()=>group('relation-a','x'))}]) {
    assert.throws(()=>R.mergeBackup(input,ws));assert.equal(JSON.stringify(ws),before);
  }
  const hostile=JSON.parse('{"relations":[{"id":"relation-safe","name":"</textarea><img src=x onerror=alert(1)>","records":[],"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}');
  R.mergeBackup(hostile,ws);assert.equal(Object.prototype.polluted,undefined);assert.equal(JSON.stringify(ws.relations).includes('__proto__'),false);
  assert.doesNotMatch(R.escapeHtml(ws.relations[0].name),/<img|<\/textarea/);
});

test('compact real baseline fits a 2 MiB UTF-16 budget and preserves identical/changed comparisons',()=>{
  const snapshot=R.snapshotFor(all,META,RESEARCH),compact=R.compactSnapshot(snapshot);
  assert.ok(R.storageBytes(compact)<2*1024*1024);
  assert.equal(R.compareSnapshots(compact,snapshot).length,0);
  const changed=structuredClone(snapshot);changed.records['social:social-1'].content='tail-changed';
  assert.ok(R.compareSnapshots(compact,changed).find(r=>r.id==='social-1').kinds.includes('content'));
  const ws=workspace();R.mergeBackup({researchChanges:{schema:1,real:{baseline:compact}}},ws);
  assert.equal(ws.researchChanges.real.baseline.compact,true);
  assert.equal(R.compareSnapshots(ws.researchChanges.real.baseline,snapshot).length,0);
  console.log('real baseline bytes',JSON.stringify({utf8:Buffer.byteLength(JSON.stringify(compact)),utf16:R.storageBytes(compact),records:all.length}));
});

test('fingerprints.original/translation override excerpt fallbacks and detect equal-length tail changes',()=>{
  const entries=[row('a',{original_content:'same visible original',chinese_translation:'相同译文节选'})];
  const meta={records:{a:{angle:'social',translation:{status:'available'},fingerprints:{original:hash('same visible original'+'x'.repeat(3000)+'a'),translation:hash('相同译文节选'+'甲'.repeat(3000)+'一')},evidence:{original_chars:4000,translation_chars:4000}}}};
  const baseline=R.snapshotFor(entries,{version:'v1'},meta);
  assert.equal(baseline.fullFingerprintCount,1);
  meta.records.a.fingerprints.original=hash('same visible original'+'x'.repeat(3000)+'b');
  meta.records.a.fingerprints.translation=hash('相同译文节选'+'甲'.repeat(3000)+'二');
  const diffs=R.compareSnapshots(R.compactSnapshot(baseline),R.snapshotFor(entries,{version:'v2'},meta));
  assert.deepEqual(diffs[0].kinds,['content','translation']);
});

test('delivered additive fingerprints cover all full bodies and translations', {skip:!RESEARCH.records['social-1'].fingerprints},()=>{
  for(const entry of all){
    const hashes=RESEARCH.records[entry.r.id].fingerprints;
    assert.match(hashes.original,/^[a-f0-9]{64}$/);assert.match(hashes.translation,/^[a-f0-9]{64}$/);
  }
  const snapshot=R.snapshotFor(all,META,RESEARCH);
  assert.equal(snapshot.fullFingerprintCount,6989);
  for(const angle of ['social','clue']){
    const sample=delivered(angle,angle+'-1'),m=R.evidenceModel(angle,sample.entry.r,sample.detail),actual=RESEARCH.records[sample.entry.r.id].fingerprints;
    assert.equal(actual.original,hash(m.original));assert.equal(actual.translation,hash(m.translation));
  }
});

test('manual version checks distinguish newer/different service data, same snapshot, and missing version evidence',()=>{
  const current={version:'browser-version'},research={version:'research-v1',source:{version:'source-v1'}};
  assert.equal(R.compareServiceVersion({state:'ready',snapshot:{source_version:'source-v1',research_version:'research-v1'}},current,research).same,true);
  assert.equal(R.compareServiceVersion({state:'ready',snapshot:{source_version:'source-v2',research_version:'research-v1'}},current,research).different,true);
  assert.equal(R.compareServiceVersion({snapshot:{source_version:'source-v1',research_version:'research-v2'},change_tracking:'snapshot_only'},current,research).different,true);
  assert.equal(R.compareServiceVersion({state:'ready'},current,research).same,false);
  assert.equal(R.compareServiceVersion({state:'ready'},current,research).complete,false);
  const facts=Object.fromEntries(R.serviceStatusModel([],current,research,{state:'ready',snapshot:{source_version:'source-v2',research_version:'research-v2'}}));
  assert.match(facts['版本一致性'],/不一致/);assert.match(facts['版本一致性'],/不能当作当前页面/);
});

test('existing oversized groups are rejected without truncating any local or incoming data',()=>{
  const ws=workspace();ws.relations=Array.from({length:301},(_,n)=>group('relation-'+n,'existing '+n));
  const before=JSON.stringify(ws),backup={relations:[group('relation-import','new')]};
  assert.throws(()=>R.mergeBackup(backup,ws),/上限/);
  assert.equal(JSON.stringify(ws),before);assert.equal(ws.relations.length,301);
  assert.throws(()=>R.validateWorkspaceSupplement(ws),/上限/);
});
test('existing oversized relation members are rejected atomically instead of slicing 5001 to 5000',()=>{
  const ws=workspace();ws.relations=[group('relation-big','existing',Array.from({length:5001},(_,n)=>({angle:'news',id:'news-'+n})))];
  const before=JSON.stringify(ws);
  assert.throws(()=>R.mergeBackup({relations:[group('relation-small','new')]},ws),/上限/);
  assert.equal(JSON.stringify(ws),before);assert.equal(ws.relations[0].records.length,5001);
});
test('imports that would exceed group or member limits fail with existing boundary data intact',()=>{
  const ws=workspace();ws.relations=Array.from({length:300},(_,n)=>group('relation-'+n,'existing '+n));
  let before=JSON.stringify(ws);
  assert.throws(()=>R.mergeBackup({relations:[group('relation-new','new')]},ws),/上限/);
  assert.equal(JSON.stringify(ws),before);
  ws.relations=[group('relation-big','big',Array.from({length:5000},(_,n)=>({angle:'news',id:'news-'+n})))];before=JSON.stringify(ws);
  assert.throws(()=>R.mergeBackup({relations:[group('relation-big','big',[{angle:'news',id:'news-new'}])]},ws),/上限/);
  assert.equal(JSON.stringify(ws),before);
});

test('optional backup fields round-trip exactly without creating absent notes or empty import histories',()=>{
  const ownedTask=(fields={})=>({id:'publication-basis',title:'发布时间与日期恢复依据',priority:'P0',status:'todo',createdAt:'2026-11-08',updatedAt:'2026-11-08',...fields});
  const noteCases=[{}, {note:''}, {note:'实际备注 <img src=x onerror=alert(1)>'}];
  const historyCases=[{}, {importedTasks:[]}, {importedTasks:[{...ownedTask({note:'保留的导入备注'}),backupId:'task-copy-one'}]}];
  for(const note of noteCases)for(const history of historyCases){
    const backup={collectionPlan:{schema:1,tasks:{'publication-basis':ownedTask(note)},...history}};
    const original=JSON.stringify(backup),dest=workspace();
    assert.deepEqual(R.validateWorkspaceSupplement(backup).collectionPlan,backup.collectionPlan);
    assert.equal(R.mergeBackup(backup,dest).preservedTaskCopies,history.importedTasks?.length||0);
    assert.deepEqual(dest.collectionPlan,backup.collectionPlan);
    assert.equal(R.mergeBackup(backup,dest).preservedTaskCopies,0);
    assert.deepEqual(dest.collectionPlan,backup.collectionPlan);
    assert.equal(JSON.stringify(backup),original);
  }
  // An existing explicit empty list survives an incoming backup that omits it.
  const dest=workspace();dest.collectionPlan={schema:1,tasks:{'publication-basis':ownedTask()},importedTasks:[]};
  R.mergeBackup({collectionPlan:{schema:1,tasks:{'publication-basis':ownedTask()}}},dest);
  assert.deepEqual(dest.collectionPlan.importedTasks,[]);
  // Whitelisted optional task metadata, group timestamps and state history retain their presence.
  const sparse={relations:[{id:'relation-sparse',name:'分组',records:[]}],collectionPlan:{schema:1,tasks:{'publication-basis':{id:'publication-basis',status:'todo'}}},researchChanges:{schema:1,real:{subscription:{scope:'all',kind:'all'},viewedAt:''}}};
  const sparseDest=workspace();R.mergeBackup(sparse,sparseDest);R.mergeBackup(sparse,sparseDest);
  for(const key of ['relations','collectionPlan','researchChanges'])assert.deepEqual(sparseDest[key],sparse[key]);
  const explicit=structuredClone(sparse);explicit.relations[0].createdAt='';explicit.relations[0].updatedAt='';explicit.researchChanges.real.importedStates=[];
  const explicitDest=workspace();R.mergeBackup(explicit,explicitDest);R.mergeBackup(explicit,explicitDest);
  for(const key of ['relations','collectionPlan','researchChanges'])assert.deepEqual(explicitDest[key],explicit[key]);
  // Absent and explicitly empty notes are distinct conflicting edits; preserve both exactly once.
  const conflicting=workspace();conflicting.collectionPlan={schema:1,tasks:{'publication-basis':ownedTask({status:'doing',note:'本地备注'})}};
  const local=structuredClone(conflicting.collectionPlan.tasks['publication-basis']);
  for(const fields of [{},{note:''}]){
    const incoming={collectionPlan:{schema:1,tasks:{'publication-basis':ownedTask(fields)}}};
    assert.equal(R.mergeBackup(incoming,conflicting).preservedTaskCopies,1);
    assert.equal(R.mergeBackup(incoming,conflicting).preservedTaskCopies,0);
  }
  assert.deepEqual(conflicting.collectionPlan.tasks['publication-basis'],local);
  assert.equal(conflicting.collectionPlan.importedTasks.length,2);
  assert.equal(Object.hasOwn(conflicting.collectionPlan.importedTasks[0],'note'),false);
  assert.equal(conflicting.collectionPlan.importedTasks[1].note,'');
  const sanitized=R.validateWorkspaceSupplement({collectionPlan:{schema:1,tasks:{'publication-basis':{...ownedTask(),unknown:'ignored'}}}});
  assert.equal(Object.hasOwn(sanitized.collectionPlan.tasks['publication-basis'],'unknown'),false);
  // Invalid optional fields still fail before any existing fields are replaced.
  const unchanged=JSON.stringify(conflicting);
  for(const fields of [{note:null},{createdAt:[]},{priority:'unbounded'},{title:{html:'bad'}}]){
    assert.throws(()=>R.mergeBackup({collectionPlan:{schema:1,tasks:{'publication-basis':ownedTask(fields)}}},conflicting));
    assert.equal(JSON.stringify(conflicting),unchanged);
  }
});
