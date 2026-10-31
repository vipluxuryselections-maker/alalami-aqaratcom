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

Then open `http://localhost:3000`. The chat monitor currently uses keyword
matching; it is not an AI model and does not block messages. Developer alerts
are sent only to authenticated Socket.IO connections configured with
`DEVELOPER_ALERT_TOKEN`. Configure `ALLOWED_ORIGINS` as a comma-separated list
when the web client is hosted on a different origin.
