import { ARROW_LENGTH, TOOL_ITEMS } from "../constants";
import getStroke from "perfect-freehand";
import rough from "roughjs";
import { getArrowHeadsCoordinates, isPointCloseToLine } from "./math";

const gen = rough.generator();

export function getNumericSeed(id) {
  if (typeof id === "number" && !isNaN(id)) return Math.abs(id) + 1;
  let hash = 0;
  const str = String(id || "1");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

export const ensureRoughElement = (element) => {
  if (!element || element.roughEle) return element;
  const { id, x1, y1, x2, y2, type, stroke, fill, size } = element;
  const options = {
    seed: getNumericSeed(id),
    fillStyle: "solid",
    ...(stroke && { stroke }),
    ...(fill && { fill }),
    ...(size && { strokeWidth: size })
  };

  const copy = { ...element };
  switch (type) {
    case TOOL_ITEMS.LINE:
      copy.roughEle = gen.line(x1, y1, x2, y2, options);
      break;
    case TOOL_ITEMS.RECTANGLE:
      copy.roughEle = gen.rectangle(x1, y1, x2 - x1, y2 - y1, options);
      break;
    case TOOL_ITEMS.CIRCLE: {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const width = x2 - x1;
      const height = y2 - y1;
      copy.roughEle = gen.ellipse(cx, cy, width, height, options);
      break;
    }
    case TOOL_ITEMS.ARROW: {
      const { x3, y3, x4, y4 } = getArrowHeadsCoordinates(
        x1,
        y1,
        x2,
        y2,
        ARROW_LENGTH
      );
      const points = [
        [x1, y1],
        [x2, y2],
        [x3, y3],
        [x2, y2],
        [x4, y4]
      ];
      copy.roughEle = gen.linearPath(points, options);
      break;
    }
    default:
      break;
  }
  return copy;
};

export const createElement = (
  id,
  x1,
  y1,
  x2,
  y2,
  { type, stroke, fill, size }
) => {
  const elementId = id !== undefined && id !== null ? id : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const element = {
    id: elementId,
    x1,
    y1,
    x2,
    y2,
    type,
    fill,
    stroke,
    size
  };
  const options = {
    seed: getNumericSeed(elementId),
    fillStyle: "solid",
    ...(stroke && { stroke }),
    ...(fill && { fill }),
    ...(size && { strokeWidth: size })
  };

  switch (type) {
    case TOOL_ITEMS.BRUSH: {
      return {
        id: elementId,
        points: [{ x: x1, y: y1 }],
        type,
        stroke,
        size
      };
    }
    case TOOL_ITEMS.LINE:
      element.roughEle = gen.line(x1, y1, x2, y2, options);
      return element;
    case TOOL_ITEMS.RECTANGLE:
      element.roughEle = gen.rectangle(x1, y1, x2 - x1, y2 - y1, options);
      return element;
    case TOOL_ITEMS.CIRCLE: {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const width = x2 - x1;
      const height = y2 - y1;
      element.roughEle = gen.ellipse(cx, cy, width, height, options);
      return element;
    }
    case TOOL_ITEMS.ARROW: {
      const { x3, y3, x4, y4 } = getArrowHeadsCoordinates(
        x1,
        y1,
        x2,
        y2,
        ARROW_LENGTH
      );
      const points = [
        [x1, y1],
        [x2, y2],
        [x3, y3],
        [x2, y2],
        [x4, y4]
      ];
      element.roughEle = gen.linearPath(points, options);
      return element;
    }
    case TOOL_ITEMS.TEXT:
      element.text = "";
      return element;
    default:
      throw new Error(`Type ${type} not recognized`);
  }
};

export const isPointNearElement = (element, pointX, pointY) => {
  const { x1, y1, x2, y2, type } = element;
  const canvas = document.getElementById("canvas");
  if (!canvas) return false;
  const context = canvas.getContext("2d");

  switch (type) {
    case TOOL_ITEMS.LINE:
    case TOOL_ITEMS.ARROW:
      return isPointCloseToLine(x1, y1, x2, y2, pointX, pointY);
    case TOOL_ITEMS.RECTANGLE:
    case TOOL_ITEMS.CIRCLE:
      return (
        isPointCloseToLine(x1, y1, x2, y1, pointX, pointY) ||
        isPointCloseToLine(x2, y1, x2, y2, pointX, pointY) ||
        isPointCloseToLine(x2, y2, x1, y2, pointX, pointY) ||
        isPointCloseToLine(x1, y2, x1, y1, pointX, pointY)
      );
    case TOOL_ITEMS.BRUSH: {
      if (!element.points || !element.points.length) return false;
      const elPath = new Path2D(getSvgPathFromStroke(getStroke(element.points)));
      return context.isPointInPath(elPath, pointX, pointY);
    }
    case TOOL_ITEMS.TEXT: {
      context.font = `${element.size}px Caveat`;
      context.fillStyle = element.stroke;
      const textWidth = context.measureText(element.text || "").width;
      const textHeight = parseInt(element.size, 10) || 16;
      return (
        isPointCloseToLine(x1, y1, x1 + textWidth, y1, pointX, pointY) ||
        isPointCloseToLine(
          x1 + textWidth,
          y1,
          x1 + textWidth,
          y1 + textHeight,
          pointX,
          pointY
        ) ||
        isPointCloseToLine(
          x1 + textWidth,
          y1 + textHeight,
          x1,
          y1 + textHeight,
          pointX,
          pointY
        ) ||
        isPointCloseToLine(x1, y1 + textHeight, x1, y1, pointX, pointY)
      );
    }
    default:
      return false;
  }
};

export const getSvgPathFromStroke = (stroke) => {
  if (!stroke || !stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );

  d.push("Z");
  return d.join(" ");
};
