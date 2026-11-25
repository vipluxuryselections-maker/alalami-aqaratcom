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
link creation returns `501` until Google API credentials and integration are
configured. Realtime Socket.IO connections require `DEVELOPER_ALERT_TOKEN`;
live-stream messages are restricted to authenticated connections that joined
the corresponding property room.

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

The chat monitor uses keyword matching; it is not an AI model and does not
block messages. Developer alerts are sent only to authenticated Socket.IO
connections configured with `DEVELOPER_ALERT_TOKEN`. Configure
`ALLOWED_ORIGINS` as a comma-separated list when the web client is hosted on a
different origin.
