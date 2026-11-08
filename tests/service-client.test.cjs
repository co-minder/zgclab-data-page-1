const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function client(fetch) {
  const window = {ZGCLAB_SERVICE_CONFIG:{baseUrl:"https://research.example"}};
  const context = {window,fetch,URL,AbortController,DOMException,setTimeout,clearTimeout,Date,location:{origin:"https://site.example",href:"https://site.example/"}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../service-client.js"),"utf8"),context);
  return window.ZGCLAB_SERVICE_CLIENT;
}
const reply = (status,data) => ({status,ok:status>=200&&status<300,json:async()=>data});

test("the API client exchanges an in-memory password and shares one login across concurrent requests",async()=>{
  const calls=[];
  const api=client(async(url,options)=>{
    calls.push({url,options});
    return url.endsWith("/session") ? reply(200,{token:"opaque-test-token",expires_in:1800}) : reply(200,{mode:"retrieval",results:[]});
  });
  api.setPassword("test-password");
  await Promise.all([api.search({query:"机构"}),api.status()]);
  assert.equal(calls.filter(c=>c.url.endsWith("/session")).length,1);
  for(const call of calls.filter(c=>!c.url.endsWith("/session"))){
    assert.equal(call.options.headers.Authorization,"Bearer opaque-test-token");
    assert.equal(call.options.body?.includes("test-password")||false,false);
    assert.equal(call.options.credentials,"omit");
  }
  assert.equal(Object.values(api).includes("test-password"),false);
  api.clear();
  await assert.rejects(api.search({query:"机构"}),e=>e.status===401);
});

test("an expired API token is exchanged once and invalid paths never reach fetch",async()=>{
  const calls=[];let searches=0,logins=0;
  const api=client(async(url,options)=>{
    calls.push(url);
    if(url.endsWith("/session"))return reply(200,{token:"token-"+(++logins),expires_in:1800});
    if(url.endsWith("/search")&&++searches===1)return reply(401,{error:"expired"});
    return reply(200,{results:[]});
  });
  api.setPassword("test-password");
  await api.search({query:"资料"});
  assert.equal(logins,2);assert.equal(searches,2);
  const previous=calls.length;
  await assert.rejects(api.request("/v1/chat/completions"),/不支持/);
  await assert.rejects(api.request("/api/search?url=https://other.example"),/不支持/);
  assert.equal(calls.length,previous);
});

test("API failures preserve structured authentication and rate-limit status",async()=>{
  const api=client(async(url)=>url.endsWith("/session")?reply(200,{token:"token",expires_in:1800}):reply(429,{error:{message:"请求过于频繁",code:"rate_limited"}}));
  api.setPassword("test-password");
  await assert.rejects(api.chat({message:"问题"}),e=>e.status===429&&e.code==="rate_limited"&&/频繁/.test(e.message));
});


test("a late login cannot restore a cleared session",async()=>{
  let resolveLogin;
  const pending=new Promise(resolve=>{resolveLogin=resolve;});
  const api=client(async()=>pending);
  api.setPassword("test-password");
  const login=api.session();
  api.clear();
  resolveLogin(reply(200,{token:"late-token",expires_in:1800}));
  await assert.rejects(login,e=>e.name==="AbortError");
  await assert.rejects(api.session(),e=>e.status===401);
});

test("cancelling one caller does not cancel another shared login",async()=>{
  let resolveLogin;
  const pending=new Promise(resolve=>{resolveLogin=resolve;});
  const api=client(async()=>pending);
  api.setPassword("test-password");
  const controller=new AbortController();
  const cancelled=api.session({signal:controller.signal});
  const surviving=api.session();
  controller.abort();
  resolveLogin(reply(200,{token:"shared-token",expires_in:1800}));
  await assert.rejects(cancelled,e=>e.name==="AbortError");
  assert.equal(await surviving,"shared-token");
});


test("API base validation also covers same-origin fallback and URL credentials",async()=>{
  const source=fs.readFileSync(require.resolve("../service-client.js"),"utf8");
  for(const candidate of ["http://public.example","https://user:password@research.example","https://research.example/?key=value","https://research.example/#fragment","https://research.example/unrelated"]){
    const window={ZGCLAB_SERVICE_CONFIG:{baseUrl:candidate}};
    vm.runInNewContext(source,{window,fetch:async()=>reply(200,{}),URL,AbortController,DOMException,setTimeout,clearTimeout,Date,location:{origin:"http://public.example",href:"http://public.example/"}});
    assert.throws(()=>window.ZGCLAB_SERVICE_CLIENT.baseUrl,/HTTPS/);
  }
  const window={};
  vm.runInNewContext(source,{window,fetch:async()=>reply(200,{}),URL,AbortController,DOMException,setTimeout,clearTimeout,Date,location:{origin:"http://public.example",href:"http://public.example/"}});
  assert.throws(()=>window.ZGCLAB_SERVICE_CLIENT.baseUrl,/HTTPS/);
});
