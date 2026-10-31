const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Canvas = require("./models/canvasModel");
const { loadConfig } = require("./config/env");
const { connectDB, disconnectDB } = require("./config/db");
const { createApp } = require("./app");

function extractSocketToken(socket) {
  if (socket.handshake.auth && socket.handshake.auth.token) {
    return socket.handshake.auth.token;
  }
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader) {
    return authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
  }
  return null;
}

function createServer(app, config) {
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true
    },
    maxHttpBufferSize: 1e6 // 1MB default
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = extractSocketToken(socket);
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  let canvasData = {};

  io.on("connection", (socket) => {
    socket.on("joinCanvas", async ({ canvasId }) => {
      try {
        if (!canvasId || !mongoose.Types.ObjectId.isValid(canvasId)) {
          return socket.emit("error", { message: "Invalid canvasId" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
          return socket.emit("unauthorized", { message: "Canvas not found" });
        }

        const isOwner = String(canvas.owner) === String(socket.userId);
        const isShared = canvas.shared.some((id) => String(id) === String(socket.userId));
        if (!isOwner && !isShared) {
          return socket.emit("unauthorized", {
            message: "You are not authorized to join this canvas."
          });
        }

        socket.join(canvasId);
        const existing = canvasData[canvasId] || canvas.elements || [];
        socket.emit("loadCanvas", existing);
      } catch (error) {
        socket.emit("error", { message: "Failed to join canvas" });
      }
    });

    socket.on("drawingUpdate", async ({ canvasId, elements }) => {
      try {
        if (!canvasId || !Array.isArray(elements)) return;
        canvasData[canvasId] = elements;
        socket.to(canvasId).emit("receiveDrawingUpdate", elements);

        if (mongoose.Types.ObjectId.isValid(canvasId)) {
          await Canvas.findByIdAndUpdate(canvasId, {
            elements,
            updatedAt: new Date()
          });
        }
      } catch (error) {
        console.error("drawingUpdate error:", error.message);
      }
    });
  });

  return { httpServer, io };
}

async function startServer(customConfig) {
  const config = customConfig || loadConfig();
  const dbInfo = await connectDB(config);
  console.log(`Database connected: ${dbInfo.isMemory ? "in-memory mongodb" : dbInfo.uri}`);

  const app = createApp(config);
  const { httpServer, io } = createServer(app, config);

  return new Promise((resolve) => {
    const serverInstance = httpServer.listen(config.PORT, () => {
      console.log(`Server listening on port ${config.PORT} (${config.NODE_ENV})`);
      resolve({ serverInstance, httpServer, io, config });
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Fatal startup error:", err);
  });
}

module.exports = {
  createServer,
  startServer,
  extractSocketToken
};
