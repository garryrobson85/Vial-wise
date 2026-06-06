# Petrair SA Website

Static website for Petrair SA. Open `index.html` directly for a local preview, or upload the folder contents to your host.

## Project Structure

```text
index.html              Main website markup and SEO schema
css/styles.css          Site styling
js/translations.js      Editable UTF-8 language dictionaries
js/script.js            Site behaviour, prices, modals and form submit
images/                 Logo, hero, product and route-map assets
workers/                Cloudflare Worker source files
```

## Price Feed Setup

The price board is already on the page and is wired to this Cloudflare Worker:

```text
https://petrair-prices.garryrobson85.workers.dev/
```

If that Worker is returning `{"error":"market feed unavailable"}`, replace the Worker code in Cloudflare with the contents of `workers/petrair-prices-worker.js`, then deploy it again.

1. Go to `https://dash.cloudflare.com/`.
2. Open **Workers & Pages**.
3. Choose **Create application**.
4. Choose **Worker**.
5. Create/deploy a Worker, then open **Edit code**.
6. Replace the Worker code with the contents of `workers/petrair-prices-worker.js`.
7. Deploy it.
8. Use this Worker URL: `https://petrair-prices.garryrobson85.workers.dev/`.
9. For a quick local test, open the site with:

```text
index.html?feed=https://petrair-prices.garryrobson85.workers.dev/
```

10. The permanent setup is already in `js/script.js`:

```js
const PRICE_FEED_URL = "https://petrair-prices.garryrobson85.workers.dev/";
```

## Cloudflare Worker Code

The latest price Worker code is included in `workers/petrair-prices-worker.js`. Use that file as the source of truth. It supports a debug mode:

```text
https://petrair-prices.garryrobson85.workers.dev/?debug=1
```

## Private Lead Brief Setup

The RFQ form can also send a private salesperson prep brief. This is not visible to the website visitor and does not reject or rank enquiries publicly.

1. Create another Cloudflare Worker.
2. Paste in the contents of `workers/contactform-worker.js`.
3. Deploy it.
4. Add one of these Worker variables:

```text
LEAD_WEBHOOK_URL = a private Zapier / Make / Google Apps Script webhook
```

or:

```text
RESEND_API_KEY = a Resend API key for sending the brief by email
LEAD_TO_EMAIL = garryrobson85@googlemail.com
```

Optional AI and Telegram variables:

```text
ANTHROPIC_API_KEY = your Claude API key for private AI summary/translation/reply prep
ANTHROPIC_MODEL = claude-sonnet-4-6
ANTHROPIC_WEB_SEARCH = true
ANTHROPIC_WEB_SEARCH_MAX = 3
OPENROUTER_API_KEY = optional fallback OpenRouter key
OPENROUTER_MODEL = google/gemini-2.5-flash
TELEGRAM_BOT_TOKEN = your Telegram bot token
TELEGRAM_CHAT_ID = your Telegram chat ID
```

The Worker always accepts the RFQ and builds a deterministic salesperson brief. If `ANTHROPIC_API_KEY` is set, it uses Claude first. If `ANTHROPIC_WEB_SEARCH=true`, Claude can also perform limited public web research and return company research, person/LinkedIn context, association assessment and source URLs. If Claude is not set but `OPENROUTER_API_KEY` is set, it uses OpenRouter. If AI fails or no AI key is set, the raw/enriched lead is still delivered through any configured webhook, email or Telegram route.

5. Test locally by opening:

```text
index.html?leadBrief=https://contactform.garryrobson85.workers.dev/
```

6. When ready, set the Worker URL permanently near the top of `js/script.js`:

```js
const LEAD_BRIEF_URL = "https://contactform.garryrobson85.workers.dev/";
```

The brief includes company/email context, website reachability, prepared Google/LinkedIn/company-registry search links, suggested verification questions and a reply angle. With `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`, it also adds private AI summary, translation, prep band and reply draft. With Anthropic web search enabled, Telegram also includes compact company/person research and whether the person appears publicly associated with the company. It is preparation only, not legal KYC or sanctions clearance.

## Languages

The language selector is in the top navigation. It stores the selected language in the browser so returning visitors keep their choice. Edit language strings in `js/translations.js`.

Current languages: English, French, Spanish, German, Arabic and Chinese.

## Competitor Review Notes

The remake was checked against the way major energy trading sites present themselves:

- Trafigura emphasises complex supply chains, logistics, storage, finance and end-to-end delivery.
- Gunvor presents clear product pages with use, supply, demand, transport, storage and financing context.
- Mercuria gives governance and compliance prominence, including physical, financial and environmental regulation.
- Gunvor and similar groups publish warnings about unauthorised communications and false mandate claims.

For Petrair, the important missing pieces were:

- Real logo usage rather than a placeholder mark.
- Product-specification interactions for crude oil, Jet A-1, ULSD 10ppm and LPG.
- A visible supply-chain capability section.
- Official-channel and mandate-verification language.
- Corporate details for due diligence and AI/search confidence.
- Clearer distinction between market reference prices and executable trade prices.

## Important

Public prices are informational only and must not be described as executable trade prices. Keep the disclaimer visible unless Petrair SA's legal/compliance review says otherwise.
