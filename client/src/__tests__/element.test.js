import {
  createElement,
  ensureRoughElement,
  getNumericSeed,
  getSvgPathFromStroke
} from "../utils/element";
import { TOOL_ITEMS } from "../constants";

describe("Client Element Utilities", () => {
  test("generates consistent positive numeric seed from string or numeric id", () => {
    const seed1 = getNumericSeed("elem-uuid-1234");
    const seed2 = getNumericSeed("elem-uuid-1234");
    const seedNum = getNumericSeed(42);

    expect(seed1).toBe(seed2);
    expect(seed1).toBeGreaterThan(0);
    expect(seedNum).toBe(43);
  });

  test("creates brush element with initial point", () => {
    const brush = createElement("b1", 10, 20, 10, 20, {
      type: TOOL_ITEMS.BRUSH,
      stroke: "#ff0000",
      size: 4
    });

    expect(brush.id).toBe("b1");
    expect(brush.type).toBe(TOOL_ITEMS.BRUSH);
    expect(brush.points).toEqual([{ x: 10, y: 20 }]);
    expect(brush.stroke).toBe("#ff0000");
  });

  test("creates rectangle element with roughEle generator", () => {
    const rect = createElement("r1", 0, 0, 100, 50, {
      type: TOOL_ITEMS.RECTANGLE,
      stroke: "#0000ff",
      fill: "#ffff00",
      size: 2
    });

    expect(rect.id).toBe("r1");
    expect(rect.type).toBe(TOOL_ITEMS.RECTANGLE);
    expect(rect.roughEle).toBeDefined();
    expect(rect.roughEle.shape).toBe("rectangle");
  });

  test("ensureRoughElement attaches roughEle to plain serialized shapes", () => {
    const plainShape = {
      id: "plain-1",
      type: TOOL_ITEMS.CIRCLE,
      x1: 10,
      y1: 10,
      x2: 60,
      y2: 60,
      stroke: "#000000"
    };

    const hydrated = ensureRoughElement(plainShape);
    expect(hydrated.roughEle).toBeDefined();
    expect(hydrated.roughEle.shape).toBe("ellipse");
  });

  test("generates valid SVG path data from stroke coordinates", () => {
    const strokePoints = [
      [10, 10],
      [20, 20],
      [30, 15]
    ];
    const path = getSvgPathFromStroke(strokePoints);
    expect(path).toContain("M 10 10");
    expect(path).toContain("Z");
  });
});

