# FIPS Lookup

A simple static website to look up U.S. county and state by FIPS code, or to get a FIPS code by county and state name.

## Features

- **Look up by FIPS code**
  - **2-digit code** — returns the state name (e.g. `01` → Alabama).
  - **5-digit code** — returns full county and state name (e.g. `01001` → Autauga County, Alabama).
- **Look up by name**
  - Enter county and state (full name or 2-letter abbreviation, e.g. AL) to get the 5-digit FIPS code.
- **State abbreviations** — supports 2-letter state codes (e.g. AL, CA) in addition to full state names.
- **Fuzzy matching** — if your county or state doesn’t match exactly (e.g. typo or variation), the site suggests the closest match(es) and tells you when the result was not an exact match.
- **Multiple matches** — when several counties/states match (e.g. same county name in different states), all matches are listed with a short reminder.
- **Copy to clipboard** — copy the result (county, state, or FIPS) with one click.

## How to run

No build step or server is required. Options:

1. **Open locally**  
   Open `index.html` in a browser (e.g. double-click or drag into the window).  
   Note: loading the JSON data via `fetch()` may be blocked by the browser when using `file://`. Use one of the options below if that happens.

2. **Simple HTTP server** (recommended for local use)  
   From the project root:
   ```bash
   # Python 3
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000` in your browser.

3. **Deploy**  
   Upload the whole folder (including `data/` and `index.html`) to any static host (e.g. GitHub Pages, Netlify, or a plain web server). The app runs entirely in the browser.

## Project structure

```
fips_web/
├── data/
│   └── fips_lookup.json  # FIPS codes and county/state names
├── index.html            # Single-page UI
├── app.js                # Load data, lookups, and rendering
├── styles.css            # Layout and styling
└── README.md
```

## Data

The app uses `data/fips_lookup.json`, a JSON array of `[fips, name]` pairs:

- **FIPS** — 5-digit code (e.g. `"01001"`). Entries ending in `"000"` (e.g. `"01000"`) represent states; all other entries are counties.
- **Name** — For state entries, the state name; for county entries, the county name (e.g. `"Autauga County"`).

No data is sent to any server; everything runs in your browser.
