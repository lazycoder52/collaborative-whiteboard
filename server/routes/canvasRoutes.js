const express = require("express");
const {
  createCanvasController,
  createCanvasSchema,
  updateCanvasSchema,
  shareCanvasSchema,
  unshareCanvasSchema,
  idParamSchema
} = require("../controllers/canvasController");
const {
  validateBody,
  validateParams
} = require("../middlewares/validateMiddleware");

function createCanvasRoutes(authMiddleware) {
  const router = express.Router();
  const canvasController = createCanvasController();

  router.post(
    "/create",
    authMiddleware,
    validateBody(createCanvasSchema),
    canvasController.createCanvas
  );
  router.put(
    "/update",
    authMiddleware,
    validateBody(updateCanvasSchema),
    canvasController.updateCanvas
  );
  router.get(
    "/load/:id",
    authMiddleware,
    validateParams(idParamSchema),
    canvasController.loadCanvas
  );
  router.put(
    "/share/:id",
    authMiddleware,
    validateParams(idParamSchema),
    validateBody(shareCanvasSchema),
    canvasController.shareCanvas
  );
  router.put(
    "/unshare/:id",
    authMiddleware,
    validateParams(idParamSchema),
    validateBody(unshareCanvasSchema),
    canvasController.unshareCanvas
  );
  router.delete(
    "/delete/:id",
    authMiddleware,
    validateParams(idParamSchema),
    canvasController.deleteCanvas
  );
  router.get("/list", authMiddleware, canvasController.getUserCanvases);

  return router;
}

module.exports = { createCanvasRoutes };
