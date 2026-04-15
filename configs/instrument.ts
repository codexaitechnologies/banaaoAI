// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: "https://e4d60530346b8fda1a682bfa3f513049@o4511217415553024.ingest.us.sentry.io/4511217424138240",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
