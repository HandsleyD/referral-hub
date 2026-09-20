// Public hub: loads offers.json, hides expired/invalid entries, and renders
// filterable cards. All content comes from offers.json -- no offer text lives
// in the markup.
(function () {
  "use strict";

  const { escapeHTML, formatDate, isExpired, daysLeft, checkOffers, todayISO, plural } = RH;

  const SOON_DAYS = 7;
  const els = {
    search: document.getElementById("search"),
    chips: document.getElementById("categoryChips"),
    minValue: document.getElementById("minValue"),
    sort: document.getElementById("sort"),
    list: document.getElementById("offerList"),
    meta: document.getElementById("resultMeta"),
    status: document.getElementById("status"),
  };

  const state = { offers: [], q: "", cat: "all", min: 0, sort: "value" };

  // Filters live in the query string so a filtered view can be shared,
  // e.g. ?cat=banking or ?min=25&sort=ending.
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    state.cat = (p.get("cat") || "all").toLowerCase();
    state.min = Number(p.get("min")) || 0;
    state.sort = ["value", "ending", "az"].includes(p.get("sort")) ? p.get("sort") : "value";
  }

  function writeURL() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat !== "all") p.set("cat", state.cat);
    if (state.min) p.set("min", state.min);
    if (state.sort !== "value") p.set("sort", state.sort);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  function catKey(c) { return c.trim().toLowerCase(); }

  function renderChips() {
    const counts = new Map();
    for (const o of state.offers) {
      const k = catKey(o.category);
      if (!counts.has(k)) counts.set(k, { label: o.category.trim(), n: 0 });
      counts.get(k).n++;
    }
    if (state.cat !== "all" && !counts.has(state.cat)) state.cat = "all";
    const cats = [["all", { label: "All", n: state.offers.length }],
      ...[...counts].sort((a, b) => a[1].label.localeCompare(b[1].label))];
    els.chips.innerHTML = cats.map(([k, c]) =>
      `<button type="button" class="chip" data-cat="${escapeHTML(k)}" aria-pressed="${k === state.cat}">` +
      `${escapeHTML(c.label)}<span class="count">${c.n}</span></button>`).join("");
  }

  function matches(o) {
    if (state.cat !== "all" && catKey(o.category) !== state.cat) return false;
    if (state.min && (o.userValue || 0) < state.min) return false;
    if (state.q) {
      const hay = [o.provider, o.category, o.userGets, o.referrerGets, ...(o.conditions || [])].join(" ").toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  const sorters = {
    value: (a, b) => (b.userValue || 0) - (a.userValue || 0) || a.provider.localeCompare(b.provider),
    // Offers with no end date go last when sorting by "ending soonest".
    ending: (a, b) => (a.expires || "9999").localeCompare(b.expires || "9999") || a.provider.localeCompare(b.provider),
    az: (a, b) => a.provider.localeCompare(b.provider),
  };

  function expiryText(o, today) {
    if (!o.expires) return { text: "No end date listed", tag: "" };
    const d = daysLeft(o, today);
    const when = "Ends " + formatDate(o.expires);
    if (d === 0) return { text: when, tag: '<span class="tag danger">Last day</span>' };
    if (d <= SOON_DAYS) return { text: when, tag: `<span class="tag warn">${plural(d, "day")} left</span>` };
    return { text: when, tag: "" };
  }

  function card(o, today) {
    const exp = expiryText(o, today);
    const conditions = (o.conditions || []).length
      ? `<div><p class="section-label">To qualify</p><ul class="conditions">${o.conditions.map((c) => `<li>${escapeHTML(c)}</li>`).join("")}</ul></div>`
      : "";
    const link = o.placeholder
      ? `<span class="btn" aria-disabled="true">Example only, no link</span>`
      : `<a class="btn" href="${escapeHTML(o.link)}" target="_blank" rel="sponsored noopener">Get this offer ↗</a>
         <span class="btn-note">Referral link: I get ${escapeHTML(o.referrerGets)} if you qualify</span>`;
    return `<li class="card offer" id="${escapeHTML(o.id)}">
      <div class="offer-head">
        <h3>${escapeHTML(o.provider)}</h3>
        <span class="tag">${escapeHTML(o.category)}</span>
      </div>
      ${o.placeholder ? '<p class="placeholder-note">Placeholder entry showing the layout, not a real offer.</p>' : ""}
      <dl class="deal">
        <div class="you"><dt>You get</dt><dd>${escapeHTML(o.userGets)}</dd></div>
        <div class="me"><dt>I get</dt><dd>${escapeHTML(o.referrerGets)}</dd></div>
      </dl>
      ${conditions}
      ${o.riskWarning ? `<p class="risk">${escapeHTML(o.riskWarning)}</p>` : ""}
      <div class="offer-meta">
        <span>${exp.text} ${exp.tag}</span>
        ${o.checked ? `<span>Terms checked ${formatDate(o.checked)}</span>` : ""}
      </div>
      <div class="offer-foot">${link}</div>
    </li>`;
  }

  function render() {
    const today = todayISO();
    const shown = state.offers.filter(matches).sort(sorters[state.sort]);
    els.list.innerHTML = shown.map((o) => card(o, today)).join("");
    const total = state.offers.length;
    els.meta.textContent = shown.length === total
      ? plural(total, "current offer")
      : `Showing ${shown.length} of ${plural(total, "current offer")}`;
    if (!total) showStatus("No live offers right now. Check back soon.");
    else if (!shown.length) showStatus("Nothing matches those filters. Try clearing the search or picking “All”.");
    else els.status.hidden = true;
  }

  function showStatus(msg, isError) {
    els.status.textContent = msg;
    els.status.classList.toggle("error", !!isError);
    els.status.hidden = false;
  }

  function syncControls() {
    els.search.value = state.q;
    els.minValue.value = String(state.min);
    if (els.minValue.value !== String(state.min)) { state.min = 0; els.minValue.value = "0"; }
    els.sort.value = state.sort;
  }

  function update() { writeURL(); render(); }

  els.search.addEventListener("input", () => { state.q = els.search.value.trim(); update(); });
  els.minValue.addEventListener("change", () => { state.min = Number(els.minValue.value); update(); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; update(); });
  els.chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.dataset.cat;
    for (const c of els.chips.children) c.setAttribute("aria-pressed", String(c === b));
    update();
  });

  RH.initThemeToggle(document.getElementById("themeToggle"));
  readURL();
  syncControls();

  fetch("offers.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((data) => {
      const { offers, problems } = checkOffers(data);
      // Malformed entries are skipped rather than shown half-broken; the
      // validator script / CI check names them for fixing.
      if (problems.length) console.warn("offers.json problems (these entries are hidden):\n" + problems.join("\n"));
      const today = todayISO();
      state.offers = offers.filter((o) => !isExpired(o, today));
      renderChips();
      render();
      if (location.hash) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
    })
    .catch((err) => {
      console.error(err);
      els.meta.textContent = "";
      showStatus(location.protocol === "file:"
        ? "Offers can't load from a file:// page. Preview with a local web server instead (see README)."
        : "Sorry, the offers couldn't be loaded. Please try refreshing.", true);
    });
})();
