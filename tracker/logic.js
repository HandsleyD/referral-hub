// Pure tracker logic: no DOM, no storage. Shared by tracker.js (browser) and
// scripts/test-tracker.mjs (Node). Needs docs/common.js loaded first (as RH)
// in the browser; in Node it requires it directly.
(function () {
  "use strict";

  const RH = typeof module !== "undefined" && module.exports ? require("../docs/common.js") : window.RH;

  // A community's cooldown is entirely user-configured; the tool only counts
  // days. cooldownDays null/undefined = "not set yet" (we never guess one).
  //   scope "offer": the cooldown runs per offer (each offer has its own clock)
  //   scope "any":   one post of any offer starts the clock for the community
  function hasCooldown(c) {
    return Number.isInteger(c.cooldownDays) && c.cooldownDays >= 0;
  }

  function lastPost(community, offerId, posts) {
    let last = null;
    for (const p of posts) {
      if (p.communityId !== community.id) continue;
      if (community.scope !== "any" && p.offerId !== offerId) continue;
      if (last === null || p.date > last.date) last = p;
    }
    return last;
  }

  // Status of one offer in one community as of `today`. kind is one of:
  //   blocked   - marked as not allowed / not available to you in this community
  //   unset     - community has no cooldown configured yet
  //   never     - never posted there, so nothing is cooling down
  //   cooling   - posted within the cooldown window; eligibleOn says when it ends
  //   eligible  - the configured cooldown has passed
  function status(community, offer, posts, today) {
    if ((community.blocked || []).includes(offer.id)) return { kind: "blocked" };
    const last = lastPost(community, offer.id, posts);
    if (!last) return { kind: hasCooldown(community) ? "never" : "unset", last: null };
    if (!hasCooldown(community)) return { kind: "unset", last: last.date };
    const eligibleOn = RH.addDays(last.date, community.cooldownDays);
    const daysToGo = RH.daysBetween(today, eligibleOn);
    const base = { last: last.date, eligibleOn, daysToGo };
    if (daysToGo > 0) return { kind: "cooling", ...base, expiresFirst: !!offer.expires && offer.expires < eligibleOn };
    return { kind: "eligible", ...base };
  }

  // Sort order for the "what's due" view: things you can act on first.
  const KIND_ORDER = { eligible: 0, never: 1, unset: 2, cooling: 3, blocked: 4 };
  function compareStatus(a, b) {
    return KIND_ORDER[a.st.kind] - KIND_ORDER[b.st.kind] ||
      (a.st.daysToGo || 0) - (b.st.daysToGo || 0) ||
      a.offer.provider.localeCompare(b.offer.provider);
  }

  // Ready-to-paste post body. Deliberately plain and honest: says it's a
  // referral link and states both sides, matching the hub's disclosure.
  // Never includes anything about dodging a community's rules.
  function composePost(offer, hubUrl) {
    const lines = [];
    lines.push(offer.provider + ": " + offer.userGets);
    lines.push("");
    lines.push("Disclosure: this is my referral link. I get: " + offer.referrerGets + ".");
    lines.push("You get: " + offer.userGets);
    if ((offer.conditions || []).length) {
      lines.push("");
      lines.push("To qualify:");
      for (const c of offer.conditions) lines.push("- " + c);
    }
    if (offer.expires) lines.push("\nEnds: " + RH.formatDate(offer.expires));
    if (offer.riskWarning) lines.push("\n" + offer.riskWarning);
    lines.push("");
    if (offer.code) lines.push("Referral code: " + offer.code);
    if (offer.links) {
      lines.push("Links (pick your field):");
      for (const l of offer.links) lines.push("- " + l.label + ": " + l.url);
    } else if (offer.link) lines.push("Link: " + offer.link);
    if (offer.officialLink) lines.push("Non-referral link: " + offer.officialLink);
    if (offer.terms) lines.push("Terms: " + offer.terms);
    if (hubUrl) lines.push("All my current offers: " + hubUrl);
    lines.push("");
    lines.push("Check the provider's own terms before signing up. They can change.");
    return lines.join("\n");
  }

  // Short version for X / Bluesky. Opens with "Ad:" so the commercial
  // relationship is clear before anyone reads on (UK ad rules). Any URL
  // counts as 23 characters on X regardless of its real length, so that's how
  // length is measured. The offer text is trimmed (never the label or link)
  // until it fits.
  const URL_LEN = 23;
  function shortLength(text) {
    return text.replace(/https?:\/\/\S+/g, "x".repeat(URL_LEN)).length;
  }
  function composeShort(offer, hubUrl, max) {
    max = max || 280;
    // Offers with many links share the hub page rather than one arbitrary link.
    const link = offer.links ? (hubUrl || offer.links[0].url) : offer.link;
    let you = offer.userGets, me = offer.referrerGets;
    const build = () => "Ad: " + offer.provider + " referral link. You get: " + you + " I get: " + me +
      (offer.code ? " Code: " + offer.code + "." : "") + " " + link;
    const end = (t) => (/[.!?…]$/.test(t) ? t : t + ".");
    you = end(you); me = end(me);
    const trim = (t) => {
      const body = t.replace(/[.!?…]$/, "");
      const cut = body.slice(0, Math.max(20, Math.floor(body.length * 0.85)));
      // Prefer cutting at a word boundary, but never loop without shrinking.
      const atWord = cut.replace(/\s+\S*$/, "");
      return (atWord.length >= 20 && atWord.length < body.length ? atWord : cut) + "…";
    };
    let guard = 200;
    while (shortLength(build()) > max && guard-- > 0) {
      if (you.length >= me.length) you = trim(you); else me = trim(me);
    }
    const text = build();
    return { text, length: shortLength(text), fits: shortLength(text) <= max };
  }

  function newId(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Validates/cleans imported or stored data so a bad file can't break the page.
  function sanitizeState(raw) {
    const out = { communities: [], posts: [], hubUrl: "" };
    if (!raw || typeof raw !== "object") return out;
    if (typeof raw.hubUrl === "string") out.hubUrl = raw.hubUrl.trim();
    const cids = new Set();
    for (const c of Array.isArray(raw.communities) ? raw.communities : []) {
      if (!c || typeof c.id !== "string" || typeof c.name !== "string" || !c.name.trim() || cids.has(c.id)) continue;
      cids.add(c.id);
      out.communities.push({
        id: c.id,
        name: c.name.trim(),
        cooldownDays: Number.isInteger(c.cooldownDays) && c.cooldownDays >= 0 ? c.cooldownDays : null,
        scope: c.scope === "any" ? "any" : "offer",
        blocked: Array.isArray(c.blocked) ? c.blocked.filter((x) => typeof x === "string") : [],
        note: typeof c.note === "string" ? c.note : "",
      });
    }
    for (const p of Array.isArray(raw.posts) ? raw.posts : []) {
      if (!p || typeof p.id !== "string" || typeof p.offerId !== "string" || !cids.has(p.communityId) || RH.parseISO(p.date) === null) continue;
      out.posts.push({ id: p.id, offerId: p.offerId, communityId: p.communityId, date: p.date, url: typeof p.url === "string" ? p.url : "" });
    }
    return out;
  }

  const api = { hasCooldown, lastPost, status, compareStatus, composePost, composeShort, shortLength, newId, sanitizeState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.RHT = api;
})();
