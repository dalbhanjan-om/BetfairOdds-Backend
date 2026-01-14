import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { listEvents } from "./controllers/BetfairController/EventListController.js";
import { login } from "./controllers/BetfairController/AuthController.js";
import { listMarketCatalogue } from "./controllers/BetfairController/MarketCatalogue.js";
import { startBot } from "./controllers/BetfairController/StreamController.js";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://sidbetbot.com",
  "https://www.sidbetbot.com",
  "https://betfairfrontend.netlify.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// JSON parser for other routes
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/login", login);

app.post("/events", listEvents);

app.post("/market-catalogue", listMarketCatalogue);
app.post("/bot/start", startBot);

export default app;
