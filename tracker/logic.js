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
    lines.push("Disclosure: this is my referral link, so I get " + offer.referrerGets + " if you qualify.");
    lines.push("You get: " + offer.userGets);
    if ((offer.conditions || []).length) {
      lines.push("");
      lines.push("To qualify:");
      for (const c of offer.conditions) lines.push("- " + c);
    }
    if (offer.expires) lines.push("\nEnds: " + RH.formatDate(offer.expires));
    if (offer.riskWarning) lines.push("\n" + offer.riskWarning);
    lines.push("");
    lines.push("Link: " + offer.link);
    if (hubUrl) lines.push("All my current offers: " + hubUrl);
    lines.push("");
    lines.push("Check the provider's own terms before signing up. They can change.");
    return lines.join("\n");
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

  const api = { hasCooldown, lastPost, status, compareStatus, composePost, newId, sanitizeState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.RHT = api;
})();
