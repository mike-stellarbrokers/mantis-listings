#!/usr/bin/env node
/**
 * Stellar Accommodation Brokers — MantisProperty listings sync
 *
 * Pulls listings from the MantisProperty CRM API and writes them to a
 * single static listings.json file. Designed to be run on a timer
 * (cron / GitHub Actions / etc) rather than called live from the browser,
 * since a static site has nowhere safe to keep the API key.
 *
 * Requires Node 18+ (uses the built-in fetch).
 *
 * Usage:
 *   MANTIS_AGENCY_ID=1234 MANTIS_API_KEY=abcd node fetch-listings.js
 * or copy .env.example to .env and fill it in (this script reads .env
 * itself — no extra dependency needed).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- tiny .env loader (avoids requiring the `dotenv` package) ----------
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv(path.join(__dirname, ".env"));

// --- config --------------------------------------------------------------
const AGENCY_ID = process.env.MANTIS_AGENCY_ID;
const API_KEY = process.env.MANTIS_API_KEY;
const LISTING_TYPES = (process.env.MANTIS_LISTING_TYPES || "business")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const INCLUDE_SOLD = (process.env.MANTIS_INCLUDE_SOLD || "false") === "true";
const INCLUDE_ARCHIVED =
  (process.env.MANTIS_INCLUDE_ARCHIVED || "false") === "true";
const OUTPUT_FILE = path.join(__dirname, "listings.json");
const PAGE_SIZE = 100;
const API_BASE = "https://api.mantisproperty.com.au/listings";

if (!AGENCY_ID || !API_KEY) {
  console.error(
    "Missing MANTIS_AGENCY_ID and/or MANTIS_API_KEY.\n" +
      "Copy .env.example to .env and fill in your credentials " +
      "(MantisProperty > Preferences > API), or pass them as env vars."
  );
  process.exit(1);
}

// --- fetch one listing type, paging through all results ------------------
async function fetchListingType(listingType) {
  const results = [];
  let pageNum = 1;

  while (true) {
    const url = new URL(API_BASE);
    url.searchParams.set("agencyId", AGENCY_ID);
    url.searchParams.set("ApiKey", API_KEY);
    url.searchParams.set("listingType", listingType);
    url.searchParams.set("includeSold", String(INCLUDE_SOLD));
    url.searchParams.set("includeArchived", String(INCLUDE_ARCHIVED));
    url.searchParams.set("pageNum", String(pageNum));
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Mantis API request failed (${listingType}, page ${pageNum}): ` +
          `${res.status} ${res.statusText} ${body}`
      );
    }

    const data = await res.json();
    const page = data.listingList || [];
    results.push(...page);

    const total = data.listingCount ?? page.length;
    if (results.length >= total || page.length === 0) break;
    pageNum += 1;
  }

  return results;
}

// --- normalize a raw Mantis listing into a simpler shape for the site ----
function normalize(raw, listingType) {
  return {
    id: raw.propertyID,
    uniqueId: raw.uniqueID,
    listingType,
    heading: raw.heading,
    description: raw.description,
    displayPrice: raw.displayPrice,
    sold: !!raw.sold,
    archived: !!raw.archived,
    underContract: !!raw.underContract,
    address: {
      street: raw.streetAddress,
      suburb: raw.suburb,
      state: raw.state,
      postcode: raw.postcode,
      country: raw.country,
    },
    categories: [raw.category1, raw.category2, raw.category3].filter(
      Boolean
    ),
    photos: (raw.photos || [])
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((p) => ({
        full: p.fullSize,
        thumbnail: p.thumbnail,
        mid: p.midSize,
      })),
    brochure: raw.brochure || null,
    salesPeople: (raw.salesPeople || []).map((sp) => ({
      name: [sp.firstName, sp.lastName].filter(Boolean).join(" "),
      email: sp.email,
      phone: sp.phone,
      mobile: sp.mobile,
      photo: sp.photo,
    })),
    customFields: (raw.customFields || []).map((f) => ({
      name: f.name,
      value: f.value,
    })),
    dateUpdated: raw.dateUpdated,
  };
}

// --- main ------------------------------------------------------------------
async function main() {
  console.log(
    `Syncing MantisProperty listings for agency ${AGENCY_ID} ` +
      `(types: ${LISTING_TYPES.join(", ")})...`
  );

  const all = [];
  for (const listingType of LISTING_TYPES) {
    try {
      const raw = await fetchListingType(listingType);
      console.log(`  ${listingType}: ${raw.length} listing(s)`);
      all.push(...raw.map((r) => normalize(r, listingType)));
    } catch (err) {
      console.error(`  ${listingType}: FAILED — ${err.message}`);
      process.exitCode = 1;
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    listingCount: all.length,
    listings: all,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Wrote ${all.length} listing(s) to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
