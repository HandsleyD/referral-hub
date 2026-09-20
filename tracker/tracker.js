// Private post tracker UI. All data stays in this browser's localStorage.
(function () {
  "use strict";

  const { escapeHTML: esc, formatDate, todayISO, plural, isExpired, checkOffers } = RH;
  const KEY = "rh.tracker.v1";
  const $ = (id) => document.getElementById(id);

  let offers = [];
  let state = load();

  // ---- storage -------------------------------------------------------------
  function load() {
    try { return RHT.sanitizeState(JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { return RHT.sanitizeState(null); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert("Couldn't save to this browser's storage (private mode or storage full?). Export a backup so you don't lose changes."); }
  }
  function offerName(id) {
    const o = offers.find((x) => x.id === id);
    return o ? o.provider : id + " (no longer in offers.json)";
  }
  function communityName(id) {
    const c = state.communities.find((x) => x.id === id);
    return c ? c.name : "(deleted)";
  }
  function offerOptions(selected) {
    if (!offers.length) return '<option value="">No live offers loaded</option>';
    return offers.map((o) => `<option value="${esc(o.id)}"${o.id === selected ? " selected" : ""}>${esc(o.provider)}</option>`).join("");
  }
  function communityOptions(selected, allowNone) {
    const none = allowNone ? '<option value="">None</option>' : "";
    if (!state.communities.length && !allowNone) return '<option value="">Add a community in Setup first</option>';
    return none + state.communities.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? " selected" : ""}>${esc(c.name)}</option>`).join("");
  }

  // ---- tabs ----------------------------------------------------------------
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "tab-" + name; });
    try { sessionStorage.setItem("rh.tab", name); } catch (e) {}
    if (name === "status") renderStatus();
    if (name === "compose") renderCompose();
    if (name === "log") renderLog();
    if (name === "setup") renderSetup();
  }
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) showTab(t.dataset.tab);
  });

  // ---- status --------------------------------------------------------------
  const LABEL = { eligible: "Cooldown passed", never: "Not posted here", unset: "Cooldown not set", cooling: "Cooling down", blocked: "Not available here" };
  const TAGCLS = { eligible: "ok", never: "ok", unset: "warn", cooling: "danger", blocked: "" };

  function statusLine(st) {
    if (st.kind === "cooling") {
      const exp = st.expiresFirst ? " (offer ends before then)" : "";
      return `Posted ${formatDate(st.last)}. Cooldown ends ${formatDate(st.eligibleOn)}, ${plural(st.daysToGo, "day")} to go${exp}`;
    }
    if (st.kind === "eligible") return `Last posted ${formatDate(st.last)}, ${plural(-st.daysToGo, "day")} ago`;
    if (st.kind === "unset") return st.last ? `Last posted ${formatDate(st.last)}. Set this community's cooldown in Setup` : "Set this community's cooldown in Setup";
    if (st.kind === "blocked") return "Marked as not available to you in this community";
    return "You haven't recorded a post here";
  }

  function renderStatus() {
    const today = todayISO();
    if (!state.communities.length) {
      $("statusSummary").innerHTML = "";
      $("statusCommunities").innerHTML = '<div class="empty">No communities yet. Add one in <b>Setup</b>, set its cooldown, then record your posts.</div>';
      return;
    }
    let ready = 0, cooling = 0, unset = 0;
    const blocks = state.communities.map((c) => {
      const rows = offers.map((o) => ({ offer: o, st: RHT.status(c, o, state.posts, today) })).sort(RHT.compareStatus);
      for (const r of rows) {
        if (r.st.kind === "eligible" || r.st.kind === "never") ready++;
        else if (r.st.kind === "cooling") cooling++;
        else if (r.st.kind === "unset") unset++;
      }
      const sub = RHT.hasCooldown(c)
        ? `Cooldown: ${plural(c.cooldownDays, "day")}, counted ${c.scope === "any" ? "from your last post of any offer" : "per offer"}`
        : "Cooldown not set";
      return `<section class="card community">
        <h3>${esc(c.name)}</h3>
        <p class="sub">${esc(sub)}</p>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
        <ul class="rows">${rows.map(({ offer, st }) => `<li>
          <div class="what"><b>${esc(offer.provider)}</b><span>${esc(statusLine(st))}</span></div>
          <div class="act"><span class="tag big ${TAGCLS[st.kind]}">${LABEL[st.kind]}</span>
          ${st.kind === "eligible" || st.kind === "never" ? `<button class="btn small secondary" type="button" data-compose="${esc(offer.id)}" data-community="${esc(c.id)}">Compose</button>` : ""}</div>
        </li>`).join("")}</ul>
      </section>`;
    });
    $("statusSummary").innerHTML =
      `<div class="card stat"><b>${ready}</b><span>offer/community pairs with no active cooldown</span></div>` +
      `<div class="card stat"><b>${cooling}</b><span>still cooling down</span></div>` +
      (unset ? `<div class="card stat"><b>${unset}</b><span>waiting on a cooldown being set</span></div>` : "");
    $("statusCommunities").innerHTML = blocks.join("");
  }
  $("statusCommunities").addEventListener("click", (e) => {
    const b = e.target.closest("[data-compose]");
    if (!b) return;
    composeSel = { offer: b.dataset.compose, community: b.dataset.community };
    showTab("compose");
  });

  // ---- compose -------------------------------------------------------------
  let composeSel = { offer: "", community: "" };
  function renderCompose() {
    if (!offers.some((o) => o.id === composeSel.offer)) composeSel.offer = offers[0] ? offers[0].id : "";
    $("composeOffer").innerHTML = offerOptions(composeSel.offer);
    $("composeCommunity").innerHTML = communityOptions(composeSel.community, true);
    fillCompose();
  }
  function fillCompose() {
    composeSel.offer = $("composeOffer").value;
    composeSel.community = $("composeCommunity").value;
    const o = offers.find((x) => x.id === composeSel.offer);
    $("composeBody").value = o ? RHT.composePost(o, state.hubUrl) : "";
    $("copyMsg").textContent = "";
    const c = state.communities.find((x) => x.id === composeSel.community);
    if (!o || !c) { $("composeStatus").innerHTML = ""; return; }
    const st = RHT.status(c, o, state.posts, todayISO());
    $("composeStatus").innerHTML =
      `<p><span class="tag big ${TAGCLS[st.kind]}">${LABEL[st.kind]}</span> <span class="hint">${esc(statusLine(st))}</span></p>` +
      (c.note ? `<p class="hint" style="white-space:pre-wrap">${esc(c.note)}</p>` : "");
  }
  $("composeOffer").addEventListener("change", fillCompose);
  $("composeCommunity").addEventListener("change", fillCompose);
  $("regenBtn").addEventListener("click", fillCompose);
  $("copyBtn").addEventListener("click", async () => {
    const text = $("composeBody").value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      $("composeBody").focus();
      $("composeBody").select();
      try { document.execCommand("copy"); } catch (e2) { $("copyMsg").textContent = "Couldn't copy automatically. The text is selected, so copy it manually."; return; }
    }
    $("copyMsg").textContent = "Copied. After you've posted, record it under “Log a post” so the cooldown starts.";
  });

  // ---- log -----------------------------------------------------------------
  function renderLog() {
    $("logOffer").innerHTML = offerOptions(composeSel.offer);
    $("logCommunity").innerHTML = communityOptions(composeSel.community, false);
    if (!$("logDate").value) $("logDate").value = todayISO();
    $("logDate").max = todayISO();
    const posts = [...state.posts].sort((a, b) => b.date.localeCompare(a.date));
    $("history").innerHTML = posts.length
      ? `<ul class="hist">${posts.map((p) => `<li class="card">
          <div class="what"><b>${esc(offerName(p.offerId))}</b><span>${esc(communityName(p.communityId))} · ${formatDate(p.date)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">post</a>` : ""}</span></div>
          <button class="btn small danger" type="button" data-del-post="${esc(p.id)}">Delete</button></li>`).join("")}</ul>`
      : '<div class="empty">Nothing recorded yet.</div>';
  }
  $("logForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const offerId = $("logOffer").value, communityId = $("logCommunity").value, date = $("logDate").value;
    if (!offerId || !communityId || RH.parseISO(date) === null) { $("logMsg").textContent = "Pick an offer, a community and a date."; return; }
    state.posts.push({ id: RHT.newId("p"), offerId, communityId, date, url: $("logUrl").value.trim() });
    save();
    $("logUrl").value = "";
    const c = state.communities.find((x) => x.id === communityId);
    const st = RHT.status(c, offers.find((o) => o.id === offerId) || { id: offerId }, state.posts, todayISO());
    $("logMsg").textContent = "Recorded. " + (st.kind === "cooling" ? `Cooldown ends ${formatDate(st.eligibleOn)}.` : st.kind === "unset" ? "Set this community's cooldown in Setup." : "");
    renderLog();
  });
  $("history").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-post]");
    if (!b || !confirm("Delete this record?")) return;
    state.posts = state.posts.filter((p) => p.id !== b.dataset.delPost);
    save();
    renderLog();
  });

  // ---- setup ---------------------------------------------------------------
  function renderSetup() {
    $("hubUrl").value = state.hubUrl;
    $("communityList").innerHTML = state.communities.length ? state.communities.map((c) => `
      <div class="card community-edit" data-cid="${esc(c.id)}">
        <h3>${esc(c.name)}</h3>
        <div class="two">
          <label class="field"><span>Cooldown (days)</span>
            <input type="number" min="0" max="3650" step="1" inputmode="numeric" data-f="cooldownDays" value="${c.cooldownDays === null ? "" : c.cooldownDays}" placeholder="not set"></label>
          <label class="field"><span>Counted</span>
            <select data-f="scope">
              <option value="offer"${c.scope === "offer" ? " selected" : ""}>Per offer</option>
              <option value="any"${c.scope === "any" ? " selected" : ""}>Any post I make there</option>
            </select></label>
        </div>
        <label class="field"><span>Rules / notes <span class="hint">(your reminders, shown alongside status)</span></span>
          <textarea rows="3" data-f="note" placeholder="e.g. link to the rules, format requirements">${esc(c.note)}</textarea></label>
        <details class="more"><summary>Offers I can't post here (${c.blocked.length})</summary>
          <div class="blocklist">${offers.map((o) => `<label><input type="checkbox" data-block="${esc(o.id)}"${c.blocked.includes(o.id) ? " checked" : ""}>${esc(o.provider)}</label>`).join("") || '<span class="hint">No offers loaded.</span>'}</div>
        </details>
        <button class="btn small danger" type="button" data-del-community="${esc(c.id)}">Delete community</button>
      </div>`).join("") : '<div class="empty">No communities yet.</div>';
  }
  $("communityForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("newName").value.trim();
    if (!name) return;
    state.communities.push({ id: RHT.newId("c"), name, cooldownDays: null, scope: "offer", blocked: [], note: "" });
    save();
    $("newName").value = "";
    renderSetup();
  });
  $("communityList").addEventListener("change", (e) => {
    const box = e.target.closest("[data-cid]");
    if (!box) return;
    const c = state.communities.find((x) => x.id === box.dataset.cid);
    if (!c) return;
    if (e.target.dataset.f === "cooldownDays") {
      const v = e.target.value.trim();
      c.cooldownDays = v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
      if (c.cooldownDays === null) e.target.value = "";
    } else if (e.target.dataset.f === "scope") {
      c.scope = e.target.value === "any" ? "any" : "offer";
    } else if (e.target.dataset.f === "note") {
      c.note = e.target.value;
    } else if (e.target.dataset.block) {
      const id = e.target.dataset.block;
      c.blocked = e.target.checked ? [...new Set([...c.blocked, id])] : c.blocked.filter((x) => x !== id);
      box.querySelector("summary").textContent = `Offers I can't post here (${c.blocked.length})`;
    }
    save();
  });
  $("communityList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-community]");
    if (!b) return;
    const id = b.dataset.delCommunity;
    const n = state.posts.filter((p) => p.communityId === id).length;
    if (!confirm(`Delete ${communityName(id)}${n ? ` and its ${plural(n, "recorded post")}` : ""}?`)) return;
    state.communities = state.communities.filter((c) => c.id !== id);
    state.posts = state.posts.filter((p) => p.communityId !== id);
    save();
    renderSetup();
  });
  $("hubUrl").addEventListener("change", () => { state.hubUrl = $("hubUrl").value.trim(); save(); });

  // ---- backup --------------------------------------------------------------
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "referral-tracker-backup-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $("backupMsg").textContent = "Backup downloaded.";
  });
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const next = RHT.sanitizeState(JSON.parse(await f.text()));
      if (!confirm(`Replace what's here now with the backup (${plural(next.communities.length, "community")}, ${plural(next.posts.length, "post")})?`)) return;
      state = next;
      save();
      renderSetup();
      $("backupMsg").textContent = "Backup imported.";
    } catch (err) {
      $("backupMsg").textContent = "That file isn't a valid backup.";
    }
  });

  // ---- offers source -------------------------------------------------------
  function setOffers(data) {
    const { offers: valid } = checkOffers(data);
    offers = valid.filter((o) => !isExpired(o, todayISO()));
    $("offersError").hidden = true;
  }
  function offersFailed() {
    const box = $("offersError");
    box.innerHTML = `Couldn't load <code>../docs/offers.json</code>. Browsers block that when a page is opened straight from disk. Either run <code>node scripts/serve.mjs</code> and open the address it prints, or pick the file here:
      <p><input type="file" id="offersFile" accept="application/json,.json"></p>`;
    box.hidden = false;
    $("offersFile").addEventListener("change", async (e) => {
      try { setOffers(JSON.parse(await e.target.files[0].text())); showTab(current()); }
      catch (err) { alert("That doesn't look like a valid offers.json."); }
    });
  }
  function current() {
    const t = document.querySelector('.tab[aria-selected="true"]');
    return t ? t.dataset.tab : "status";
  }

  RH.initThemeToggle($("themeToggle"));
  let start = "status";
  try { start = sessionStorage.getItem("rh.tab") || "status"; } catch (e) {}
  fetch("../docs/offers.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(setOffers)
    .catch(offersFailed)
    .finally(() => showTab(document.getElementById("tab-" + start) ? start : "status"));
})();
