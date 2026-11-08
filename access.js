/* Unlock the encrypted Pages deployment. No password is embedded in this file. */
(function () {
  "use strict";
  const script = document.currentScript;
  const manifestUrl = new URL(script.dataset.manifest, location.href);
  const base = new URL(".", manifestUrl);
  // Remove keys written by older releases. An unlock lives only in this document.
  try { sessionStorage.removeItem("zgclab.access.key.v1"); } catch (_) { /* Storage is optional. */ }
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

  async function mount(shell, password) {
    const css = (await Promise.all(["styles.css", "projects.css", "research.css", "assistant.css"].map(decrypt))).join("\n");
    // Load the small startup assets before replacing the login screen.
    await loadScript("data/meta.js");
    await loadScript("core.js");
    await loadScript("query.js");
    await loadScript("explorer.js");
    await loadScript("tools.js");
    await loadScript("service-config.js");
    await loadScript("service-client.js");
    window.ZGCLAB_SERVICE_CLIENT.setPassword(password);
    password = "";
    await loadScript("projects.js");
    await loadScript("research.js");
    await loadScript("assistant.js");
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
    lock.onclick = () => { window.ZGCLAB_SERVICE_CLIENT.clear(); location.reload(); };
    document.querySelector(".topbar").appendChild(lock);
    const url = URL.createObjectURL(new Blob([appSource], { type: "text/javascript" }));
    await new Promise((resolve, reject) => {
      const tag = document.createElement("script"); tag.src = url;
      tag.onload = resolve; tag.onerror = () => reject(new Error("系统启动失败，请刷新重试。"));
      document.head.appendChild(tag);
    });
    URL.revokeObjectURL(url);
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
      key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: fromBase64(manifest.salt), iterations: manifest.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const shell = await decrypt("index.html");
      const password = input.value;
      input.value = "";
      await mount(shell, password);
    } catch (failure) {
      if (shellMounted) { location.reload(); return; }
      error.textContent = message(failure); input.select(); input.focus();
      starting = false; submit.disabled = false; submit.firstElementChild.textContent = "解锁并进入";
    }
  });

  // A page restored from back/forward cache must also request the password again.
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
})();
