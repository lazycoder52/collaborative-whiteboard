const fs = require("fs");
const path = require("path");

function runBenchmark() {
  const TOTAL_POINTS = 200;
  const CANVAS_ID = "000000000000000000000001";
  const ELEMENT_ID = "elem-benchmark-uuid-001";

  // Generate synthetic 200-point freehand stroke
  const points = Array.from({ length: TOTAL_POINTS }, (_, i) => ({
    x: Math.round(10 + i * 2.5),
    y: Math.round(50 + Math.sin(i / 8) * 30)
  }));

  // -------------------------------------------------------------
  // 1. Monolithic Full-Array Behaviour (Legacy)
  // -------------------------------------------------------------
  // In the legacy architecture:
  // - Every mousemove event emitted `drawingUpdate` with the full `elements` array.
  // - The server immediately invoked `Canvas.findByIdAndUpdate` on EVERY event.
  let legacyBytes = 0;
  let legacyWrites = 0;
  let legacyEvents = 0;

  for (let i = 1; i <= TOTAL_POINTS; i++) {
    const currentPoints = points.slice(0, i);
    const payload = {
      canvasId: CANVAS_ID,
      elements: [
        {
          id: ELEMENT_ID,
          type: "BRUSH",
          points: currentPoints,
          stroke: "#000000",
          size: 3
        }
      ]
    };
    const jsonStr = JSON.stringify(payload);
    legacyBytes += Buffer.byteLength(jsonStr, "utf8");
    legacyWrites += 1; // Server did findByIdAndUpdate on every mouse move
    legacyEvents += 1;
  }

  // -------------------------------------------------------------
  // 2. Granular Delta Protocol (Hardened Architecture)
  // -------------------------------------------------------------
  // In the hardened architecture:
  // - Initial mousedown emits a single `element:add` with the initial point.
  // - Points are throttled at ~50ms intervals. At 60Hz sampling (~16.6ms/point),
  //   200 points take ~3.3 seconds, producing ~66 throttled batches.
  // - Each batch emits `element:update` containing `{ canvasId, id, patch }`.
  // - MongoDB persistence is debounced at 2 seconds in memory, resulting in 1
  //   final write after stroke completion.
  let deltaBytes = 0;
  let deltaEvents = 0;

  // Initial element:add
  const initialElement = {
    id: ELEMENT_ID,
    type: "BRUSH",
    points: [points[0]],
    stroke: "#000000",
    size: 3
  };
  const addPayload = {
    canvasId: CANVAS_ID,
    element: initialElement
  };
  deltaBytes += Buffer.byteLength(JSON.stringify(addPayload), "utf8");
  deltaEvents += 1;

  // Throttled point batches (3 points per ~50ms batch on 60Hz input)
  const POINTS_PER_BATCH = 3;
  for (let i = 1; i < TOTAL_POINTS; i += POINTS_PER_BATCH) {
    const batchEnd = Math.min(i + POINTS_PER_BATCH, TOTAL_POINTS);
    const currentPoints = points.slice(0, batchEnd);
    const updatePayload = {
      canvasId: CANVAS_ID,
      id: ELEMENT_ID,
      patch: {
        points: currentPoints
      }
    };
    deltaBytes += Buffer.byteLength(JSON.stringify(updatePayload), "utf8");
    deltaEvents += 1;
  }

  // Final mouseup flush
  const finalUpdatePayload = {
    canvasId: CANVAS_ID,
    id: ELEMENT_ID,
    patch: { points }
  };
  deltaBytes += Buffer.byteLength(JSON.stringify(finalUpdatePayload), "utf8");
  deltaEvents += 1;

  const deltaWrites = 1; // Debounced 2s persistence yields 1 database write

  const bytesReductionPercent = ((1 - deltaBytes / legacyBytes) * 100).toFixed(2);
  const writesReductionPercent = ((1 - deltaWrites / legacyWrites) * 100).toFixed(2);
  const eventsReductionPercent = ((1 - deltaEvents / legacyEvents) * 100).toFixed(2);

  const results = {
    benchmark: "Synthetic 200-point freehand stroke benchmark",
    points: TOTAL_POINTS,
    timestamp: new Date().toISOString(),
    monolithicFullArray: {
      eventCount: legacyEvents,
      totalBytesSent: legacyBytes,
      databaseWrites: legacyWrites,
      description: "Full elements array transmitted and written to MongoDB on every single mousemove event"
    },
    granularDeltaProtocol: {
      eventCount: deltaEvents,
      totalBytesSent: deltaBytes,
      databaseWrites: deltaWrites,
      description: "One element:add event, throttled element:update batches (50ms interval), and debounced database persistence (2s window)"
    },
    reduction: {
      bytesReductionPercent: `${bytesReductionPercent}%`,
      databaseWritesReductionPercent: `${writesReductionPercent}%`,
      eventCountReductionPercent: `${eventsReductionPercent}%`
    }
  };

  const metricsDir = path.join(__dirname, "..", "metrics");
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const outputPath = path.join(metricsDir, "protocol.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");

  console.log("Benchmark complete. Results written to metrics/protocol.json:");
  console.log(JSON.stringify(results, null, 2));

  return results;
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark };
