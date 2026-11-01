/* Unlock the encrypted Pages deployment. No password is embedded in this file. */
(function () {
  "use strict";
  const script = document.currentScript;
  const manifestUrl = new URL(script.dataset.manifest, location.href);
  const base = new URL(".", manifestUrl);
  const sessionKey = "zgclab.access.key.v1";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const form = document.querySelector("#accessForm");
  const input = document.querySelector("#accessPassword");
  const error = document.querySelector("#accessError");
  const submit = document.querySelector("#accessSubmit");
  let key;
  let manifest;
  let starting = false;
  let shellMounted = false;
  const loaded = new Map();

  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

  async function getManifest() {
    if (!manifest) {
      const response = await fetch(manifestUrl, { cache: "no-cache" });
      if (!response.ok) throw new Error("发布文件加载失败，请刷新或稍后重试。");
      manifest = await response.json();
    }
    return manifest;
  }

  async function decrypt(path) {
    const entry = manifest.assets[path];
    if (!entry) throw new Error("所需文件不在当前版本中，请刷新页面。");
    const response = await fetch(new URL(entry, base));
    if (!response.ok) throw new Error("数据加载失败，请检查网络后重试。");
    const encrypted = new Uint8Array(await response.arrayBuffer());
    const compressed = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.slice(0, 12), additionalData: encoder.encode(path) },
      key, encrypted.slice(12)
    );
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    return decoder.decode(await new Response(stream).arrayBuffer());
  }

  function loadScript(path) {
    path = path.split("?")[0];
    if (!loaded.has(path)) {
      const promise = decrypt(path).then((source) => new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const tag = document.createElement("script");
        tag.src = url;
        tag.onload = () => { URL.revokeObjectURL(url); resolve(); };
        tag.onerror = () => { URL.revokeObjectURL(url); tag.remove(); reject(new Error("数据文件执行失败，请重试。")); };
        document.head.appendChild(tag);
      })).catch((failure) => { loaded.delete(path); throw failure; });
      loaded.set(path, promise);
    }
    return loaded.get(path);
  }

  async function mount(shell) {
    const css = await decrypt("styles.css");
    // Load the small startup assets before replacing the login screen.
    await loadScript("data/meta.js");
    await loadScript("core.js");
    const appSource = await decrypt("app.js");
    const parsed = new DOMParser().parseFromString(shell, "text/html");
    parsed.querySelectorAll("script,noscript").forEach((tag) => tag.remove());
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    document.body.replaceChildren(...[...parsed.body.childNodes].map((node) => document.importNode(node, true)));
    shellMounted = true;
    window.ZGCLAB_LOADER = loadScript;
    const lock = document.createElement("button");
    lock.className = "btn access-lock-button";
    lock.id = "lockSession";
    lock.type = "button";
    lock.textContent = "锁定";
    lock.setAttribute("aria-label", "锁定页面");
    lock.onclick = () => {
      try { sessionStorage.removeItem(sessionKey); } catch (_) { /* Storage is optional. */ }
      location.reload();
    };
    document.querySelector(".topbar").appendChild(lock);
    const url = URL.createObjectURL(new Blob([appSource], { type: "text/javascript" }));
    await new Promise((resolve, reject) => {
      const tag = document.createElement("script"); tag.src = url;
      tag.onload = resolve; tag.onerror = () => reject(new Error("系统启动失败，请刷新重试。"));
      document.head.appendChild(tag);
    });
    URL.revokeObjectURL(url);
  }

  function rememberKey(raw) {
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ version: manifest.version, key: toBase64(raw) })); }
    catch (_) { /* Private browsing may disable session storage. */ }
  }

  function message(failure) {
    if (failure.name === "OperationError") return "密码不正确，请重新输入。";
    return failure.message || "暂时无法解锁，请刷新后重试。";
  }

  document.querySelector("#accessToggle").onclick = (event) => {
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "隐藏" : "显示";
    event.currentTarget.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    input.focus();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (starting) return;
    starting = true; submit.disabled = true; error.textContent = ""; submit.firstElementChild.textContent = "正在解锁…";
    try {
      if (!crypto.subtle || typeof DecompressionStream === "undefined") throw new Error("请使用最新版本的 Chrome、Safari 或 Edge，并通过 HTTPS 访问。");
      await getManifest();
      const material = await crypto.subtle.importKey("raw", encoder.encode(input.value), "PBKDF2", false, ["deriveKey"]);
      key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: fromBase64(manifest.salt), iterations: manifest.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      const shell = await decrypt("index.html");
      input.value = "";
      await mount(shell);
      rememberKey(await crypto.subtle.exportKey("raw", key));
    } catch (failure) {
      if (shellMounted) { location.reload(); return; }
      error.textContent = message(failure); input.select(); input.focus();
      starting = false; submit.disabled = false; submit.firstElementChild.textContent = "解锁并进入";
    }
  });

  (async function restore() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch (_) { return; }
    if (!saved || !crypto.subtle || typeof DecompressionStream === "undefined") return;
    starting = true; submit.disabled = true; submit.firstElementChild.textContent = "正在恢复会话…";
    try {
      await getManifest();
      if (saved.version !== manifest.version) throw new Error("版本已更新，请重新输入访问密码。");
      key = await crypto.subtle.importKey("raw", fromBase64(saved.key), "AES-GCM", true, ["decrypt"]);
      await mount(await decrypt("index.html"));
    } catch (failure) {
      try { sessionStorage.removeItem(sessionKey); } catch (_) { /* Storage is optional. */ }
      if (shellMounted) { location.reload(); return; }
      starting = false; submit.disabled = false; submit.firstElementChild.textContent = "解锁并进入";
      error.textContent = failure.name === "OperationError" ? "请重新输入访问密码。" : message(failure);
    }
  })();
})();
