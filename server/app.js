const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createAuthMiddleware } = require("./middlewares/authMiddleware");
const { createUserRoutes } = require("./routes/userRoutes");
const { createCanvasRoutes } = require("./routes/canvasRoutes");

function createApp(config) {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS allowlist
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true
    })
  );

  app.use(express.json({ limit: "2mb" }));

  const authMiddleware = createAuthMiddleware(config);

  // Health endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use("/api/users", createUserRoutes(config, authMiddleware));
  app.use("/api/canvas", createCanvasRoutes(authMiddleware));

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error("Express Error:", err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Internal Server Error"
    });
  });

  return app;
}

module.exports = { createApp };

