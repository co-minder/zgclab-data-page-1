/* Authenticated research API client. Password and session token live only in memory. */
(function (root) {
  "use strict";
  let password = "", token = "", expires = 0, login = null, authEpoch = 0;
  const config = () => root.ZGCLAB_SERVICE_CONFIG || {};
  function base() {
    const value = String(config().baseUrl || root.ZGCLAB_SERVICE_BASE || location.origin).replace(/\/$/, "");
    const url = new URL(value, location.href);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))) throw new Error("资料服务地址必须使用 HTTPS，或本机回环 HTTP");
    return url.origin;
  }
  async function exchange(value, options = {}) {
    const epoch = authEpoch, controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort",abort,{once:true});
    const timeout = setTimeout(abort,15_000);
    try {
      const response = await fetch(base() + "/api/session", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:value}),signal:controller.signal,cache:"no-store",credentials:"omit" });
      let data;
      try { data = await response.json(); }
      catch(error) { if(error.name === "AbortError")throw error;throw new Error("资料服务尚未连接，请稍后重试"); }
      if (epoch !== authEpoch) throw new DOMException("访问已锁定或登录已更新", "AbortError");
      if (!response.ok) { const error = new Error(data.error?.message || data.message || (typeof data.error === "string" ? data.error : "访问密码验证失败")); error.status=response.status;error.code=data.code||data.error?.code;throw error; }
      token = data.token || data.access_token || "";
      if (!token) throw new Error("资料服务未返回有效访问凭据");
      const parsed = typeof data.expires_at === "number" ? data.expires_at * (data.expires_at < 1e12 ? 1000 : 1) : Date.parse(data.expires_at || "");
      expires = Number.isFinite(parsed) ? parsed : Date.now() + Number(data.expires_in || 1800) * 1000;
      password = value;
      return {token, expires_at:new Date(expires).toISOString()};
    } finally { clearTimeout(timeout);options.signal?.removeEventListener("abort",abort); }
  }

  async function session(options = {}) {
    if (token && Date.now() < expires - 30_000) return token;
    if (!password) { const error = new Error("请输入网站访问密码以连接资料服务"); error.status = 401; error.code = "authentication_required"; throw error; }
    if (!login) {
      const job = exchange(password).finally(() => { if(login === job)login=null; });
      login = job;
    }
    const pending = login;
    if (options.signal) {
      await new Promise((resolve,reject)=>{
        const abort=()=>reject(new DOMException("请求已取消","AbortError"));
        if(options.signal.aborted){abort();return;}
        options.signal.addEventListener("abort",abort,{once:true});
        pending.then(resolve,reject).finally(()=>options.signal.removeEventListener("abort",abort));
      });
    } else await pending;
    return token;
  }
  async function request(path, options = {}, retried = false) {
    if (!/^\/api\/(?:status|search|chat|changes|snapshot)$/.test(path)) throw new Error("不支持的资料服务请求");
    const credential = await session(options);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", abort, {once:true});
    const timeout = setTimeout(abort, path === "/api/chat" ? 125_000 : 45_000);
    try {
      const response = await fetch(base() + path, {method:options.method || (options.body ? "POST" : "GET"),headers:{"Authorization":"Bearer " + credential,...(options.body ? {"Content-Type":"application/json"} : {})},body:options.body ? JSON.stringify(options.body) : undefined,signal:controller.signal,cache:"no-store",credentials:"omit"});
      let data; try { data = await response.json(); } catch (error) { if(error.name==="AbortError")throw error;throw new Error("资料服务返回格式无效，请重试"); }
      if (response.status === 401 && !retried) { token="";expires=0;return request(path,options,true); }
      if (!response.ok) { const error = new Error(data.error?.message || data.message || (typeof data.error === "string" ? data.error : "资料请求失败")); error.status=response.status;error.code=data.code || data.error?.code;throw error; }
      return data;
    } catch (error) {
      if (error.name === "AbortError" && !options.signal?.aborted) throw new Error("资料服务响应超时，可重试或先使用完整正文检索");
      if (error instanceof TypeError) throw new Error("资料服务暂时无法连接，可重试或先使用完整正文检索");
      throw error;
    } finally { clearTimeout(timeout);options.signal?.removeEventListener("abort",abort); }
  }
  root.ZGCLAB_SERVICE_CLIENT = {
    setPassword(value) { authEpoch++;password=String(value || "");token="";expires=0;login=null; },
    clear() { authEpoch++;password="";token="";expires=0;login=null; },
    authenticate(value,options) { authEpoch++;password="";token="";expires=0;login=null;return exchange(String(value||""),options); },
    session,
    request,
    status(options) { return request("/api/status",options); },
    search(payload,options) { return request("/api/search",{...options,method:"POST",body:payload}); },
    chat(payload,options) { return request("/api/chat",{...options,method:"POST",body:payload}); },
    get baseUrl() { return base(); }
  };
})(window);
