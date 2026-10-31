const express = require("express");
const { createUserController, registerSchema, loginSchema } = require("../controllers/userController");
const { validateBody } = require("../middlewares/validateMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");

function createUserRoutes(config, authMiddleware) {
  const router = express.Router();
  const userController = createUserController(config);

  router.post("/register", authLimiter, validateBody(registerSchema), userController.registerUser);
  router.post("/login", authLimiter, validateBody(loginSchema), userController.loginUser);
  router.get("/me", authMiddleware, userController.getUser);

  return router;
}

module.exports = { createUserRoutes };
