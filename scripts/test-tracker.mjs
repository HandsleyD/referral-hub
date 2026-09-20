// Tests for the date helpers, offer validation and tracker cooldown logic.
// Run: node scripts/test-tracker.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const RH = require("../docs/common.js");
const T = require("../tracker/logic.js");

let n = 0;
function test(name, fn) { fn(); n++; console.log("ok  " + name); }

test("date arithmetic survives month/year/leap boundaries", () => {
  assert.equal(RH.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(RH.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(RH.addDays("2026-03-28", 2), "2026-03-30"); // across UK DST change
  assert.equal(RH.daysBetween("2026-10-24", "2026-10-27"), 3);
  assert.equal(RH.parseISO("2026-02-30"), null);
});

test("offers are live through their expiry date, gone the day after", () => {
  const o = { expires: "2026-09-20" };
  assert.equal(RH.isExpired(o, "2026-09-20"), false);
  assert.equal(RH.isExpired(o, "2026-09-21"), true);
  assert.equal(RH.isExpired({ expires: null }, "2099-01-01"), false);
});

test("validation catches bad entries and duplicates", () => {
  const good = { id: "a", provider: "A", category: "X", userGets: "u", referrerGets: "r", link: "https://a.example" };
  assert.deepEqual(RH.offerProblems(good), []);
  assert.ok(RH.offerProblems({ ...good, link: "http://a.example" }).length);
  assert.ok(RH.offerProblems({ ...good, expires: "31/12/2026" }).length);
  assert.ok(RH.offerProblems({ ...good, id: "Bad Id" }).length);
  const r = RH.checkOffers([good, good, { ...good, id: "b" }]);
  assert.equal(r.offers.length, 2);
  assert.equal(r.problems.length, 1);
});

const offer = { id: "a", provider: "A", userGets: "£5", referrerGets: "£5", link: "https://a.example", expires: "2026-10-01" };
const c = { id: "c1", name: "r/test", cooldownDays: 7, scope: "offer", blocked: [] };

test("never posted -> never; no cooldown set -> unset", () => {
  assert.equal(T.status(c, offer, [], "2026-09-20").kind, "never");
  assert.equal(T.status({ ...c, cooldownDays: null }, offer, [], "2026-09-20").kind, "unset");
});

test("cooldown: posted on day 0 with 7 days is eligible on day 7, not day 6", () => {
  const posts = [{ id: "p", offerId: "a", communityId: "c1", date: "2026-09-10" }];
  const s6 = T.status(c, offer, posts, "2026-09-16");
  assert.equal(s6.kind, "cooling");
  assert.equal(s6.daysToGo, 1);
  assert.equal(s6.eligibleOn, "2026-09-17");
  assert.equal(T.status(c, offer, posts, "2026-09-17").kind, "eligible");
});

test("latest post wins; other offers/communities don't interfere", () => {
  const posts = [
    { id: "1", offerId: "a", communityId: "c1", date: "2026-08-01" },
    { id: "2", offerId: "a", communityId: "c1", date: "2026-09-18" },
    { id: "3", offerId: "b", communityId: "c1", date: "2026-09-19" },
    { id: "4", offerId: "a", communityId: "c2", date: "2026-09-19" },
  ];
  const s = T.status(c, offer, posts, "2026-09-20");
  assert.equal(s.kind, "cooling");
  assert.equal(s.last, "2026-09-18");
});

test("scope 'any': a post of another offer starts the clock", () => {
  const posts = [{ id: "3", offerId: "b", communityId: "c1", date: "2026-09-19" }];
  assert.equal(T.status({ ...c, scope: "any" }, offer, posts, "2026-09-20").kind, "cooling");
  assert.equal(T.status(c, offer, posts, "2026-09-20").kind, "never");
});

test("blocked offers are flagged and flag when the offer ends before the cooldown does", () => {
  assert.equal(T.status({ ...c, blocked: ["a"] }, offer, [], "2026-09-20").kind, "blocked");
  const posts = [{ id: "p", offerId: "a", communityId: "c1", date: "2026-09-28" }];
  assert.equal(T.status(c, offer, posts, "2026-09-29").expiresFirst, true);
});

test("zero-day cooldown is allowed and is immediately eligible", () => {
  const posts = [{ id: "p", offerId: "a", communityId: "c1", date: "2026-09-20" }];
  assert.equal(T.status({ ...c, cooldownDays: 0 }, offer, posts, "2026-09-20").kind, "eligible");
});

test("composePost states the disclosure and both sides", () => {
  const body = T.composePost({ ...offer, conditions: ["Spend £10"] }, "https://x.example/hub/");
  assert.match(body, /my referral link/);
  assert.match(body, /I get £5/);
  assert.match(body, /You get: £5/);
  assert.match(body, /- Spend £10/);
  assert.match(body, /https:\/\/a\.example/);
});

test("sanitizeState drops junk and keeps valid data", () => {
  const s = T.sanitizeState({
    communities: [{ id: "c1", name: " r/x ", cooldownDays: 3.5 }, { id: "c1", name: "dup" }, { id: "c2" }],
    posts: [{ id: "p", offerId: "a", communityId: "c1", date: "2026-09-01" }, { id: "q", offerId: "a", communityId: "zzz", date: "2026-09-01" }, { id: "r", offerId: "a", communityId: "c1", date: "bad" }],
  });
  assert.equal(s.communities.length, 1);
  assert.equal(s.communities[0].name, "r/x");
  assert.equal(s.communities[0].cooldownDays, null);
  assert.equal(s.posts.length, 1);
  assert.deepEqual(T.sanitizeState(null), { communities: [], posts: [], hubUrl: "" });
});

console.log("\n" + n + " tests passed");
