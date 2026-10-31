const Canvas = require("../models/canvasModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const { z } = require("zod");

const createCanvasSchema = z.object({
  title: z.string().optional()
});

const updateCanvasSchema = z.object({
  canvasId: z.string().min(1, { message: "canvasId is required" }),
  elements: z.array(z.any()).default([])
});

const shareCanvasSchema = z.object({
  email: z.string().email({ message: "Valid email is required" })
});

const unshareCanvasSchema = z.object({
  userIdToRemove: z.string().min(1, { message: "userIdToRemove is required" })
});

const idParamSchema = z.object({
  id: z.string().min(1, { message: "Canvas ID is required" })
});

function createCanvasController() {
  const createCanvas = async (req, res) => {
    try {
      const userId = req.userId;
      const title = req.body?.title || "Untitled Canvas";

      const newCanvas = new Canvas({
        title,
        owner: userId,
        shared: [],
        elements: []
      });

      await newCanvas.save();
      return res.status(201).json({
        message: "Canvas created successfully",
        canvasId: newCanvas._id,
        canvas: newCanvas
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to create canvas", details: error.message });
    }
  };

  const updateCanvas = async (req, res) => {
    try {
      const { canvasId, elements } = req.body;
      const userId = req.userId;

      if (!mongoose.Types.ObjectId.isValid(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }

      const isOwner = String(canvas.owner) === String(userId);
      const isShared = canvas.shared.some(
        (id) => String(id) === String(userId)
      );
      if (!isOwner && !isShared) {
        return res
          .status(403)
          .json({ error: "Unauthorized to update this canvas" });
      }

      canvas.elements = elements;
      canvas.updatedAt = new Date();
      await canvas.save();

      return res.json({ message: "Canvas updated successfully" });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to update canvas", details: error.message });
    }
  };

  const loadCanvas = async (req, res) => {
    try {
      const canvasId = req.params.id;
      const userId = req.userId;

      if (!mongoose.Types.ObjectId.isValid(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }

      const isOwner = String(canvas.owner) === String(userId);
      const isShared = canvas.shared.some(
        (id) => String(id) === String(userId)
      );
      if (!isOwner && !isShared) {
        return res
          .status(403)
          .json({ error: "Unauthorized to access this canvas" });
      }

      return res.json(canvas);
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to load canvas", details: error.message });
    }
  };

  const shareCanvas = async (req, res) => {
    try {
      const { email } = req.body;
      const canvasId = req.params.id;
      const userId = req.userId;

      if (!mongoose.Types.ObjectId.isValid(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }

      const userToShare = await User.findOne({ email });
      if (!userToShare) {
        return res
          .status(404)
          .json({ error: "User with this email not found" });
      }

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }

      if (String(canvas.owner) !== String(userId)) {
        return res
          .status(403)
          .json({ error: "Only the owner can share this canvas" });
      }

      if (String(canvas.owner) === String(userToShare._id)) {
        return res
          .status(400)
          .json({ error: "Owner cannot be added to shared list" });
      }

      const alreadyShared = canvas.shared.some(
        (id) => String(id) === String(userToShare._id)
      );
      if (alreadyShared) {
        return res.status(400).json({ error: "Already shared with user" });
      }

      canvas.shared.push(userToShare._id);
      await canvas.save();

      return res.json({ message: "Canvas shared successfully" });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to share canvas", details: error.message });
    }
  };

  const unshareCanvas = async (req, res) => {
    try {
      const { userIdToRemove } = req.body;
      const canvasId = req.params.id;
      const userId = req.userId;

      if (!mongoose.Types.ObjectId.isValid(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }

      if (String(canvas.owner) !== String(userId)) {
        return res
          .status(403)
          .json({ error: "Only the owner can unshare this canvas" });
      }

      canvas.shared = canvas.shared.filter(
        (id) => String(id) !== String(userIdToRemove)
      );
      await canvas.save();

      return res.json({ message: "Canvas unshared successfully" });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to unshare canvas", details: error.message });
    }
  };

  const deleteCanvas = async (req, res) => {
    try {
      const canvasId = req.params.id;
      const userId = req.userId;

      if (!mongoose.Types.ObjectId.isValid(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }

      if (String(canvas.owner) !== String(userId)) {
        return res
          .status(403)
          .json({ error: "Only the owner can delete this canvas" });
      }

      await Canvas.findByIdAndDelete(canvasId);
      return res.json({ message: "Canvas deleted successfully" });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to delete canvas", details: error.message });
    }
  };

  const getUserCanvases = async (req, res) => {
    try {
      const userId = req.userId;
      const canvases = await Canvas.find({
        $or: [{ owner: userId }, { shared: userId }]
      }).sort({ updatedAt: -1, createdAt: -1 });

      return res.json(canvases);
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to fetch canvases", details: error.message });
    }
  };

  return {
    createCanvas,
    updateCanvas,
    loadCanvas,
    shareCanvas,
    unshareCanvas,
    deleteCanvas,
    getUserCanvases
  };
}

module.exports = {
  createCanvasController,
  createCanvasSchema,
  updateCanvasSchema,
  shareCanvasSchema,
  unshareCanvasSchema,
  idParamSchema
};
