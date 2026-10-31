const { z } = require("zod");
require("dotenv").config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().optional().default(""),
  JWT_SECRET: z.string().min(32, { message: "JWT_SECRET is required and must be at least 32 characters long" }),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  USE_MEMORY_DB: z.preprocess((val) => {
    if (typeof val === "string") {
      return val.toLowerCase() === "true" || val === "1";
    }
    return val;
  }, z.boolean()).optional()
}).transform((data) => {
  const corsArray = data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isMemoryDb = data.USE_MEMORY_DB !== undefined
    ? data.USE_MEMORY_DB
    : (!data.MONGODB_URI && data.NODE_ENV !== "production");

  return {
    ...data,
    CORS_ORIGINS: corsArray,
    USE_MEMORY_DB: Boolean(isMemoryDb)
  };
});

function loadConfig(overrides = {}) {
  const merged = { ...process.env, ...overrides };
  const result = envSchema.safeParse(merged);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration validation error:\n${errorDetails}`);
  }

  return result.data;
}

module.exports = {
  loadConfig,
  envSchema
};
