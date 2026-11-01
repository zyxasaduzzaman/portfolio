# AR Fit — স্মার্ট ওজন কমানোর রুটিন

Dynamic personalised weight-loss routine web app by **AR**.

Live: https://zyxasaduzzaman.github.io/portfolio/ar-fit/

## Features
- Registration / login (salted SHA-256 password hashes), roles: user + admin (site owner's email gets the admin role)
- Per-device database (IndexedDB, stores: `accounts`, `userdata`) — every user gets a separate private dashboard
- Personal data intake form (gender, date of birth, height, current/target weight, timeframe, sitting hours, food habits, exercise place/minutes, class/work times, prayer, health conditions, sleep, water)
- Personalised dashboard engine: BMI, BMR, TDEE, daily calories with a safe deficit cap, protein, water schedule, plate rule, full daily schedule, meal plan with quantities, weekly exercise plan, condition-specific warnings, monthly targets
- Live progress: weight log + progress chart + percentage; daily checklist saved per date
- Weekly check-in notification after 7 days without a weight log (in-app + browser Notification API)
- Routine download as a print-ready PDF (browser print → Save as PDF), with AR branding and copyright footer
- Admin panel listing accounts stored on the device

## Honest limits
GitHub Pages hosting is static, so the database is the visitor's own browser database (IndexedDB) — separate per user and per device. A shared cloud database with cross-device accounts needs a backend such as Supabase or Firebase; the app structure is ready to be wired to one.

© 2026 AR — design, logo and content belong to AR. Do not copy without permission.
