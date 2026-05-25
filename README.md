# VialWise

GLP-1-first tracking companion with optional vial, reconstitution, inventory, food/symptom and additional compound tracking.

## Deploy on GitHub Pages
1. Upload these files to a GitHub repo.
2. Go to Settings → Pages.
3. Deploy from main branch root.
4. Open the GitHub Pages URL.

## App-store ready direction
This static version is deliberately modular:
- `index.html` = screens/views
- `style.css` = design system
- `app.js` = local data models and logic

Future mobile conversion can map the same data models to:
- SQLite/secure storage
- cloud sync
- push notifications
- Apple Health / Google Fit
- user accounts
- encrypted backup

## Safety
VialWise does not recommend doses, compounds or treatment. It stores user-entered information and performs arithmetic calculations only.
