# salesfog

A browser-based sales script runner. You bring your own script. Salesfog reads the prospect's website and adapts the script's wording to their business. For example, a diner gets "regulars" and a mixology bar gets "clients".

## Run it

```sh
npm start          # http://localhost:3000  (PORT=8080 npm start to change)
npm test
```

You need Node 18 or newer. There are no dependencies.

## How it works

1. **Load a script.** Upload a `.txt` or `.md` file, drop one on the editor, or paste one in. Scripts are saved in your browser's localStorage. The TZ BitBar referral script and a sample loyalty script are included.
2. **Start a call.** Enter the company's website and the prospect's name. The server fetches the page and scores it against industry profiles. It looks at keywords in the title, description, headings and body text, schema.org `@type` markup, and the domain name. From that it picks an industry such as a cocktail bar, diner, restaurant, café, salon, gym, dental practice or law firm. If the guess is wrong, change it in the dropdown during the call.
3. **Run the script.** Step through it with **Next** and **Back** or the ← → keys. Placeholders are filled in and highlighted green. Words that were adapted to the industry are highlighted yellow.
4. **Handle objections.** The bottom bar always shows **Not interested**, **Not the right time** and **Already using a competitor**, plus any custom objections your script defines. Keys 1–9 trigger them. The rebuttal appears over the current step, and Esc takes you back.
5. **End the call.** Record an outcome and notes. Recent calls, along with the objections you hit, are listed on the Setup page.

## Script format

```
# Opener
Hi {{first_name}}, this is {{my_name}} from {{my_company}}.
[cocktail_bar] Your cocktail program looks great.
[diner] Looks like the kind of spot people come back to for years.
We help you keep {{customers}} coming back to your {{venue}}.
> Pause and let them answer. (a note to you, not read aloud)

# Pitch
- bullet points work
- **bold** too

# Objection: Not interested
Totally fair, {{first_name}}...

# Objection: Send me an email
(custom objections get their own button)
```

| Placeholder | Value |
|---|---|
| `{{prospect}}`, `{{first_name}}` | Prospect's full name or first name |
| `{{company}}`, `{{website}}` | Name and URL taken from the site |
| `{{industry}}` | Detected industry label |
| `{{my_name}}`, `{{my_company}}` | Your details from Setup |
| `{{pos}}` | POS system detected from the site's ordering and gift-card links (Toast, Square, Clover, Lightspeed, SpotOn, TouchBistro, ...). You can fill it in or correct it before or during the call. |
| `{{address}}`, `{{city}}` | The prospect's address, found on their website |
| `{{local_bar}}`, or any `{{local_…}}` / `{{nearby_…}}` | The nearest similar place to the prospect (see below). Type a name to override it. |
| anything else, e.g. `{{new_menu}}` | Becomes a field you fill in before the call, and can edit during it |
| `{{customers}}`, `{{customer}}` | e.g. regulars, clients, guests, patients, members |
| `{{venue}}`, `{{team}}`, `{{offering}}`, `{{visit}}` | e.g. diner/bar/salon, staff/bar team, menu/cocktail program |

- Write `{{Customers}}` to get a capitalized value.
- With **Auto-adapt wording** turned on, the plain words *customers*, *customer*, *clients*, *client*, *regulars*, *guests* and *patrons* are replaced with the industry's term, even when they aren't placeholders.
- `[id, id] line` shows a line only for those industries. `[!id] line` hides a line for that industry.
- If a script has no `#` headings, each paragraph becomes a step.
- A missing built-in objection falls back to a sensible default rebuttal.

Industry profiles and their vocabulary are defined in `lib/industries.js`. Add or tweak profiles there.

## Address and nearby places

When a call starts, Salesfog finds the prospect's address. It checks these sources in order:

1. schema.org structured data or map metadata on their homepage
2. Google Maps links, following `maps.app.goo.gl` short links
3. a street address in the page text
4. their Contact or Visit page
5. a map search for the business name, as a last resort

The address shown on the call screen names its source. Click **Change** to type a different one.

Salesfog then lists similar places nearby, chosen by the detected industry. A cocktail bar gets bars (cocktail bars ranked first), a pub gets pubs, a diner gets diners and breakfast/American restaurants, and so on. The prospect itself is left out. The nearest match fills `{{local_bar}}`. Click any other place to use it instead.

Location data comes from OpenStreetMap and needs no API key. Addresses are looked up with [Nominatim](https://nominatim.org), limited to one request per second under its usage policy. Nearby places come from [Overpass](https://overpass-api.de), falling back to Nominatim. You can point these at your own servers with `NOMINATIM_URL` and `OVERPASS_URL`.

## Notes

- The website is fetched by the local server, because browsers block cross-site requests. Requests to private or internal addresses are refused.
- Sites that render all their content with JavaScript, or that block bots, may give no signal. Salesfog then falls back to "General business", and you can pick the industry by hand.
