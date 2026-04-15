import "./configs/instrument.js";
import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { clerkMiddleware } from '@clerk/express'
import clerkWebhooks from './controllers/clerk.js';
import * as Sentry from "@sentry/node";
import userRouter from "./routes/userRoutes.js";
import projectRouter from "./routes/projectRoutes.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Health check — no auth middleware needed
app.get('/', (req: Request, res: Response) => {
    res.send('Hello, BanaaoAI Server is running!');
});

app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

// Webhook must use raw body BEFORE express.json()
app.post('/api/clerk', express.raw({ type: 'application/json' }), clerkWebhooks);

app.use(express.json());
app.use(clerkMiddleware());
app.use('/api/user', userRouter);
app.use('/api/project', projectRouter);
Sentry.setupExpressErrorHandler(app);
Sentry.init({
  dsn: "https://e4d60530346b8fda1a682bfa3f513049@o4511217415553024.ingest.us.sentry.io/4511217424138240",
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  // Enable logs to be sent to Sentry
  enableLogs: true,
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
