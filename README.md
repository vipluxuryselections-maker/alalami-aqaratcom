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
