# Referral Hub

A small, static, no-build site for UK referral offers, plus a private tracker for managing where and when you've posted them.

- **`docs/`** is the public hub. It's published via GitHub Pages and driven entirely by `docs/offers.json`.
- **`tracker/`** is a private companion tool. It is **not** inside `docs/`, so GitHub Pages never publishes it, and nothing links to it.
- **`scripts/`** holds a validator, tests and a tiny local server. Plain Node, no `npm install`.

Everything is vanilla HTML/CSS/JS with no dependencies. The only external request is the Manrope web font, which falls back to the system font if blocked.

## Preview locally

```
node scripts/serve.mjs
```

Then open `http://localhost:8000/docs/` (public hub) and `http://localhost:8000/tracker/` (tracker). The server only listens on your own machine. A local server is needed because browsers won't let a page opened straight from disk load `offers.json`.

## Adding an offer

Open `docs/offers.json` and add an object to the list. You never touch the HTML.

```json
{
  "id": "some-bank",
  "provider": "Some Bank",
  "category": "Banking",
  "userGets": "£20 when you open an account",
  "userValue": 20,
  "referrerGets": "£20",
  "conditions": [
    "New customers only",
    "Make 1 card payment within 30 days"
  ],
  "expires": "2026-12-31",
  "checked": "2026-09-20",
  "link": "https://your-referral-link-here"
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, lowercase letters, numbers and hyphens. Also the anchor for sharing, e.g. `…/#some-bank`. |
| `provider` | yes | Name shown on the card. |
| `category` | yes | Anything you like. Category filter chips are built from the values you use. |
| `userGets` | yes | What the *person clicking* gets, in plain words. |
| `referrerGets` | yes | What *you* get. Shown on every card and next to the button. Don't leave it vague. |
| `userValue` | no | Pounds, as a number. Only used for the "You get at least" filter and value sorting. |
| `conditions` | no | List of qualifying conditions: minimum spend, time limits, eligibility. |
| `expires` | no | `YYYY-MM-DD`, or `null` for no end date. Live *through* that date, gone the day after. |
| `checked` | no | The date you last confirmed the terms against the provider's own page. Shown on the card. |
| `link` | yes | Your referral link. Must be `https://`. |
| `riskWarning` | no | Required wording for investing products. Shown prominently on the card. |
| `placeholder` | no | `true` shows the card with a disabled button. Delete the placeholders once you have real offers. |

**Expired offers disappear on their own.** Each visitor's browser compares `expires` with today's date, so nothing needs pruning (though it's tidy to delete old entries occasionally). If you make a mistake in one entry, that entry is hidden rather than shown broken. Check the problem before you push:

```
node scripts/validate-offers.mjs
```

GitHub also runs this check on every push (`.github/workflows/validate.yml`). It warns about entries whose terms were last checked more than 30 days ago.

### The seed data is placeholder-only

Every entry that ships in `offers.json` is invented, marked `placeholder`, and has no real link. Provider names, amounts and dates are illustrative only. Replace them with real offers and real terms taken from the provider's own page.

## Disclosure

The page opens with a plain-English disclosure above the offers, and every card states both sides: **You get** and **I get**. A note beside the button repeats that it's a referral link, and links carry `rel="sponsored"`. Composed posts in the tracker also open with a disclosure line. Keep it that way. It's what UK advertising rules expect (disclosure that's clear and prominent, not buried), and it makes the page more trustworthy. Some providers and communities also have their own disclosure or wording requirements, so check those. This isn't legal advice.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder **`/docs`**, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Only `docs/` is published. `tracker/` and `scripts/` stay in the repo but are not served. Note that GitHub Pages on a private repo needs a paid GitHub plan. On the free plan the repo must be public, and then the tracker's *code* is visible in the repo (your tracking *data* never is, because it only exists in your browser).

To update offers, edit `docs/offers.json`, commit and push. That's it.

## The tracker

Open `tracker/` from the local server (see above). It's for your eyes only, with no backend and no accounts. Everything is stored in your browser's `localStorage` on that device.

**It is a record-keeper, not a scheduler.** Cooldowns are yours to configure per community from that community's own rules, and it only counts days. It never suggests posting, and "cooldown passed" is not the same as "the mods will allow it".

- **Setup.** Add each community and give it a cooldown in days. Leave it blank if you're unsure. It then says *not set* rather than guessing. Choose whether the cooldown counts **per offer** or from **any post** you make in that community. Add notes (rules link, format requirements). Tick offers you can't post there, such as admin-only ones. They're shown as "Not available here".
- **Log a post.** Record offer, community and date (and optionally the post's URL). The cooldown starts from that date.
- **Status.** One card per community listing every live offer, sorted with things past their cooldown first, then still cooling down. Cooling-down rows show the date the cooldown ends and days to go, and flag when the offer ends before then.
- **Compose.** Generates a ready-to-copy post body from the offer data: what they get, the referral disclosure and what you get, conditions, end date, risk warning, and link (plus your hub link if set in Setup). It's editable before you copy. Check it against the community's own post format first.

**Cooldown arithmetic:** a 7-day cooldown on a post made on the 10th ends on the 17th, so on the 17th it's shown as eligible and on the 16th it's still cooling with 1 day to go. Dates are plain calendar dates in your local time.

**Backup.** Clearing site data, using private browsing, or switching browser/device means your records aren't there. Use **Setup → Export backup** now and then, and **Import backup** to restore or move to another device.

## Tests

```
node scripts/test-tracker.mjs      # date maths, offer validation, cooldown logic
node scripts/validate-offers.mjs   # offers.json
```

## Layout

```
docs/       public site (GitHub Pages)   index.html, app.js, common.js, style.css, offers.json
tracker/    private tool (not published)  index.html, tracker.js, logic.js, tracker.css
scripts/    serve.mjs, validate-offers.mjs, test-tracker.mjs
```
