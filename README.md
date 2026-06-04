# VialWise GLP Companion

Private GLP-1 injection tracking companion for local-first dose logs, site rotation, weight, costs, reconstitution arithmetic, food patterns, symptoms, mood, peptide notes and backups.

## What is included

- Pre-filled pen / Vials mode navigation
- First-load onboarding for name, style, start weight, GLP-1, current dose and pen/vial mode
- Mobile bottom navigation with Settings hub instead of a long top menu
- Boutique theme options based on user preference
- Soft glow/neumorphic interface skin with Rose, Aqua, Plum and Slate colour choices
- Animated page transitions, tactile pressed states and richer click/save feedback sounds
- Pre-filled pen cost per dose and doses-per-pen tracking
- Mode-specific setup: pen users see pen cost, vial users are guided into vial inventory
- GLP-1 onboarding for Semaglutide, Tirzepatide and Retatrutide
- Dose journey timeline
- Schedule and injection site rotation tracking
- Daily or weekly repeat schedule generation
- Visual body site map with last 8 weeks of taken injections
- Selectable injection site rotation, with abdomen/thighs on by default and arms optional
- More human-styled body map with recent-site marker intensity
- Quick mark-as-taken and note edit actions on records
- First-run setup checklist and backup health test
- Vial, pen and cost-per-injection calculations
- Peptide-neutral reconstitution calculator with mg/mcg/IU, ml/U-100 units, syringe sizing, rounding, doses per vial and draw warnings
- Weight, food, symptom, mood and daily check-in logs
- Photo-first meal logging with camera/upload, editable AI calorie and macro estimates, and manual fallback
- Optional local progress photos in the weight tracker with mobile camera/upload support
- Today focus shows first-versus-latest progress photos on days without scheduled injections
- Digestion tracker for constipation, diarrhoea, frequency, Bristol type, hydration and discomfort
- Event-based toilet visit logging with automatic daily frequency summary
- Mobile quick-log actions on Today
- Food and symptom correlation hints
- Trends tab with user-controlled match threshold for food/drink links to symptoms and digestion changes
- Healthy swap builder with simple recipe suggestions
- Claude Sonnet food swaps and meal photo estimates through a private Cloudflare Worker
- Automatic built-in fallback if the AI Worker is missing, over quota, blocked by billing or unavailable
- Anthropic API call cost estimates from returned token usage, with last-call and saved-total tracking
- Other peptide tracker for user-entered records
- Peptide symptom log with repeated co-use pattern notes
- Optional click/save sounds and mobile vibration feedback
- JSON backup, JSON restore and CSV summary export
- Auto-save to browser storage plus IndexedDB for more durable reopen behaviour

## Private AI Worker

Food photo estimates and food swaps use a Cloudflare Worker so the Anthropic key is not exposed in GitHub Pages, the browser or the APK.

- App endpoint: `https://vialwise.garryrobson85.workers.dev`
- Secret name in Cloudflare: `ANTHROPIC_API_KEY`
- Model: Claude Sonnet, configured in the Worker
- Worker setup files: `../cloudflare_worker`

Do not publish a real Anthropic key in `config.js`, GitHub Pages or the mobile app files.

## Deploy on GitHub Pages

1. Upload `index.html`, `style.css`, `app.js` and this `README.md` to the root of a GitHub repo.
2. Go to Settings > Pages.
3. Deploy from the main branch root.
4. Open the GitHub Pages URL.

## Safety

VialWise stores user-entered information and performs arithmetic calculations only. It does not recommend doses, compounds, peptides, foods or treatment.
