const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../query.js");
const inst = [{ktid:1,cn:"机构甲",en:"Alpha",type:"企业",country:"美国"},{ktid:2,cn:"机构乙",en:"Beta",type:"NGO",country:"英国"}];
const rows = [
  {angle:"social",r:{id:"a",ktid:1,platform:"X",account_handle:"alpha",publish_time:"2026-09-30T23:00:00Z",like_count:"100",comment_count:"0",repost_count:"20",view_count:"10000",language:"en",_has_translation:true}},
  {angle:"social",r:{id:"b",ktid:2,platform:"Facebook",publish_time:"2026-09-29",like_count:"",comment_count:"25",repost_count:"50",language:"en"}},
  {angle:"social",r:{id:"c",ktid:1,platform:"X",publish_time:"2026-09-29",like_count:"0",comment_count:"0",repost_count:"0",view_count:"0",_has_original:true,_has_translation:false,_media_types:["image","attachment"]}},
  {angle:"clue",r:{id:"d",ktid:1,risk_level:"高",publish_time:"2026-09-30",title:"AI policy"}},
  {angle:"clue",r:{id:"e",ktid:2,risk_level:"中",publish_time:"2026-09-28"}},
  {angle:"news",r:{id:"f",ktid:2,tag:"policy",publish_time:"2026-09-25"}},
  {angle:"news",r:{id:"g",ktid:2,tag:"security",publish_time:"2026-09-26"}},
];
const state = (values = {}) => Q.parse(new URLSearchParams(values));
const ids = (s, now) => Q.filter(rows,s,inst,now).entries.map(({r})=>r.id).sort();

test("type, country, multiple institutions and platform OR combine with AND",()=>{
  assert.deepEqual(ids(state({type:"企业",country:"美国",ids:"1,2",platforms:"X,Facebook"})),["a","c"]);
  assert.deepEqual(ids(state({ids:"1,2",angle:"social"})),["a","b","c"]);
});
test("risk and label multi-selection exclude other angles",()=>{
  assert.deepEqual(ids(state({risks:"高,中"})),["d","e"]);
  assert.deepEqual(ids(state({tags:"security,policy"})),["f","g"]);
  assert.match(Q.validate(state({risks:"高",platforms:"X"})),/不同角度/);
});
test("thresholds include boundaries, exclude missing, preserve zero, and AND all metrics",()=>{
  assert.deepEqual(ids(state({like_countMin:"100",like_countMax:"100",repost_countMin:"20"})),["a"]);
  assert.deepEqual(ids(state({like_countMin:"0",like_countMax:"0"})),["c"]);
  assert.deepEqual(ids(state({comment_countMin:"20"})),["b"]);
  assert.equal(Q.metric(rows[1].r,"engagement"),null);
  assert.equal(Q.metric(rows[0].r,"engagement"),120);
});
test("Beijing rolling dates exclude future events, normalize offsets and recompute",()=>{
  const s=state({period:"7"});
  assert.deepEqual(Q.dateRange(s,new Date("2026-09-30T17:00:00Z")),{from:"2026-09-25",to:"2026-10-01"});
  assert.equal(Q.recordDay("2026-09-30T23:00:00Z"),"2026-10-01");
  assert.equal(Q.filter(rows,state({period:"today"}),inst,new Date("2026-10-01T02:00:00Z")).entries[0].r.id,"a");
  assert.equal(Q.filter(rows,state({period:"7"}),inst,new Date("2026-11-02T02:00:00Z")).entries.length,0);
});
test("published-time filtering never silently falls back to collection time",()=>{
  const entries=[{angle:"social",r:{id:"x",ktid:1,collected_time:"2026-09-30"}}];
  assert.equal(Q.filter(entries,state({from:"2026-09-30"}),inst).entries.length,0);
  assert.equal(Q.filter(entries,state({from:"2026-09-30",dateField:"collected"}),inst).entries.length,1);
});
test("metric ranking top N does not pad with missing metrics",()=>{
  const result=Q.filter(rows,state({sort:"like_count",limit:"20"}),inst);
  assert.deepEqual(result.entries.map(({r})=>r.id),["a","c"]);
  assert.equal(result.matched,2);
});
test("all query parameters including rolling periods survive link serialization",()=>{
  const a=state({angle:"social",ids:"1,2",type:"企业",platforms:"X,Facebook",period:"7",like_countMin:"100",view_countMax:"10000",sort:"like_count",limit:"20",account:"X:alpha",language:"en",media:"image",page:"2",size:"25"});
  assert.deepEqual(Q.parse(new URLSearchParams(Q.serialize(a))),a);
  assert.equal(new URLSearchParams(Q.serialize(a)).get("from"),null);
});
test("translation/media/account filters are based on appropriate fields",()=>{
  assert.deepEqual(ids(state({translation:"missing",media:"image"})),["c"]);
  assert.deepEqual(ids(state({account:"X:alpha"})),["a"]);
  assert.deepEqual(ids(state({translation:"yes"})),["a"]);
});
test("invalid number bounds and date ranges produce usable errors",()=>{
  assert.match(Q.validate(state({like_countMin:"100",like_countMax:"20"})),/下限/);
  assert.match(Q.validate(state({like_countMin:"-1"})),/大于或等于 0/);
  assert.match(Q.validate(state({from:"2026-10-01",to:"2026-09-01"})),/开始日期/);
});
test("group totals and comparison windows are disjoint and explicit",()=>{
  const groups=Q.groups(rows,"risk");
  assert.deepEqual(groups,[["中",1],["高",1]].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const compare=Q.periodComparison(rows,state(),inst,new Date("2026-10-01T00:00:00Z"));
  assert.equal(compare.current,7);
  assert.equal(compare.previous,0);
  assert.equal(compare.percent,null);
  assert.equal(compare.previousTo,"2026-09-24");
});

test("social tags parse JSON, Python lists and plain tags without matching body substrings",()=>{
  assert.deepEqual(Q.tokenValues('["AI","芯片出口"]'),["AI","芯片出口"]);
  assert.deepEqual(Q.tokenValues("['FBI', 'ICYMI']"),["FBI","ICYMI"]);
  assert.deepEqual(Q.tokenValues("#test #AI #simulation"),["#test","#AI","#simulation"]);
  assert.deepEqual(Q.tokenValues("[]"),[]);
  const entries=[{angle:"social",r:{id:"tagged",ktid:1,hashtags:"['FBI']",mentions:"['ICEgov']",keywords:'["AI","芯片出口"]'}},{angle:"social",r:{id:"body-only",ktid:1,original_content:"FBI AI @ICEgov",hashtags:"['FBIOffice']"}}];
  assert.deepEqual(Q.filter(entries,state({hashtags:"#fbi",mentions:"@icegov",keywords:"芯片出口"}),inst).entries.map(({r})=>r.id),["tagged"]);
});
test("exact sources distinguish collection source from publisher and preserve OR within AND",()=>{
  const entries=[{angle:"news",r:{id:"one",ktid:1,source:"Google News RSS",publish_source:"cnn.com"}},{angle:"news",r:{id:"two",ktid:1,source:"Google News RSS discovery",publish_source:"cnn.com"}},{angle:"news",r:{id:"three",ktid:2,source:"Google News RSS",publish_source:"other.com"}}];
  assert.deepEqual(Q.filter(entries,state({sources:"Google News RSS",publishSources:"cnn.com"}),inst).entries.map(({r})=>r.id),["one"]);
  const params=new URLSearchParams({sources:"Google News RSS"});params.append("sources","Google News RSS discovery");
  assert.equal(Q.filter(entries,Q.parse(params),inst).entries.length,3);
});
test("facet parameters round trip commas, Unicode, repeated values, and legacy language",()=>{
  const params=new URLSearchParams({angle:"clue",industries:"Policy, research",attitudes:"无法判断",publisherDomains:"dhs.gov",languages:"en"});params.append("languages","en-US");
  const original=Q.parse(params);assert.deepEqual(Q.parse(new URLSearchParams(Q.serialize(original))),original);
  assert.deepEqual(Q.parse(new URLSearchParams({language:"en"})).languages,["en"]);
  assert.equal(Q.serialize(Q.parse(new URLSearchParams({language:"en"}))).includes("languages=en"),true);
});
test("missing facet values are separate from inability-to-judge labels and option counts deduplicate tags",()=>{
  const entries=[{angle:"clue",r:{id:"missing",ktid:1}},{angle:"clue",r:{id:"unknown",ktid:1,publisher_cn_attitude:"无法判断"}}];
  assert.deepEqual(Q.filter(entries,state({attitudes:Q.EMPTY}),inst).entries.map(({r})=>r.id),["missing"]);
  assert.deepEqual(Q.filter(entries,state({attitudes:"无法判断"}),inst).entries.map(({r})=>r.id),["unknown"]);
  const options=Q.facetOptions([{angle:"social",r:{hashtags:"['FBI', '#fbi']"}}],"hashtags");assert.equal(options.length,1);assert.equal(options[0].count,1);
});
test("changing angles removes incompatible categories and metric constraints",()=>{
  const selected=state({angle:"social",hashtags:"FBI",contentTypes:"post",like_countMin:"100",languages:"en",sort:"like_count"});
  Q.setAngle(selected,"clue");assert.deepEqual(selected.hashtags,[]);assert.deepEqual(selected.contentTypes,[]);assert.equal(selected.like_countMin,"");assert.equal(selected.sort,"newest");assert.deepEqual(selected.languages,["en"]);
  assert.match(Q.validate(state({angle:"all",publisherDomains:"dhs.gov",contentTypes:"post"})),/不同采集角度/);
});
