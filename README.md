# Stellar — MantisProperty listings sync

Pulls business listings from the MantisProperty CRM API into a static
`listings.json` file that the new Stellar Accommodation Brokers website can
read directly, with no server of its own required.

## Why a sync script instead of calling the API from the browser

The same `ApiKey` that reads listings can also create/update contacts and
leads in MantisProperty, so it can't be embedded in client-side JavaScript
(anyone viewing the page source would have write access to your CRM). This
script keeps the key server-side and does the API call itself, on a
schedule, publishing only the (already-public) listing data.

## Setup

1. In MantisProperty, go to **Preferences → API** to get your `agencyId`
   and `ApiKey`.
2. `cp .env.example .env` and fill in those two values.
3. `node fetch-listings.js` — this writes `listings.json` in this folder.
4. Open `example-site/index.html` (via `npm run serve-example`, or any
   static server) to see it rendered as listing cards.

By default it pulls `listingType=business` (accommodation/tourism
businesses for sale), since that's Stellar's core listing type. Set
`MANTIS_LISTING_TYPES=business,commercial` (comma-separated) in `.env` to
pull more than one type — see the full list in `.env.example`.

## Keeping it up to date automatically

`.github/workflows/sync-listings.yml` runs the sync every hour via GitHub
Actions and commits the refreshed `listings.json` back to the repo — no
server to maintain. To use it:

1. Push this project to a GitHub repo.
2. In the repo's **Settings → Secrets and variables → Actions**, add
   `MANTIS_AGENCY_ID` and `MANTIS_API_KEY` as repository secrets.
3. If the new site is hosted somewhere that redeploys automatically on a
   git push (Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.), each
   sync will trigger a fresh deploy with current listings — otherwise
   trigger a deploy hook as an extra workflow step.

Adjust the cron schedule in that file if hourly is more or less often than
you need — given how few properties you carry at a time, even a few times a
day would likely be plenty.

## Output shape (`listings.json`)

```json
{
  "generatedAt": "2026-09-08T00:00:00.000Z",
  "listingCount": 2,
  "listings": [
    {
      "id": 82980,
      "uniqueId": "res82980",
      "listingType": "business",
      "heading": "...",
      "description": "...",
      "displayPrice": "$469,999",
      "sold": false,
      "archived": false,
      "underContract": false,
      "address": { "street": "...", "suburb": "...", "state": "QLD", "postcode": "...", "country": "Australia" },
      "categories": ["Accommodation/Tourism"],
      "photos": [{ "full": "...", "thumbnail": "...", "mid": "..." }],
      "brochure": null,
      "salesPeople": [{ "name": "...", "email": "...", "phone": "...", "mobile": "...", "photo": "..." }],
      "customFields": [{ "name": "...", "value": "..." }],
      "dateUpdated": "..."
    }
  ]
}
```

This is a simplified/flattened version of Mantis's raw response — the full
field list (bedrooms, land details, inspection times, floor plans, etc.) is
documented at the API source if you need to add fields later; edit the
`normalize()` function in `fetch-listings.js` to pass more of them through.

## Next steps once the new site's platform is chosen

This script and its output are platform-agnostic — any static site
generator or framework can read `listings.json` at build time or fetch it
client-side. Once the replatform lands on a specific stack (see the
separate replatform notes), the example page here can be swapped for real
templates in that stack while the sync script stays as-is.
