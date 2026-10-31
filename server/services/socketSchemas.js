const { z } = require("zod");

const MAX_POINTS_PER_ELEMENT = 5000;

const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const elementSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  stroke: z.string().optional(),
  fill: z.string().optional().nullable(),
  size: z.number().optional(),
  text: z.string().optional(),
  points: z.array(pointSchema).max(MAX_POINTS_PER_ELEMENT, {
    message: `Points array exceeds maximum limit of ${MAX_POINTS_PER_ELEMENT}`
  }).optional(),
  roughEle: z.any().optional(),
  userId: z.string().optional()
}).passthrough();

const joinCanvasSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" })
});

const elementAddSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" }),
  element: elementSchema
});

const elementUpdateSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" }),
  id: z.union([z.string(), z.number()]),
  patch: z.object({
    points: z.array(pointSchema).max(MAX_POINTS_PER_ELEMENT).optional(),
    x1: z.number().optional(),
    y1: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    stroke: z.string().optional(),
    fill: z.string().optional().nullable(),
    size: z.number().optional(),
    text: z.string().optional()
  }).passthrough()
});

const elementRemoveSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" }),
  id: z.union([z.string(), z.number()])
});

const undoSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" })
});

const redoSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" })
});

module.exports = {
  MAX_POINTS_PER_ELEMENT,
  joinCanvasSchema,
  elementAddSchema,
  elementUpdateSchema,
  elementRemoveSchema,
  undoSchema,
  redoSchema
};

