const fs = require("fs");
const path = require("path");
const { runBenchmark } = require("../../scripts/measure-protocol");

describe("Synthetic Protocol Benchmark Metrics Verification", () => {
  test("metrics/protocol.json exists and figures match benchmark simulation exactly", () => {
    const metricsPath = path.join(
      __dirname,
      "..",
      "..",
      "metrics",
      "protocol.json"
    );
    expect(fs.existsSync(metricsPath)).toBe(true);

    const savedMetrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
    const freshRun = runBenchmark();

    expect(savedMetrics.points).toBe(200);
    expect(savedMetrics.monolithicFullArray.eventCount).toBe(200);
    expect(savedMetrics.monolithicFullArray.databaseWrites).toBe(200);
    expect(savedMetrics.monolithicFullArray.totalBytesSent).toBe(
      freshRun.monolithicFullArray.totalBytesSent
    );

    expect(savedMetrics.granularDeltaProtocol.eventCount).toBe(
      freshRun.granularDeltaProtocol.eventCount
    );
    expect(savedMetrics.granularDeltaProtocol.databaseWrites).toBe(1);
    expect(savedMetrics.granularDeltaProtocol.totalBytesSent).toBe(
      freshRun.granularDeltaProtocol.totalBytesSent
    );

    expect(savedMetrics.reduction.databaseWritesReductionPercent).toBe(
      "99.50%"
    );
    expect(savedMetrics.reduction.bytesReductionPercent).toBe(
      freshRun.reduction.bytesReductionPercent
    );
  });

  test("README.md benchmark table figures match metrics/protocol.json", () => {
    const readmePath = path.join(__dirname, "..", "..", "README.md");
    const readmeContent = fs.readFileSync(readmePath, "utf8");
    const metricsPath = path.join(
      __dirname,
      "..",
      "..",
      "metrics",
      "protocol.json"
    );
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));

    expect(readmeContent).toContain(
      `${metrics.granularDeltaProtocol.eventCount} emissions`
    );
    expect(readmeContent).toContain(
      `${metrics.reduction.eventCountReductionPercent} reduction`
    );
    expect(readmeContent).toContain(
      `${metrics.reduction.bytesReductionPercent} reduction`
    );
    expect(readmeContent).toContain(
      `${metrics.reduction.databaseWritesReductionPercent} reduction`
    );
  });
});
