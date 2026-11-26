# aqarat_app

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Website and API

The Node.js server serves the website from `public/` and exposes the chat
monitor API. From this directory, install dependencies and start the server:

```sh
npm install
npm start
```

Then open `http://localhost:3000`. The server uses `PORT` when set by the
hosting platform and falls back to port `3000`.

The API includes a health check, keyword-based chat monitoring, subscription
plan previews, and flexible deal/saei previews. These previews do not process
payments, activate subscriptions, lock assets, or execute payouts. Google Meet
API link creation returns `501` until provider credentials and integration are
configured. The website can open the external Google Meet and Zoom meeting
pages; imo opens its website and does not create an imo call automatically.
Developer Socket.IO alerts require `DEVELOPER_ALERT_TOKEN`. Public WebRTC
preview rooms use random invite links, expire after two hours, and relay
signaling/chat only between sockets holding the room invite. The media stream
is peer-to-peer, is not recorded by this server, and may need a TURN service on
restricted networks. For multi-instance deployments, use shared room/session
storage and configure TURN before relying on live calls.

`GET /api/platform/info` returns platform contact, social, and bank settings;
these default to empty values until verified details are configured.
The website renders the returned values as text and creates only HTTPS social
links. Displayed account details are operator-provided, not independently
verified; users should verify the beneficiary before transferring money.
`POST /api/admin/update-settings` requires `PLATFORM_ADMIN_TOKEN` in the
`x-platform-admin-token` header. Keep this secret server-side, configure it
through the hosting provider, and use HTTPS. Updates are validated and held in
server memory only, so they reset when the process restarts; this endpoint is
not a persistent settings store.

Office profiles, the office ledger, appointments, and flexible deal records use
PostgreSQL. Provision a PostgreSQL database with your hosting provider and set
its connection string as the server-side `DATABASE_URL` environment variable
(for example, in the Render service environment settings). Set `DATABASE_SSL`
to `true` when the provider requires TLS; certificate verification remains on
unless `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is explicitly configured.
The server creates the required tables on startup. It returns HTTP 503 rather
than reporting a successful save when the database is not configured or ready.
Never put database credentials in Flutter code or commit them to the repository.

`GET /api/ledger`, `POST /api/ledger/add`, `POST /api/office/profile`,
`GET /api/office/network`, `GET/POST /api/appointments`, and
`GET /api/deals`/`POST /api/deals/create-flexible` use the database. The office
profile API currently represents a single shared office record and requires
account authentication and per-user authorization before it is suitable for a
multi-user production deployment. Public network results exclude hidden
profiles. AI provider and Google Meet credentials are not configured by this
project; those features report that they are unavailable instead of
fabricating responses or meeting links.

The Flutter app is configured to call
`https://alalami-aqaratcom.onrender.com`. Deploy the updated server and set
`DATABASE_URL` in that Render service before cloud-backed features can work in
the released APK.

The Flutter interface is Arabic RTL and includes the marketplace filters,
office/profile and ledger, unified listing flow, partner directory, developer
subscription requests, an offline investment quiz, and a movable assistant
launcher. Build a debug APK from this directory with:

```sh
flutter pub get
flutter build apk --debug
```

The output is `build/app/outputs/flutter-apk/app-debug.apk`. The assistant,
payments, external meetings, video/live broadcast, and account-level
authorization still require their respective server/provider integrations;
the interface reports unavailable integrations rather than claiming they
were completed.

`POST /api/regulatory/mega-connect` accepts one of `Sell`, `Rent`, `Mortgage`,
`Develop`, or `Invest` and returns a preview only. It does not retain or log
identity/deed values, verify ownership, or submit anything to a government,
financial, or banking authority. The corresponding Flutter screen is also
informational and does not collect or transmit those values.

The compliance endpoints (`POST /api/compliance/validate-deal` and
`POST /api/compliance/validate-deal-flexible`) check submitted fields and
record requests for manual review; they do not verify licenses, security
clearances, or the authenticity of stamps. A request does not create or sign a
contract, lock a deal, or unlock communications. The real-estate location rule
is an application policy and should be reviewed by qualified counsel before
production use. Exceptional bypass requests on the flexible endpoint require
the server-side `COMPLIANCE_BYPASS_TOKEN`; requests still remain pending
manual review.

The web compliance form presents an informational draft before submitting.
Acknowledging it records only that the user chose to continue with the review
request; it is not an electronic signature, contract acceptance, payment, or
compliance approval. Review records currently exist only in server memory.

The website's Saudi location picker and Open-Meteo weather control use the
checked-in `public/saudi_regions.js` data. It covers the 13 regions, their
governorates, and a curated selection of cities and centers; it is not a
government-maintained exhaustive gazetteer of every village or center. Weather
is fetched from Open-Meteo without an API key.

Listing images, videos, and PDFs can be saved to PostgreSQL after the listing
is created (up to five files, 3 MB each, and 12 MB total per upload). Media is
served from the same API and linked to its listing; plan for database storage
and backups accordingly. Uploads require the one-time bearer token returned
when the listing is created. Mark equirectangular images as panoramas to enable
the browser's WebGL spherical viewer, with a draggable image fallback when
WebGL is unavailable.

Staff accounts are stored in `staff_users`; passwords use scrypt hashes and
staff access tokens are short-lived in-memory sessions. Set the server-only
`SUPER_ADMIN_TOKEN` (at least 32 random bytes) to enable the owner panel. The
token must be entered in the owner panel and is not saved by the browser.
Staff permissions are enforced by separate API routes for listing review,
appointment/request management, CRM follow-ups, recruitment, story moderation,
and product management. Staff routes do not return platform settings, bank
details, or server secrets. Job applications are written to `job_applications`
(and the legacy `career_applications` table for compatibility). Applicants may
attach a PDF resume up to 2 MB; resumes are downloadable only through the
recruitment-permission endpoint.

VIP stories are available through `GET/POST /api/stories`; publishing accepts
validated image or video media and is rate-limited. Stories expire after 24
hours unless a staff member with `manageStories` pins them. Public sharing uses
high-entropy links. The stories API, like other PostgreSQL-backed features,
requires `DATABASE_URL`.

The affiliate catalog is exposed through `GET /api/products`. Creating or
editing products and viewing the staff catalog requires the `manageProducts`
permission. Product photos are limited to five validated JPEG, PNG, or WebP
images (3 MB each, 12 MB total). Product and media records are stored in
PostgreSQL. Contact invitation uses the browser Contacts Picker when
available, with a copyable invite message as a fallback; Flutter uses the
platform contact picker and only opens the SMS or WhatsApp composer after the
user selects a contact.

Stories and products are not a payment, checkout, or affiliate-payout system.
Product prices, inventory, and commission values are listing information;
orders, shipping, payments, and commission settlement still require separate
business and payment integrations. Public story submission currently has no
account identity, so configure operational moderation and database access
before enabling it for a public production audience.

The chat monitor uses keyword matching; it is not an AI model and does not
block messages. Developer alerts are sent only to authenticated Socket.IO
connections configured with `DEVELOPER_ALERT_TOKEN`. Configure
`ALLOWED_ORIGINS` as a comma-separated list when the web client is hosted on a
different origin.
