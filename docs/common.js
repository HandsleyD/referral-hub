// Shared helpers for the public hub (docs/app.js), the private tracker
// (tracker/tracker.js) and the offline validator (scripts/validate-offers.mjs).
// Plain script, no dependencies: in the browser it attaches to window.RH, in
// Node it's exported via module.exports so the validator applies exactly the
// same rules the page does.
(function () {
  "use strict";

  const DAY_MS = 86400000;
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // ---- dates ---------------------------------------------------------------
  // All dates are plain "YYYY-MM-DD" strings in the viewer's local calendar.
  // Arithmetic is done on UTC midnights so DST changes can't shift a day.

  function pad(n) { return String(n).padStart(2, "0"); }

  function parseISO(s) {
    if (typeof s !== "string" || !ISO_RE.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    const dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return t;
  }

  function toISO(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function todayISO() {
    const n = new Date();
    return n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate());
  }

  function addDays(iso, days) { return toISO(parseISO(iso) + days * DAY_MS); }

  // Whole days from a to b (positive when b is later).
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY_MS); }

  function formatDate(iso) {
    const t = parseISO(iso);
    if (t === null) return "";
    return new Date(t).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  // ---- offers --------------------------------------------------------------

  // An offer is live up to and including its expiry date. No expiry = ongoing.
  function isExpired(offer, today) {
    return !!offer.expires && offer.expires < (today || todayISO());
  }

  function daysLeft(offer, today) {
    return offer.expires ? daysBetween(today || todayISO(), offer.expires) : null;
  }

  function isHttpsUrl(s) {
    try { return new URL(s).protocol === "https:"; } catch (e) { return false; }
  }

  function nonEmptyString(v) { return typeof v === "string" && v.trim() !== ""; }

  // Returns a list of problems with one offer (empty list = valid).
  function offerProblems(o) {
    const p = [];
    if (!o || typeof o !== "object" || Array.isArray(o)) return ["is not an object"];
    if (!nonEmptyString(o.id)) p.push('missing "id"');
    else if (!ID_RE.test(o.id)) p.push('"id" must be lowercase letters, numbers and hyphens (e.g. "example-bank")');
    for (const f of ["provider", "category", "userGets", "referrerGets", "link"]) {
      if (!nonEmptyString(o[f])) p.push('missing "' + f + '"');
    }
    if (nonEmptyString(o.link) && !isHttpsUrl(o.link)) p.push('"link" must be a full https:// URL');
    if (o.userValue !== undefined && (typeof o.userValue !== "number" || !isFinite(o.userValue) || o.userValue < 0)) {
      p.push('"userValue" must be a number of pounds, e.g. 20 (or leave it out)');
    }
    if (o.expires !== undefined && o.expires !== null && parseISO(o.expires) === null) {
      p.push('"expires" must be a real date written YYYY-MM-DD, or null for no end date');
    }
    if (o.checked !== undefined && parseISO(o.checked) === null) {
      p.push('"checked" must be a real date written YYYY-MM-DD');
    }
    if (o.conditions !== undefined && (!Array.isArray(o.conditions) || !o.conditions.every(nonEmptyString))) {
      p.push('"conditions" must be a list of text lines, e.g. ["Spend £10 within 30 days"]');
    }
    for (const f of ["riskWarning", "notes"]) {
      if (o[f] !== undefined && !nonEmptyString(o[f])) p.push('"' + f + '" must be text (or leave it out)');
    }
    if (o.placeholder !== undefined && typeof o.placeholder !== "boolean") p.push('"placeholder" must be true or false');
    return p;
  }

  // Checks a whole offers.json payload. Returns { offers, problems } where
  // offers holds only the valid entries and problems is a list of
  // human-readable strings naming the offending entry.
  function checkOffers(data) {
    if (!Array.isArray(data)) return { offers: [], problems: ["offers.json must be a list: [ {...}, {...} ]"] };
    const offers = [];
    const problems = [];
    const seen = new Set();
    data.forEach((o, i) => {
      const label = "Offer #" + (i + 1) + (o && o.id ? ' ("' + o.id + '")' : "");
      const p = offerProblems(o);
      if (o && o.id && seen.has(o.id)) p.push('duplicate "id" -- every offer needs its own');
      if (o && o.id) seen.add(o.id);
      if (p.length) p.forEach((msg) => problems.push(label + ": " + msg));
      else offers.push(o);
    });
    return { offers, problems };
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---- theme toggle ----------------------------------------------------------
  // Stored choice overrides the system preference; see the inline script in
  // each page's <head>, which applies it before first paint.
  function initThemeToggle(btn) {
    if (!btn) return;
    const root = document.documentElement;
    const current = () => root.getAttribute("data-theme") ||
      (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const paint = () => {
      const dark = current() === "dark";
      btn.textContent = dark ? "☀" : "☾";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* not persisted; fine */ }
      paint();
    });
    paint();
  }

  const RH = {
    parseISO, toISO, todayISO, addDays, daysBetween, formatDate, plural,
    isExpired, daysLeft, offerProblems, checkOffers, escapeHTML,
    initThemeToggle,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = RH;
  else window.RH = RH;
})();
