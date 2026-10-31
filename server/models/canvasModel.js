const mongoose = require("mongoose");

const canvasSchema = new mongoose.Schema({
  title: {
    type: String,
    default: "Untitled Canvas",
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  shared: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  elements: [
    {
      type: mongoose.Schema.Types.Mixed
    }
  ],
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Canvas", canvasSchema);
