# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app does

A static single-page web app ("FareWise") that helps ride-share drivers audit their fares. Users upload Waybill and Trip Details screenshots; Tesseract.js OCR extracts the values; the app calculates the expected fare and compares it to the actual indented fare.

## Stack

Plain HTML/CSS/JS — no build step, no framework, no package manager. The only external dependency is Tesseract.js loaded from a CDN (`cdn.jsdelivr.net`).

## Development

Open `index.html` directly in a browser, or serve with any static server:

```
python3 -m http.server 8080
# or
npx serve .
```

No compilation, no install step.

## Versioning / cache busting

**Every change requires a manual version bump** — the comment at line 2 of `index.html` explains the protocol:

1. Increment `VERSION` file (semver)
2. Update the version string in three places in `index.html`: the `<!-- VERSION: -->` comment, `styles.css?v=`, and `script.js?v=`
3. Update the `<span class="app-version">` display text in `index.html`

## Deployment

The app is embedded at `abouttowncars.com.au/calapp/` via an iframe or WordPress injection. The `body.fare-wise-app` class and `#fare-wise-root` container ID scope all styles and JS to avoid conflicts with the host site. The `initFareWise()` function uses retry logic (`setTimeout`) to handle AJAX-loaded host pages.

## Key logic (script.js)

- **`extractFromWaybill(text)`** — parses OCR text for Base Fare, Per Minute, Per KM rates. Uses `parseDollarAmounts()` which only matches values with two decimal places (e.g. `$1.23`) to avoid capturing integers like time or distance values.
- **`extractFromTripDetails(text)`** — parses duration (multiple formats), distance, and the "first indented fare" (second dollar amount found, which sits below the total Fare line in the Trip Details screen).
- **`calculateAndAudit()`** — formula: `Expected = Base + (Minutes × PerMinRate) + (km × PerKmRate)`. Uses `roundToCent()` (Math.round × 100 / 100) throughout to avoid floating-point drift.
- Results are classified as Match (< $0.005 diff), Underpaid (actual < expected), or Overpaid (actual > expected).
