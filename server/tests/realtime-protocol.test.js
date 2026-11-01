const { io: Client } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { loadConfig } = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const { createApp } = require("../app");
const { createServer } = require("../server");
const User = require("../models/userModel");
const Canvas = require("../models/canvasModel");

describe("Phase 2: Real-time Protocol Rework", () => {
  let httpServer;
  let io;
  let roomManager;
  let port;
  let testConfig;

  let user1, user2, user3;
  let token1, token2, token3;
  let canvas1, canvas2;

  beforeAll(async () => {
    testConfig = loadConfig({
      NODE_ENV: "test",
      JWT_SECRET: "this_is_a_very_long_test_secret_key_at_least_32_characters",
      USE_MEMORY_DB: "true"
    });

    await connectDB(testConfig);
    const app = createApp(testConfig);
    const serverObj = createServer(app, testConfig);
    httpServer = serverObj.httpServer;
    io = serverObj.io;
    roomManager = serverObj.roomManager;

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Create test users
    user1 = await User.create({
      email: "user1@example.com",
      password: "password123"
    });
    user2 = await User.create({
      email: "user2@example.com",
      password: "password123"
    });
    user3 = await User.create({
      email: "user3@example.com",
      password: "password123"
    });

    token1 = jwt.sign({ userId: user1._id }, testConfig.JWT_SECRET);
    token2 = jwt.sign({ userId: user2._id }, testConfig.JWT_SECRET);
    token3 = jwt.sign({ userId: user3._id }, testConfig.JWT_SECRET);

    // canvas1: owned by user1, shared with user2
    canvas1 = await Canvas.create({
      title: "Shared Canvas",
      owner: user1._id,
      shared: [user2._id],
      elements: []
    });

    // canvas2: owned by user3, private
    canvas2 = await Canvas.create({
      title: "Private Canvas",
      owner: user3._id,
      shared: [],
      elements: []
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
    await disconnectDB();
  });

  function createClient(token) {
    return Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"]
    });
  }

  test("rejects unauthenticated socket connection", async () => {
    const client = Client(`http://localhost:${port}`, {
      transports: ["websocket"]
    });

    await new Promise((resolve) => {
      client.on("connect_error", (err) => {
        expect(err.message).toMatch(/Authentication error/);
        client.disconnect();
        resolve();
      });
    });
  });

  test("rejects unauthorized canvas join (user3 accessing canvas1)", async () => {
    const client = createClient(token3);

    await new Promise((resolve) => {
      client.on("connect", () => {
        client.emit("joinCanvas", { canvasId: String(canvas1._id) });
      });

      client.on("unauthorized", (data) => {
        expect(data.message).toMatch(/not authorized/);
        client.disconnect();
        resolve();
      });
    });
  });

  test("two clients in same room receive deltas while client in another room does not", async () => {
    const c1 = createClient(token1);
    const c2 = createClient(token2);
    const c3 = createClient(token3);

    await Promise.all([
      new Promise((r) => c1.on("connect", r)),
      new Promise((r) => c2.on("connect", r)),
      new Promise((r) => c3.on("connect", r))
    ]);

    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    c2.emit("joinCanvas", { canvasId: String(canvas1._id) });
    c3.emit("joinCanvas", { canvasId: String(canvas2._id) });

    await new Promise((r) => setTimeout(r, 100));

    const c2ReceivedDeltas = [];
    const c3ReceivedDeltas = [];

    c2.on("element:add", (data) => c2ReceivedDeltas.push(data));
    c3.on("element:add", (data) => c3ReceivedDeltas.push(data));

    const testElement = {
      id: "elem-100",
      type: "LINE",
      x1: 10,
      y1: 10,
      x2: 100,
      y2: 100,
      stroke: "#000000"
    };

    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: testElement
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(c2ReceivedDeltas.length).toBe(1);
    expect(c2ReceivedDeltas[0].element.id).toBe("elem-100");
    expect(c3ReceivedDeltas.length).toBe(0);

    c1.disconnect();
    c2.disconnect();
    c3.disconnect();
  });

  test("late joiner receives full canvas state via canvas:load", async () => {
    const cLate = createClient(token2);

    const received = await new Promise((resolve) => {
      cLate.on("connect", () => {
        cLate.emit("joinCanvas", { canvasId: String(canvas1._id) });
      });

      cLate.on("canvas:load", (data) => {
        resolve(data);
      });
    });

    expect(received.canvasId).toBe(String(canvas1._id));
    expect(received.elements.some((el) => el.id === "elem-100")).toBe(true);

    cLate.disconnect();
  });

  test("element:update appends points with sequence numbers and rejects out-of-order sequence with resync", async () => {
    const c1 = createClient(token1);
    const c2 = createClient(token2);

    await Promise.all([
      new Promise((r) => c1.on("connect", r)),
      new Promise((r) => c2.on("connect", r))
    ]);

    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    c2.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    // 1. Initial element:add
    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: "stroke-seq-test",
        type: "BRUSH",
        points: [{ x: 10, y: 10 }]
      }
    });
    await new Promise((r) => setTimeout(r, 100));

    // 2. Client 1 sends sequence 1
    let c2ReceivedUpdate = null;
    c2.on("element:update", (data) => {
      c2ReceivedUpdate = data;
    });

    const ack1 = await new Promise((resolve) => {
      c1.emit(
        "element:update",
        {
          canvasId: String(canvas1._id),
          id: "stroke-seq-test",
          seq: 1,
          points: [
            { x: 12, y: 12 },
            { x: 14, y: 14 }
          ]
        },
        resolve
      );
    });

    expect(ack1.success).toBe(true);
    expect(ack1.seq).toBe(1);
    await new Promise((r) => setTimeout(r, 100));

    expect(c2ReceivedUpdate).toBeTruthy();
    expect(c2ReceivedUpdate.id).toBe("stroke-seq-test");
    expect(c2ReceivedUpdate.seq).toBe(1);
    expect(c2ReceivedUpdate.points).toHaveLength(2);

    // 3. Client 1 sends out-of-order sequence (seq: 5 instead of 2)
    let resyncEvent = null;
    c1.on("canvas:load", (data) => {
      if (data.resync) {
        resyncEvent = data;
      }
    });

    const ackOutOfOrder = await new Promise((resolve) => {
      c1.emit(
        "element:update",
        {
          canvasId: String(canvas1._id),
          id: "stroke-seq-test",
          seq: 5,
          points: [{ x: 50, y: 50 }]
        },
        resolve
      );
    });

    expect(ackOutOfOrder.success).toBe(false);
    expect(ackOutOfOrder.resync).toBe(true);
    expect(ackOutOfOrder.expectedSeq).toBe(2);

    await new Promise((r) => setTimeout(r, 100));
    expect(resyncEvent).toBeTruthy();
    expect(resyncEvent.resync).toBe(true);
    expect(resyncEvent.elementId).toBe("stroke-seq-test");
    expect(resyncEvent.elements[0].points).toHaveLength(3);

    c1.disconnect();
    c2.disconnect();
  });

  test("late joiner mid-stroke receives the full partial stroke via canvas:load", async () => {
    const cArtist = createClient(token1);
    await new Promise((r) => cArtist.on("connect", r));
    cArtist.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    const strokeId = "mid-stroke-elem-001";
    cArtist.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: strokeId,
        type: "BRUSH",
        points: [{ x: 100, y: 100 }]
      }
    });
    await new Promise((r) => setTimeout(r, 50));

    const batch1 = Array.from({ length: 10 }, (_, i) => ({
      x: 101 + i,
      y: 100
    }));
    const batch2 = Array.from({ length: 10 }, (_, i) => ({
      x: 111 + i,
      y: 100
    }));
    const batch3 = Array.from({ length: 10 }, (_, i) => ({
      x: 121 + i,
      y: 100
    }));

    await new Promise((r) =>
      cArtist.emit(
        "element:update",
        { canvasId: String(canvas1._id), id: strokeId, seq: 1, points: batch1 },
        r
      )
    );
    await new Promise((r) =>
      cArtist.emit(
        "element:update",
        { canvasId: String(canvas1._id), id: strokeId, seq: 2, points: batch2 },
        r
      )
    );
    await new Promise((r) =>
      cArtist.emit(
        "element:update",
        { canvasId: String(canvas1._id), id: strokeId, seq: 3, points: batch3 },
        r
      )
    );

    const cLate = createClient(token2);
    const canvasLoadData = await new Promise((resolve) => {
      cLate.on("connect", () => {
        cLate.emit("joinCanvas", { canvasId: String(canvas1._id) });
      });
      cLate.on("canvas:load", resolve);
    });

    const midStroke = canvasLoadData.elements.find((el) => el.id === strokeId);
    expect(midStroke).toBeTruthy();
    expect(midStroke.points).toHaveLength(31);
    expect(midStroke.lastSeq).toBe(3);

    cArtist.disconnect();
    cLate.disconnect();
  });

  test("server cumulatively enforces 5000-point limit per element", async () => {
    const c1 = createClient(token1);
    await new Promise((r) => c1.on("connect", r));
    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    const elementId = "limit-test-elem";
    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: elementId,
        type: "BRUSH",
        points: Array.from({ length: 4900 }, (_, i) => ({ x: i, y: i }))
      }
    });
    await new Promise((r) => setTimeout(r, 100));

    let errorReceived = null;
    c1.on("error", (err) => {
      errorReceived = err;
    });

    const ack = await new Promise((resolve) => {
      c1.emit(
        "element:update",
        {
          canvasId: String(canvas1._id),
          id: elementId,
          seq: 1,
          points: Array.from({ length: 200 }, (_, i) => ({
            x: 5000 + i,
            y: 5000 + i
          }))
        },
        resolve
      );
    });

    expect(ack.success).toBe(false);
    expect(ack.error).toMatch(/exceeds maximum limit of 5000/);
    expect(errorReceived.message).toMatch(/exceeds maximum limit of 5000/);

    c1.disconnect();
  });

  test("server-side per-user undo/redo only affects requesting user's elements", async () => {
    const c1 = createClient(token1);
    const c2 = createClient(token2);

    await Promise.all([
      new Promise((r) => c1.on("connect", r)),
      new Promise((r) => c2.on("connect", r))
    ]);

    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    c2.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    // User 1 adds elem-u1
    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: "elem-u1",
        type: "RECTANGLE",
        x1: 0,
        y1: 0,
        x2: 20,
        y2: 20
      }
    });

    // User 2 adds elem-u2
    c2.emit("element:add", {
      canvasId: String(canvas1._id),
      element: { id: "elem-u2", type: "CIRCLE", x1: 50, y1: 50, x2: 80, y2: 80 }
    });

    await new Promise((r) => setTimeout(r, 150));

    let removedId = null;
    c2.on("element:remove", (data) => {
      removedId = data.id;
    });

    // User 1 triggers undo -> should remove elem-u1, NOT elem-u2
    c1.emit("undo", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 150));

    expect(removedId).toBe("elem-u1");

    // Elements check: elem-u2 should still exist
    const currentElements = roomManager.getElements(String(canvas1._id));
    expect(currentElements.some((e) => e.id === "elem-u1")).toBe(false);
    expect(currentElements.some((e) => e.id === "elem-u2")).toBe(true);

    // User 1 triggers redo -> should re-add elem-u1
    let readdedElem = null;
    c2.on("element:add", (data) => {
      readdedElem = data.element;
    });

    c1.emit("redo", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 150));

    expect(readdedElem).toBeTruthy();
    expect(readdedElem.id).toBe("elem-u1");

    c1.disconnect();
    c2.disconnect();
  });

  test("debounced persistence flushes to database and evicts empty room on disconnect", async () => {
    const c1 = createClient(token1);
    await new Promise((r) => c1.on("connect", r));

    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: "elem-persistent",
        type: "LINE",
        x1: 1,
        y1: 1,
        x2: 2,
        y2: 2
      }
    });

    await new Promise((r) => setTimeout(r, 100));

    // Room is active in memory
    expect(roomManager.getRoom(String(canvas1._id))).toBeTruthy();

    // Disconnect last socket
    c1.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // Room should be evicted from memory after flushing
    expect(roomManager.getRoom(String(canvas1._id))).toBeUndefined();

    // Data should be saved in MongoDB
    const savedDoc = await Canvas.findById(canvas1._id);
    expect(savedDoc.elements.some((e) => e.id === "elem-persistent")).toBe(
      true
    );
  });

  test("debounced persistence: data survives a server restart", async () => {
    // 1. Client connects to server, joins canvas1, adds element
    const c1 = createClient(token1);
    await new Promise((r) => c1.on("connect", r));
    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: {
        id: "elem-survive-restart",
        type: "RECTANGLE",
        x1: 5,
        y1: 5,
        x2: 45,
        y2: 45
      }
    });

    await new Promise((r) => setTimeout(r, 100));
    c1.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // 2. Stop current HTTP server
    await new Promise((resolve) => httpServer.close(resolve));

    // 3. Start a completely new server instance pointing to the same database
    const app2 = createApp(testConfig);
    const newServerObj = createServer(app2, testConfig);
    httpServer = newServerObj.httpServer;
    io = newServerObj.io;
    roomManager = newServerObj.roomManager;

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 4. Late joiner connects to the new server and verifies element survived
    const cRestartJoiner = createClient(token2);
    const received = await new Promise((resolve) => {
      cRestartJoiner.on("connect", () => {
        cRestartJoiner.emit("joinCanvas", { canvasId: String(canvas1._id) });
      });
      cRestartJoiner.on("canvas:load", resolve);
    });

    expect(received.elements.some((e) => e.id === "elem-survive-restart")).toBe(
      true
    );
    cRestartJoiner.disconnect();
  });

  test("rejects element with points exceeding limit", async () => {
    const c1 = createClient(token1);
    await new Promise((r) => c1.on("connect", r));
    c1.emit("joinCanvas", { canvasId: String(canvas1._id) });
    await new Promise((r) => setTimeout(r, 100));

    const tooManyPoints = Array.from({ length: 5001 }, (_, i) => ({
      x: i,
      y: i
    }));

    const errorPromise = new Promise((resolve) => {
      c1.on("error", (data) => resolve(data));
    });

    c1.emit("element:add", {
      canvasId: String(canvas1._id),
      element: { id: "oversize-stroke", type: "BRUSH", points: tooManyPoints }
    });

    const error = await errorPromise;
    expect(error.message).toMatch(/Invalid element:add payload/);

    c1.disconnect();
  });
});
