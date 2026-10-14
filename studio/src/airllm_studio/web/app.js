/* AirLLM Studio web UI. No build step, no dependencies. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return node;
  };
  const icon = (path, extra = "") => {
    const span = document.createElement("span");
    span.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true" ${extra}>${path}</svg>`;
    return span.firstChild;
  };
  const ICONS = {
    copy: '<rect x="6.5" y="6.5" width="9" height="9" rx="1.6"/><path d="M4.5 13V5.6c0-.6.5-1.1 1.1-1.1H13"/>',
    check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
    retry: '<path d="M15.5 9.5a5.5 5.5 0 1 1-1.8-4.1M15.5 3.5v3.5H12"/>',
    edit: '<path d="M4 16h3l8.3-8.3-3-3L4 13v3zM11.3 5.7l3 3"/>',
    trash: '<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/>',
  };

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem("airllm." + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem("airllm." + key, JSON.stringify(value)); } catch { /* storage may be off */ } },
  };

  // ------------------------------------------------------------------ API
  async function api(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(path, {
      method, signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!res.ok) {
      const msg = data.error?.message || data.error || data.detail || `${res.status} ${res.statusText}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  function toast(message, kind = "") {
    const node = el("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : "status", text: message });
    $("#toasts").append(node);
    setTimeout(() => node.remove(), kind === "error" ? 7000 : 3500);
  }

  // ------------------------------------------------------------------ formatting
  const fmtBytes = (n) => {
    if (!n) return "0 B";
    const u = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
    const v = n / 1024 ** i;
    return `${v >= 100 || i < 2 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
  };
  const fmtDuration = (s) => {
    if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} min ${Math.round(s % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Small, safe Markdown: everything is escaped first, then a fixed set of constructs is formatted.
  function inlineMd(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = escapeHtml(s);
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`);
  }

  function renderMarkdown(src) {
    const out = [];
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(para.join("\n")).replace(/\n/g, "<br>")}</p>`); para = []; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w+#.-]*)/);
      if (fence) {
        flushPara();
        const lang = fence[1];
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push(`<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}>${lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ""}<code>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) { flushPara(); out.push(`<h${heading[1].length + 1}>${inlineMd(heading[2])}</h${heading[1].length + 1}>`); i++; continue; }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flushPara();
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          let item = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
          i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) item += "\n" + lines[i++].trim();
          items.push(`<li>${inlineMd(item).replace(/\n/g, "<br>")}</li>`);
        }
        out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
        continue;
      }
      if (/^\s*>/.test(line)) {
        flushPara();
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push(`<blockquote>${inlineMd(quote.join("\n")).replace(/\n/g, "<br>")}</blockquote>`);
        continue;
      }
      if (!line.trim()) { flushPara(); i++; continue; }
      para.push(line);
      i++;
    }
    flushPara();
    return out.join("");
  }

  // Reasoning models (e.g. Qwen3) wrap their thinking in <think>…</think>.
  function renderAnswer(text, streaming) {
    if (streaming && (text.match(/\*\*/g) || []).length % 2) text = text.replace(/\*\*(?!.*\*\*)/s, "");
    const m = text.match(/^\s*<think>([\s\S]*?)(<\/think>|$)([\s\S]*)$/);
    if (!m) return renderMarkdown(text);
    const closed = m[2] === "</think>";
    const thinking = `<details class="think"${closed ? "" : " open"}><summary>${closed ? "Reasoning" : "Reasoning…"}</summary>${renderMarkdown(m[1].trim())}</details>`;
    return thinking + renderMarkdown(m[3] || "");
  }

  // ------------------------------------------------------------------ state
  const state = {
    view: "chat",
    status: null,
    models: [],
    chats: [],
    chat: null,                 // { id, title, model, messages: [{role, content, stats?, model?}] }
    model: store.get("model", ""),
    abort: null,
    settings: null,
    catalog: [],
    online: true,
  };

  const readyModels = () => state.models.filter((m) => m.status === "ready");

  // ------------------------------------------------------------------ views
  function show(view) {
    state.view = view;
    for (const v of ["chat", "models", "settings"]) $(`#view-${v}`).hidden = v !== view;
    $("#navModels").classList.toggle("active", view === "models");
    $("#navSettings").classList.toggle("active", view === "settings");
    $("#app").classList.remove("menu-open");
    if (view === "models") refreshModels().then(renderDiscover);
    if (view === "settings") loadSettings();
    if (view === "chat") $("#prompt").focus();
    renderChatList();
  }

  // ------------------------------------------------------------------ status
  async function refreshStatus() {
    try {
      state.status = await api("/api/studio/status");
      state.online = true;
    } catch {
      state.online = false;
    }
    renderStatus();
  }

  function deviceLabel(s) {
    if (!s) return "Connecting…";
    const gpus = s.hardware?.gpus || [];
    const dev = s.device || "";
    if (dev.startsWith("cuda") && gpus.length) {
      const idx = parseInt(dev.split(":")[1] || "0", 10);
      return (gpus[idx] || gpus[0]).name;
    }
    if (!s.hardware?.torch) return "Checking hardware…";
    return gpus.length ? "CPU (GPU available)" : "CPU only";
  }

  function renderStatus() {
    const s = state.status;
    const dot = $("#deviceDot");
    dot.className = "dot " + (!state.online ? "down" : s?.engine?.state === "generating" || s?.engine?.state === "loading" ? "busy" : "ok");
    $("#deviceText").textContent = state.online ? deviceLabel(s) : "Server not reachable";
    const eng = s?.engine;
    let text = "";
    if (!state.online) text = "Server not reachable";
    else if (eng?.state === "loading") text = `Loading ${eng.model || "model"}…`;
    else if (eng?.state === "generating") text = eng.queued ? `Busy, ${eng.queued} waiting` : "Generating";
    else if (eng?.model) text = `${eng.model} loaded`;
    $("#engineState").textContent = text;
    if (s && state.view === "models") $("#storageInfo").textContent =
      `Stored in ${s.models_dir} (${fmtBytes(s.disk?.free || 0)} free)`;
  }

  // ------------------------------------------------------------------ models
  async function refreshModels() {
    try {
      state.models = (await api("/api/studio/models")).models;
    } catch (e) { return; }
    renderModelPicker();
    if (state.view === "models") renderInstalled();
    if (state.view === "chat" && !state.chat?.messages?.length) renderThread();
  }

  function renderModelPicker() {
    const sel = $("#modelSelect");
    const ready = readyModels();
    const current = state.chat?.model || state.model;
    sel.innerHTML = "";
    if (!ready.length) {
      sel.append(el("option", { value: "", text: "No models yet" }));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const m of ready) sel.append(el("option", { value: m.name, text: m.name }));
    const pick = ready.some((m) => m.name === current) ? current : ready[0].name;
    sel.value = pick;
    if (!state.model || !ready.some((m) => m.name === state.model)) { state.model = pick; store.set("model", pick); }
  }

  function jobLine(job) {
    if (!job || job.done) return null;
    let pct = 0, label = job.message || job.phase;
    if (job.phase === "downloading" && job.total) {
      pct = (job.completed / job.total) * 100;
      label = `Downloading ${fmtBytes(job.completed)} of ${fmtBytes(job.total)}`;
    } else if (job.phase === "preparing" && job.layers_total) {
      pct = (job.layers_done / job.layers_total) * 100;
      label = `Preparing layers ${job.layers_done} of ${job.layers_total} (one time)`;
    }
    return el("div", { class: "progress" },
      el("div", { class: "bar", role: "progressbar", "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100 },
        el("span", { style: `width:${Math.max(2, pct).toFixed(1)}%` })),
      el("small", { text: `${label} (${Math.floor(pct)}%)` }));
  }

  function confirmInline(container, question, onYes) {
    const original = [...container.childNodes];
    container.replaceChildren(el("span", { class: "confirm" }, question,
      el("button", { class: "btn small danger", type: "button", onclick: onYes, text: "Delete" }),
      el("button", { class: "btn small", type: "button", text: "Keep", onclick: () => container.replaceChildren(...original) })));
  }

  function renderInstalled() {
    const box = $("#installed");
    box.replaceChildren();
    if (!state.models.length) {
      box.append(el("p", { class: "empty-row", text: "Nothing installed yet. Pull one of the suggested models below to start." }));
      return;
    }
    for (const m of state.models) {
      const busy = m.job && !m.job.done;
      const meta = el("div", { class: "meta" });
      if (m.parameter_size) meta.append(el("span", { text: `${m.parameter_size} parameters` }));
      if (m.size_on_disk) meta.append(el("span", { text: fmtBytes(m.size_on_disk) + " on disk" }));
      if (m.context_length) meta.append(el("span", { text: `${m.context_length.toLocaleString()} token context` }));
      if (m.compression && m.compression !== "none") meta.append(el("span", { text: m.compression }));
      if (m.status === "error" && !busy) meta.append(el("span", { class: "err", text: m.error || "Failed" }));

      const actions = el("div", { class: "actions" });
      if (busy) {
        actions.append(el("button", { class: "btn small", type: "button", text: "Cancel", onclick: () => cancelPull(m.name) }));
      } else if (m.status === "ready") {
        actions.append(el("button", { class: "btn small primary", type: "button", text: "Chat", onclick: () => { selectModel(m.name); newChat(); } }));
        actions.append(m.loaded
          ? el("button", { class: "btn small", type: "button", text: "Unload", onclick: () => unloadModel() })
          : el("button", { class: "btn small", type: "button", text: "Load", onclick: (e) => loadModel(m.name, e.target) }));
      } else {
        actions.append(el("button", { class: "btn small", type: "button", text: "Retry", onclick: () => pull(m.source === "local" ? m.repo : m.name) }));
      }
      if (!busy) actions.append(el("button", {
        class: "icon-btn", type: "button", "aria-label": `Delete ${m.name}`, title: "Delete",
        onclick: () => confirmInline(actions, `Delete ${fmtBytes(m.size_on_disk)}?`, () => deleteModel(m.name)),
      }, icon(ICONS.trash)));

      const row = el("div", { class: "row" },
        el("div", {},
          el("div", { class: "name" }, m.name, m.loaded ? " " : "", m.loaded ? el("span", { class: "tag", text: "loaded" }) : null),
          meta),
        actions);
      const line = jobLine(m.job);
      if (line) row.append(line);
      box.append(row);
    }
  }

  let searchTimer = null;
  let searchSeq = 0;
  async function renderDiscover() {
    const q = $("#pullInput").value.trim();
    const box = $("#discover");
    const looksLikeId = /^[\w.-]+\/[\w.-]+$/.test(q) || /^([a-zA-Z]:)?[\\/~.]/.test(q);
    let items;
    if (q.length >= 2 && !looksLikeId) {
      $("#discoverTitle").textContent = `Hugging Face results for “${q}”`;
      const seq = ++searchSeq;
      box.replaceChildren(el("p", { class: "empty-row", text: "Searching…" }));
      try {
        const res = await api(`/api/studio/search?q=${encodeURIComponent(q)}`);
        if (seq !== searchSeq) return;
        items = res.models.map((r) => ({
          name: r.name, title: "", summary: "",
          download: "", vram: "", gated: r.gated, gguf: r.gguf,
          extra: `${r.downloads.toLocaleString()} downloads`,
        }));
      } catch (e) {
        box.replaceChildren(el("p", { class: "empty-row", text: `Search failed: ${e.message}` }));
        return;
      }
      if (!items.length) { box.replaceChildren(el("p", { class: "empty-row", text: "No text-generation models match." })); return; }
    } else {
      $("#discoverTitle").textContent = "Suggested";
      if (!state.catalog.length) {
        try { state.catalog = (await api("/api/studio/catalog")).models; } catch { state.catalog = []; }
      }
      items = state.catalog;
    }
    const installed = new Map(state.models.map((m) => [m.name.toLowerCase(), m]));
    box.replaceChildren(...items.map((c) => {
      const have = installed.get(c.name.toLowerCase());
      const meta = el("div", { class: "meta" });
      if (c.download) meta.append(el("span", { text: `${c.download} download` }));
      if (c.vram) meta.append(el("span", { text: `${c.vram} GPU memory` }));
      if (c.extra) meta.append(el("span", { text: c.extra }));
      if (c.gated) meta.append(el("span", { class: "tag warn", text: "needs Hugging Face token" }));
      if (c.gguf) meta.append(el("span", { class: "tag warn", text: "GGUF only, not supported" }));
      const action = have
        ? el("span", { class: "tag", text: have.status === "ready" ? "Installed" : have.status })
        : el("button", { class: "btn small", type: "button", text: "Pull", onclick: () => pull(c.name) });
      return el("div", { class: "row" },
        el("div", {},
          c.title ? el("div", { class: "title", text: c.title }) : null,
          el("div", { class: "name", text: c.name }),
          c.summary ? el("div", { class: "summary", text: c.summary }) : null,
          meta),
        el("div", { class: "actions" }, action));
    }));
  }

  async function pull(name) {
    if (!name) return;
    try {
      await api("/api/studio/models/pull", { method: "POST", body: { name } });
      toast(`Pulling ${name}`);
      await refreshModels();
      renderDiscover();
      pollModelsSoon();
    } catch (e) { toast(e.message, "error"); }
  }

  async function cancelPull(name) {
    try { await api("/api/studio/models/cancel", { method: "POST", body: { name } }); toast("Cancelling…"); }
    catch (e) { toast(e.message, "error"); }
  }

  async function deleteModel(name) {
    try {
      await api("/api/delete", { method: "DELETE", body: { model: name } });
      toast(`Deleted ${name}`);
      await refreshModels();
      renderDiscover();
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadModel(name, button) {
    if (button) { button.disabled = true; button.textContent = "Loading…"; }
    try {
      await api("/api/studio/models/load", { method: "POST", body: { name } });
      toast(`${name} is loaded`);
    } catch (e) { toast(e.message, "error"); }
    await refreshModels();
    refreshStatus();
  }

  async function unloadModel() {
    try { await api("/api/studio/models/unload", { method: "POST" }); } catch (e) { toast(e.message, "error"); }
    await refreshModels();
    refreshStatus();
  }

  let modelPoll = null;
  function pollModelsSoon() {
    if (modelPoll) return;
    modelPoll = setInterval(async () => {
      await refreshModels();
      const active = state.models.some((m) => m.job && !m.job.done);
      if (!active) {
        clearInterval(modelPoll); modelPoll = null;
        const justReady = state.models.filter((m) => m.status === "ready" && m.job?.phase === "success");
        if (justReady.length && state.view === "models") renderDiscover();
      }
    }, 1200);
  }

  function selectModel(name) {
    state.model = name;
    store.set("model", name);
    if (state.chat) state.chat.model = name;
    renderModelPicker();
  }

  // ------------------------------------------------------------------ chats
  async function refreshChats() {
    try { state.chats = (await api("/api/studio/chats")).chats; } catch { state.chats = []; }
    renderChatList();
  }

  function groupLabel(ts) {
    const d = new Date(ts * 1000), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = (day(now) - day(d)) / 86400000;
    if (diff < 1) return "Today";
    if (diff < 2) return "Yesterday";
    if (diff < 7) return "Previous 7 days";
    if (diff < 30) return "Previous 30 days";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  }

  function renderChatList() {
    const nav = $("#chatList");
    nav.replaceChildren();
    let lastGroup = "";
    for (const c of state.chats) {
      const g = groupLabel(c.updated_at);
      if (g !== lastGroup) { nav.append(el("div", { class: "chat-group", text: g })); lastGroup = g; }
      const active = state.view === "chat" && state.chat?.id === c.id;
      const item = el("div", { class: "chat-item" + (active ? " active" : "") });
      const link = el("a", { href: "#" + c.id, text: c.title || "New chat", title: c.title,
        "aria-current": active ? "page" : null, onclick: (e) => { e.preventDefault(); openChat(c.id); } });
      const rename = el("button", { class: "icon-btn", type: "button", "aria-label": "Rename chat", title: "Rename",
        onclick: () => {
          const input = el("input", { value: c.title, "aria-label": "Chat title" });
          const finish = async (save) => {
            if (save && input.value.trim() && input.value.trim() !== c.title) {
              await api(`/api/studio/chats/${c.id}`, { method: "PATCH", body: { title: input.value.trim() } }).catch((e) => toast(e.message, "error"));
              if (state.chat?.id === c.id) state.chat.title = input.value.trim();
            }
            refreshChats();
          };
          input.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
          input.addEventListener("blur", () => finish(true));
          item.replaceChildren(input);
          input.focus(); input.select();
        } }, icon(ICONS.edit));
      const del = el("button", { class: "icon-btn", type: "button", "aria-label": "Delete chat", title: "Delete",
        onclick: async () => {
          await api(`/api/studio/chats/${c.id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
          if (state.chat?.id === c.id) newChat();
          refreshChats();
        } }, icon(ICONS.trash));
      item.append(link, rename, del);
      nav.append(item);
    }
  }

  async function openChat(id) {
    if (state.abort) return toast("Wait for the answer to finish, or stop it first.");
    try {
      state.chat = await api(`/api/studio/chats/${id}`);
      if (state.chat.model) selectModel(state.chat.model);
      show("chat");
      renderThread(true);
    } catch (e) { toast(e.message, "error"); }
  }

  function newChat() {
    if (state.abort) return toast("Wait for the answer to finish, or stop it first.");
    state.chat = null;
    show("chat");
    renderThread();
  }

  async function persistChat() {
    const c = state.chat;
    if (!c) return;
    const messages = c.messages.filter((m) => !m.pending);
    try {
      if (!c.id) {
        const created = await api("/api/studio/chats", { method: "POST", body: { title: c.title, model: c.model, messages } });
        c.id = created.id;
      } else {
        await api(`/api/studio/chats/${c.id}`, { method: "PATCH", body: { model: c.model, messages } });
      }
      refreshChats();
    } catch (e) { toast(`Could not save the chat: ${e.message}`, "error"); }
  }

  // ------------------------------------------------------------------ thread rendering
  function emptyState() {
    const box = el("div", { class: "empty" }, el("img", { src: "icon.svg", alt: "" }));
    if (!state.online) {
      box.append(el("h2", { text: "AirLLM server is not reachable" }),
        el("p", { text: "Start it from the AirLLM app or run “airllm serve”, then this page reconnects by itself." }));
    } else if (!readyModels().length) {
      const pulling = state.models.find((m) => m.job && !m.job.done);
      box.append(el("h2", { text: pulling ? `Getting ${pulling.name} ready` : "Get a model to start" }),
        el("p", { text: pulling
          ? "You can chat as soon as the download and one-time layer preparation finish."
          : "AirLLM runs models far larger than your GPU memory by reading one layer at a time from disk. Start with the tiny test model to check everything works, then pull a real one." }),
        el("button", { class: "btn primary", type: "button", text: "Browse models", onclick: () => show("models") }),
        pulling ? null : el("button", { class: "btn", type: "button", text: "Try SmolLM2 135M (270 MB)",
          onclick: () => { pull("HuggingFaceTB/SmolLM2-135M-Instruct"); show("models"); } }));
    } else {
      box.append(el("h2", { text: "What should we work on?" }),
        el("p", { text: `Talking to ${state.model}. Large models read every layer from disk for each token, so answers arrive slowly but steadily; the meter above the message box shows the progress.` }));
    }
    return box;
  }

  function messageNode(m, index) {
    const node = el("div", { class: `msg ${m.role}${m.error ? " error" : ""}` });
    const body = el("div", { class: "body" });
    if (m.role === "user") body.textContent = m.content;
    else if (m.error) body.textContent = m.content;
    else if (m.pending && !m.content) body.append(el("span", { class: "waiting caret", text: m.statusText || "" }));
    else {
      body.innerHTML = renderAnswer(m.content, m.pending);
      if (m.pending) body.lastElementChild?.classList.add("caret");
      decorateCode(body);
    }
    node.append(body);
    if (m.role === "assistant" && !m.pending) {
      const foot = el("div", { class: "msg-foot" });
      if (!m.error) foot.append(copyButton(() => m.content, "Copy answer"));
      if (index === state.chat.messages.length - 1) foot.append(el("button", {
        class: "icon-btn", type: "button", "aria-label": "Regenerate", title: "Regenerate", onclick: regenerate,
      }, icon(ICONS.retry)));
      if (m.stats) {
        const s = m.stats;
        const parts = [`${s.tokens} tokens`];
        if (s.tps) parts.push(`${s.tps.toFixed(s.tps < 1 ? 2 : 1)} tokens/s`);
        if (s.seconds) parts.push(fmtDuration(s.seconds));
        if (s.reason === "length") parts.push("stopped at max length");
        if (s.reason === "cancelled") parts.push("stopped");
        foot.append(el("span", { class: "stats", text: parts.join(", ") }));
      }
      node.append(foot);
    }
    return node;
  }

  function copyButton(getText, label) {
    const btn = el("button", { class: "icon-btn", type: "button", "aria-label": label, title: label }, icon(ICONS.copy));
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(getText());
        btn.replaceChildren(icon(ICONS.check));
        setTimeout(() => btn.replaceChildren(icon(ICONS.copy)), 1400);
      } catch { toast("Copy failed: clipboard not available", "error"); }
    });
    return btn;
  }

  function decorateCode(root) {
    for (const pre of $$("pre", root)) {
      const code = $("code", pre);
      pre.append(el("span", { class: "copy-code" }, copyButton(() => code.textContent, "Copy code")));
    }
  }

  function renderThread(scrollToEnd = false) {
    const thread = $("#thread");
    if (!state.chat || !state.chat.messages.length) {
      thread.replaceChildren(emptyState());
      return;
    }
    thread.replaceChildren(...state.chat.messages.map(messageNode));
    if (scrollToEnd) scrollDown(true);
  }

  function updateLastMessage() {
    const thread = $("#thread");
    const msgs = state.chat.messages;
    const last = thread.lastElementChild;
    const fresh = messageNode(msgs[msgs.length - 1], msgs.length - 1);
    if (last && last.classList.contains("msg") && thread.children.length === msgs.length) last.replaceWith(fresh);
    else renderThread();
    scrollDown();
  }

  function scrollDown(force = false) {
    const sc = $("#scroller");
    const nearBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160;
    if (force || nearBottom) sc.scrollTop = sc.scrollHeight;
  }

  // ------------------------------------------------------------------ layer meter
  const meter = {
    ticks: 0,
    show(layers) {
      $("#meter").hidden = false;
      const n = Math.max(1, Math.min(layers || 48, 96));
      if (n !== this.ticks || !$("#meterTrack").children.length) {
        this.ticks = n;
        $("#meterTrack").replaceChildren(...Array.from({ length: n }, (_, i) => el("i", { style: `--i:${i}` })));
      }
    },
    indeterminate(label) {
      this.show(this.ticks || 48);
      $("#meterTrack").classList.add("indeterminate");
      $$("#meterTrack i").forEach((t) => t.className = "");
      $("#meterLabel").replaceChildren(el("span", { text: label }));
    },
    progress(layer, layers, tokens, tps) {
      this.show(layers);
      const track = $("#meterTrack");
      track.classList.remove("indeterminate");
      const pos = Math.floor(((layer - 1) / Math.max(layers, 1)) * this.ticks);
      $$("i", track).forEach((t, i) => { t.className = i < pos ? "done" : i === pos ? "now" : ""; });
      const label = [el("span", {}, "Reading layer ", el("b", { text: `${layer} of ${layers}` }))];
      label.push(el("span", { text: tokens ? `token ${tokens + 1}` : "first token" }));
      if (tps) label.push(el("span", { text: `${tps.toFixed(tps < 1 ? 2 : 1)} tokens/s` }));
      $("#meterLabel").replaceChildren(...label);
    },
    hide() { $("#meter").hidden = true; },
  };

  // ------------------------------------------------------------------ sending
  function setBusy(busy) {
    $("#composer").classList.toggle("busy", busy);
    $("#sendBtn").setAttribute("aria-label", busy ? "Stop" : "Send");
    $("#sendBtn").disabled = false;
  }

  async function send(text) {
    if (!state.online) return toast("The AirLLM server is not reachable.", "error");
    const model = $("#modelSelect").value;
    if (!model) { show("models"); return toast("Pull a model first."); }
    if (!state.chat) state.chat = { id: null, title: text.slice(0, 80).replace(/\s+/g, " "), model, messages: [] };
    state.chat.model = model;
    state.chat.messages.push({ role: "user", content: text });
    await generate();
  }

  async function regenerate() {
    if (state.abort || !state.chat) return;
    const msgs = state.chat.messages;
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (!msgs.length) return;
    await generate();
  }

  async function generate() {
    const chat = state.chat;
    const history = chat.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    const answer = { role: "assistant", content: "", pending: true, model: chat.model, statusText: "" };
    chat.messages.push(answer);
    renderThread(true);
    setBusy(true);
    meter.indeterminate("Starting…");
    const controller = new AbortController();
    state.abort = controller;
    const started = performance.now();
    let firstTokenAt = 0, tokens = 0, finalStats = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: chat.model, messages: history, stream: true, airllm_progress: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.detail || `${res.status} ${res.statusText}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", lastPaint = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.error) throw new Error(ev.error);
          if (ev.status) {
            answer.statusText = ev.status === "loading" ? "Loading the model…"
              : ev.status === "queued" ? "Waiting for another answer to finish…" : "Thinking…";
            meter.indeterminate(answer.statusText);
            if (!answer.content) updateLastMessage();
          }
          if (ev.progress) {
            tokens = ev.progress.tokens;
            const secs = firstTokenAt ? (performance.now() - firstTokenAt) / 1000 : 0;
            meter.progress(ev.progress.layer, ev.progress.layers, tokens, secs > 0 && tokens > 1 ? (tokens - 1) / secs : 0);
          }
          const piece = ev.message?.content;
          if (piece) {
            if (!firstTokenAt) firstTokenAt = performance.now();
            answer.content += piece;
            const now = performance.now();
            if (now - lastPaint > 60) { updateLastMessage(); lastPaint = now; }
          }
          if (ev.done) finalStats = ev;
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        if (!answer.content) {
          answer.error = true;
          answer.content = e.message;
        } else toast(e.message, "error");
      }
    } finally {
      state.abort = null;
      answer.pending = false;
      delete answer.statusText;
      const seconds = (performance.now() - started) / 1000;
      if (!answer.error) {
        const evalCount = finalStats?.eval_count ?? tokens;
        const evalSecs = finalStats ? finalStats.eval_duration / 1e9 : 0;
        answer.stats = {
          tokens: evalCount,
          tps: finalStats?.tokens_per_second || (evalSecs ? evalCount / evalSecs : 0),
          seconds,
          reason: controller.signal.aborted ? "cancelled" : finalStats?.done_reason,
        };
      }
      setBusy(false);
      meter.hide();
      updateLastMessage();
      if (!answer.error || chat.messages.length > 2) persistChat();
      refreshStatus();
      $("#prompt").focus();
    }
  }

  // ------------------------------------------------------------------ settings
  async function loadSettings() {
    try {
      const [settings, status] = await Promise.all([api("/api/studio/settings"), api("/api/studio/status")]);
      state.settings = settings;
      state.status = status;
    } catch (e) { return toast(e.message, "error"); }
    const f = $("#settingsForm");
    const s = state.settings, d = s.defaults;
    f.system_prompt.value = d.system_prompt;
    f.max_new_tokens.value = d.max_new_tokens;
    f.temperature.value = d.temperature;
    f.top_p.value = d.top_p;
    f.context_length.value = d.context_length;
    f.keep_alive_minutes.value = s.keep_alive_minutes;
    f.models_dir.value = s.models_dir;
    f.models_dir.placeholder = s.models_dir_effective;
    f.delete_original.checked = s.delete_original;
    f.hf_token.value = "";
    $("#tokenState").replaceChildren(s.hf_token_set
      ? el("span", {}, "A token is saved. ", el("button", { type: "button", class: "btn small", text: "Remove token",
          onclick: () => saveSettings({ clear_hf_token: true }) }))
      : "No token saved. Public models work without one.");

    const hw = state.status.hardware || {};
    const dev = f.device;
    dev.replaceChildren(el("option", { value: "auto", text: "Automatic (GPU if available)" }),
      el("option", { value: "cpu", text: "CPU" }),
      ...(hw.gpus || []).map((g) => el("option", { value: `cuda:${g.index}`, text: `GPU ${g.index}: ${g.name}` })));
    dev.value = [...dev.options].some((o) => o.value === s.device) ? s.device : "auto";
    const comp = f.compression;
    comp.value = s.compression;
    const bnb = !!hw.bitsandbytes;
    for (const o of comp.options) o.disabled = !bnb && o.value !== "none";
    const help = [];
    if (hw.torch) help.push(`PyTorch ${hw.torch}${hw.cuda ? ` with CUDA ${hw.cuda}` : " (CPU build)"}.`);
    if (!(hw.gpus || []).length) help.push(hw.cuda
      ? "No NVIDIA GPU detected."
      : "To use an NVIDIA GPU, run “sudo airllm-enable-cuda” (Linux) or “airllm-enable-cuda” as Administrator (Windows), then restart AirLLM.");
    if (!bnb) help.push("Compression needs the bitsandbytes package, which is not installed.");
    help.push("Changes to hardware apply the next time a model loads.");
    $("#hardwareHelp").textContent = help.join(" ");

    const base = location.origin;
    $("#endpoints").replaceChildren(...[
      ["Ollama API", base],
      ["OpenAI base URL", base + "/v1"],
      ["CLI", "airllm run " + (state.model || "<model>")],
    ].map(([label, value]) => el("div", { class: "copy-row" }, el("span", { text: label }), el("code", { text: value }), copyButton(() => value, `Copy ${label}`))));

    const st = state.status;
    $("#about").replaceChildren(...[
      ["AirLLM Studio", st.version], ["AirLLM", st.airllm], ["Python", st.python],
      ["Data folder", st.data_dir], ["Models folder", st.models_dir],
      ["Free disk", fmtBytes(st.disk?.free || 0)],
    ].flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
  }

  async function saveSettings(patch) {
    const stateEl = $("#saveState");
    stateEl.textContent = "Saving…";
    try {
      await api("/api/studio/settings", { method: "PUT", body: patch });
      stateEl.textContent = "Saved";
      setTimeout(() => { if (stateEl.textContent === "Saved") stateEl.textContent = ""; }, 2500);
      await loadSettings();
      refreshModels();
    } catch (e) {
      stateEl.textContent = "";
      toast(e.message, "error");
    }
  }

  function settingsFromForm() {
    const f = $("#settingsForm");
    const num = (v, fallback) => (v === "" || isNaN(+v) ? fallback : +v);
    const d = state.settings.defaults;
    const patch = {
      device: f.device.value,
      compression: f.compression.value,
      keep_alive_minutes: num(f.keep_alive_minutes.value, state.settings.keep_alive_minutes),
      models_dir: f.models_dir.value.trim(),
      delete_original: f.delete_original.checked,
      defaults: {
        system_prompt: f.system_prompt.value,
        max_new_tokens: num(f.max_new_tokens.value, d.max_new_tokens),
        temperature: num(f.temperature.value, d.temperature),
        top_p: num(f.top_p.value, d.top_p),
        context_length: num(f.context_length.value, d.context_length),
      },
    };
    if (f.hf_token.value.trim()) patch.hf_token = f.hf_token.value.trim();
    return patch;
  }

  // ------------------------------------------------------------------ wiring
  function autosize() {
    const t = $("#prompt");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.4) + "px";
  }

  function wire() {
    $("#newChat").addEventListener("click", newChat);
    $("#navModels").addEventListener("click", () => show("models"));
    $("#navSettings").addEventListener("click", () => show("settings"));
    $("#openSidebar").addEventListener("click", () => $("#app").classList.add("menu-open"));
    $$("[data-open-sidebar]").forEach((b) => b.addEventListener("click", () => $("#app").classList.add("menu-open")));
    $("#closeSidebar").addEventListener("click", () => $("#app").classList.remove("menu-open"));
    $("#modelSelect").addEventListener("change", (e) => selectModel(e.target.value));

    const prompt = $("#prompt");
    prompt.addEventListener("input", autosize);
    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
    });
    $("#composer").addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.abort) { state.abort.abort(); return; }
      const text = prompt.value.trim();
      if (!text) return;
      prompt.value = "";
      autosize();
      send(text);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.abort) state.abort.abort();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChat(); }
    });

    $("#pullForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#pullInput").value.trim();
      if (!name) return;
      if (!/^[\w.-]+\/[\w.-]+$/.test(name) && !/^([a-zA-Z]:)?[\\/~.]/.test(name)) {
        renderDiscover();
        return toast("Pick a model from the results, or paste a full id like Qwen/Qwen3-8B.");
      }
      pull(name);
      $("#pullInput").value = "";
    });
    $("#pullInput").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderDiscover, 450);
    });

    $("#settingsForm").addEventListener("submit", (e) => { e.preventDefault(); saveSettings(settingsFromForm()); });
    $$("[data-open]").forEach((b) => b.addEventListener("click", () =>
      api("/api/studio/open-folder", { method: "POST", body: { what: b.dataset.open } }).catch((e) => toast(e.message, "error"))));
    $("#quitBtn").addEventListener("click", async () => {
      const btn = $("#quitBtn");
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1";
        btn.textContent = "Click again to quit";
        setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Quit AirLLM"; }, 4000);
        return;
      }
      await api("/api/shutdown", { method: "POST" }).catch(() => {});
      document.body.replaceChildren(el("div", { class: "empty" }, el("img", { src: "icon.svg", alt: "" }),
        el("h2", { text: "AirLLM has stopped" }), el("p", { text: "You can close this window." })));
    });
  }

  async function boot() {
    wire();
    renderThread();
    await Promise.all([refreshStatus(), refreshModels(), refreshChats()]);
    renderThread();
    const id = location.hash.slice(1);
    if (id && state.chats.some((c) => c.id === id)) openChat(id);
    if (state.models.some((m) => m.job && !m.job.done)) pollModelsSoon();
    setInterval(() => {
      const wasOnline = state.online;
      refreshStatus().then(() => {
        if (!wasOnline && state.online) { refreshModels(); refreshChats(); }
        if (state.view === "chat" && (!state.chat || !state.chat.messages.length)) renderThread();
      });
    }, 4000);
    $("#prompt").focus();
  }

  boot();
})();
