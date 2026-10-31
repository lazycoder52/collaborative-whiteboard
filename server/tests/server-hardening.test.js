const request = require("supertest");
const mongoose = require("mongoose");
const { loadConfig } = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const { createApp } = require("../app");
const User = require("../models/userModel");

describe("Phase 1: Server Hardening and Structure", () => {
  let app;
  let testConfig;

  beforeAll(async () => {
    testConfig = loadConfig({
      NODE_ENV: "test",
      JWT_SECRET: "this_is_a_very_long_test_secret_key_at_least_32_characters",
      USE_MEMORY_DB: "true"
    });

    await connectDB(testConfig);
    app = createApp(testConfig);
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({});
    }
  });

  describe("Configuration & Environment", () => {
    test("rejects JWT_SECRET shorter than 32 characters", () => {
      expect(() => {
        loadConfig({
          JWT_SECRET: "short_secret"
        });
      }).toThrow(/JWT_SECRET is required and must be at least 32 characters long/);
    });

    test("loads defaults and parses CORS_ORIGINS as array", () => {
      const config = loadConfig({
        JWT_SECRET: "12345678901234567890123456789012",
        CORS_ORIGINS: "http://localhost:3000, https://myapp.example.com"
      });
      expect(config.PORT).toBe(5000);
      expect(config.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://myapp.example.com"]);
    });
  });

  describe("Health Check Endpoint", () => {
    test("GET /health returns 200 and status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("Authentication & Security", () => {
    test("registers a new user and hashes password", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ email: "test@example.com", password: "securepassword123" });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("User registered successfully");
      expect(res.body.userId).toBeDefined();

      const user = await User.findOne({ email: "test@example.com" });
      expect(user).toBeTruthy();
      expect(user.password).not.toBe("securepassword123");
    });

    test("rejects invalid registration payload", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ email: "not-an-email", password: "123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid request payload");
      expect(res.body.details).toHaveLength(2);
    });

    test("logs in registered user and returns JWT token", async () => {
      await request(app)
        .post("/api/users/register")
        .send({ email: "login@example.com", password: "password123" });

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "login@example.com", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test("rejects invalid login credentials", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "nobody@example.com", password: "wrongpassword" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid credentials");
    });

    test("protects /api/users/me with Bearer token", async () => {
      const regRes = await request(app)
        .post("/api/users/register")
        .send({ email: "me@example.com", password: "password123" });

      const loginRes = await request(app)
        .post("/api/users/login")
        .send({ email: "me@example.com", password: "password123" });

      const token = loginRes.body.token;

      // Without token
      const unauthRes = await request(app).get("/api/users/me");
      expect(unauthRes.status).toBe(401);

      // With token
      const authRes = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${token}`);

      expect(authRes.status).toBe(200);
      expect(authRes.body.email).toBe("me@example.com");
      expect(authRes.body.password).toBeUndefined();
    });
  });
});

