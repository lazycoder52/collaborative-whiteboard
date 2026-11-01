const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Canvas = require("./models/canvasModel");
const { loadConfig } = require("./config/env");
const { connectDB, disconnectDB } = require("./config/db");
const { createApp } = require("./app");
const { CanvasRoomManager } = require("./services/canvasRoomManager");
const { TokenBucket } = require("./services/tokenBucket");
const {
  joinCanvasSchema,
  elementAddSchema,
  elementUpdateSchema,
  elementRemoveSchema,
  undoSchema,
  redoSchema
} = require("./services/socketSchemas");

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

function createServer(app, config, customRoomManager = null) {
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true
    },
    maxHttpBufferSize: 1e6 // 1MB maximum payload size limit
  });

  const roomManager = customRoomManager || new CanvasRoomManager(2000);

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = extractSocketToken(socket);
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.rateLimiter = new TokenBucket(60, 40); // 60 burst, 40/sec refill
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("joinCanvas", async (rawPayload) => {
      try {
        const parseResult = joinCanvasSchema.safeParse(rawPayload);
        if (!parseResult.success) {
          return socket.emit("error", {
            message: "Invalid joinCanvas payload",
            details: parseResult.error.issues
          });
        }

        const { canvasId } = parseResult.data;
        if (!mongoose.Types.ObjectId.isValid(canvasId)) {
          return socket.emit("error", { message: "Invalid canvasId format" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
          return socket.emit("unauthorized", { message: "Canvas not found" });
        }

        const isOwner = String(canvas.owner) === String(socket.userId);
        const isShared = canvas.shared.some(
          (id) => String(id) === String(socket.userId)
        );
        if (!isOwner && !isShared) {
          return socket.emit("unauthorized", {
            message: "You are not authorized to join this canvas."
          });
        }

        const room = await roomManager.loadOrCreateRoom(canvasId);
        roomManager.joinSocket(room, socket.id, socket.userId);
        socket.join(canvasId);
        socket.currentCanvasId = canvasId;

        // Send full canvas state ONLY on join
        socket.emit("canvas:load", {
          canvasId,
          elements: roomManager.getElements(canvasId)
        });

        // Broadcast presence
        socket.to(canvasId).emit("presence:join", {
          canvasId,
          userId: socket.userId
        });
      } catch (error) {
        socket.emit("error", {
          message: "Failed to join canvas",
          details: error.message
        });
      }
    });

    socket.on("element:add", (rawPayload) => {
      if (!socket.rateLimiter.consume(1)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      const parseResult = elementAddSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        return socket.emit("error", {
          message: "Invalid element:add payload",
          details: parseResult.error.issues
        });
      }

      const { canvasId, element } = parseResult.data;
      const added = roomManager.addElement(canvasId, element, socket.userId);
      if (added) {
        socket.to(canvasId).emit("element:add", { canvasId, element: added });
      }
    });

    socket.on("element:update", (rawPayload, ackCallback) => {
      if (!socket.rateLimiter.consume(1)) {
        if (typeof ackCallback === "function") {
          ackCallback({ success: false, error: "Rate limit exceeded" });
        }
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      const parseResult = elementUpdateSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        if (typeof ackCallback === "function") {
          ackCallback({
            success: false,
            error: "Invalid element:update payload"
          });
        }
        return socket.emit("error", {
          message: "Invalid element:update payload",
          details: parseResult.error.issues
        });
      }

      const { canvasId, id } = parseResult.data;
      const result = roomManager.updateElement(
        canvasId,
        id,
        parseResult.data,
        socket.userId
      );

      if (!result) {
        if (typeof ackCallback === "function") {
          ackCallback({ success: false, error: "Element not found" });
        }
        return;
      }

      if (result.outOfOrder) {
        socket.emit("canvas:load", {
          canvasId,
          resync: true,
          elementId: id,
          elements: [result.element]
        });
        if (typeof ackCallback === "function") {
          ackCallback({
            success: false,
            resync: true,
            expectedSeq: result.expectedSeq
          });
        }
        return;
      }

      if (result.limitExceeded) {
        socket.emit("error", { message: result.error });
        if (typeof ackCallback === "function") {
          ackCallback({ success: false, error: result.error });
        }
        return;
      }

      if (result.success) {
        if (typeof ackCallback === "function") {
          ackCallback({ success: true, seq: result.seq });
        }
        socket.to(canvasId).emit("element:update", {
          canvasId,
          id,
          seq: result.seq,
          points: result.appendedPoints,
          patch: parseResult.data.patch
        });
      }
    });

    socket.on("element:remove", (rawPayload) => {
      if (!socket.rateLimiter.consume(1)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      const parseResult = elementRemoveSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        return socket.emit("error", {
          message: "Invalid element:remove payload",
          details: parseResult.error.issues
        });
      }

      const { canvasId, id } = parseResult.data;
      const removed = roomManager.removeElement(canvasId, id, socket.userId);
      if (removed) {
        socket.to(canvasId).emit("element:remove", { canvasId, id });
      }
    });

    socket.on("undo", (rawPayload) => {
      if (!socket.rateLimiter.consume(1)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      const parseResult = undoSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        return socket.emit("error", { message: "Invalid undo payload" });
      }

      const { canvasId } = parseResult.data;
      const result = roomManager.undo(canvasId, socket.userId);
      if (result) {
        if (result.actionType === "remove") {
          io.in(canvasId).emit("element:remove", { canvasId, id: result.id });
        } else if (result.actionType === "add") {
          io.in(canvasId).emit("element:add", {
            canvasId,
            element: result.element
          });
        }
      }
    });

    socket.on("redo", (rawPayload) => {
      if (!socket.rateLimiter.consume(1)) {
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      const parseResult = redoSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        return socket.emit("error", { message: "Invalid redo payload" });
      }

      const { canvasId } = parseResult.data;
      const result = roomManager.redo(canvasId, socket.userId);
      if (result) {
        if (result.actionType === "add") {
          io.in(canvasId).emit("element:add", {
            canvasId,
            element: result.element
          });
        } else if (result.actionType === "remove") {
          io.in(canvasId).emit("element:remove", { canvasId, id: result.id });
        }
      }
    });

    socket.on("disconnect", async () => {
      if (socket.currentCanvasId) {
        const { isEmpty } = await roomManager.leaveSocket(
          socket.currentCanvasId,
          socket.id,
          socket.userId
        );
        if (!isEmpty) {
          socket.to(socket.currentCanvasId).emit("presence:leave", {
            canvasId: socket.currentCanvasId,
            userId: socket.userId
          });
        }
      }
    });
  });

  return { httpServer, io, roomManager };
}

async function startServer(customConfig) {
  const config = customConfig || loadConfig();
  const dbInfo = await connectDB(config);
  console.log(
    `Database connected: ${dbInfo.isMemory ? "in-memory mongodb" : dbInfo.uri}`
  );

  const app = createApp(config);
  const { httpServer, io, roomManager } = createServer(app, config);

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log("Graceful shutdown initiated...");
    await roomManager.flushAll();
    await disconnectDB();
    httpServer.close(() => {
      console.log("Server stopped successfully.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return new Promise((resolve) => {
    const serverInstance = httpServer.listen(config.PORT, () => {
      console.log(
        `Server listening on port ${config.PORT} (${config.NODE_ENV})`
      );
      resolve({ serverInstance, httpServer, io, roomManager, config });
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
