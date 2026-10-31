const Canvas = require("../models/canvasModel");
const mongoose = require("mongoose");

class CanvasRoomManager {
  constructor(debounceMs = 2000) {
    this.rooms = new Map();
    this.debounceMs = debounceMs;
  }

  getRoom(canvasId) {
    return this.rooms.get(String(canvasId));
  }

  async loadOrCreateRoom(canvasId) {
    const id = String(canvasId);
    let room = this.rooms.get(id);
    if (!room) {
      let elements = [];
      if (mongoose.Types.ObjectId.isValid(id)) {
        const canvasDoc = await Canvas.findById(id).lean();
        if (canvasDoc && Array.isArray(canvasDoc.elements)) {
          elements = canvasDoc.elements;
        }
      }

      room = {
        canvasId: id,
        elements: new Map(elements.map((el) => [String(el.id), el])),
        elementOrder: elements.map((el) => String(el.id)),
        undoStacks: new Map(), // userId -> [{ type, element }]
        redoStacks: new Map(), // userId -> [{ type, element }]
        sockets: new Set(),
        users: new Map(), // userId -> count
        debounceTimer: null,
        isDirty: false
      };
      this.rooms.set(id, room);
    }
    return room;
  }

  joinSocket(room, socketId, userId) {
    room.sockets.add(socketId);
    const currentCount = room.users.get(String(userId)) || 0;
    room.users.set(String(userId), currentCount + 1);

    if (!room.undoStacks.has(String(userId))) {
      room.undoStacks.set(String(userId), []);
      room.redoStacks.set(String(userId), []);
    }
  }

  async leaveSocket(canvasId, socketId, userId) {
    const id = String(canvasId);
    const room = this.rooms.get(id);
    if (!room) return { isEmpty: true, userLeft: true };

    room.sockets.delete(socketId);
    const userCount = room.users.get(String(userId)) || 1;
    if (userCount <= 1) {
      room.users.delete(String(userId));
    } else {
      room.users.set(String(userId), userCount - 1);
    }

    if (room.sockets.size === 0) {
      await this.flushRoom(id);
      this.evictRoom(id);
      return { isEmpty: true, userLeft: true };
    }

    return { isEmpty: false, userLeft: userCount <= 1 };
  }

  addElement(canvasId, element, userId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return null;

    const elId = String(element.id);
    const enriched = {
      ...element,
      id: element.id,
      userId: String(userId),
      updatedAt: Date.now()
    };

    if (!room.elements.has(elId)) {
      room.elementOrder.push(elId);
    }
    room.elements.set(elId, enriched);

    const userUndo = room.undoStacks.get(String(userId)) || [];
    userUndo.push({ type: "add", element: enriched });
    room.undoStacks.set(String(userId), userUndo);

    // Clear redo stack on new action
    room.redoStacks.set(String(userId), []);

    this.markDirty(room);
    return enriched;
  }

  updateElement(canvasId, elementId, patch, userId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return null;

    const elId = String(elementId);
    const existing = room.elements.get(elId);
    if (!existing) return null;

    let updated;
    if (patch.points && Array.isArray(patch.points)) {
      const mergedPoints = patch.points;
      updated = {
        ...existing,
        ...patch,
        points: mergedPoints,
        updatedAt: Date.now()
      };
    } else {
      updated = {
        ...existing,
        ...patch,
        updatedAt: Date.now()
      };
    }

    room.elements.set(elId, updated);
    this.markDirty(room);
    return updated;
  }

  removeElement(canvasId, elementId, userId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return null;

    const elId = String(elementId);
    const existing = room.elements.get(elId);
    if (!existing) return null;

    room.elements.delete(elId);
    room.elementOrder = room.elementOrder.filter((id) => id !== elId);

    const userUndo = room.undoStacks.get(String(userId)) || [];
    userUndo.push({ type: "remove", element: existing });
    room.undoStacks.set(String(userId), userUndo);
    room.redoStacks.set(String(userId), []);

    this.markDirty(room);
    return existing;
  }

  undo(canvasId, userId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return null;

    const uId = String(userId);
    const userUndo = room.undoStacks.get(uId) || [];
    if (userUndo.length === 0) return null;

    const action = userUndo.pop();
    const userRedo = room.redoStacks.get(uId) || [];

    if (action.type === "add") {
      const elId = String(action.element.id);
      const current = room.elements.get(elId);
      room.elements.delete(elId);
      room.elementOrder = room.elementOrder.filter((id) => id !== elId);

      userRedo.push({ type: "add", element: current || action.element });
      room.redoStacks.set(uId, userRedo);
      this.markDirty(room);

      return {
        actionType: "remove",
        id: action.element.id
      };
    }

    if (action.type === "remove") {
      const el = action.element;
      const elId = String(el.id);
      room.elements.set(elId, el);
      if (!room.elementOrder.includes(elId)) {
        room.elementOrder.push(elId);
      }

      userRedo.push({ type: "remove", element: el });
      room.redoStacks.set(uId, userRedo);
      this.markDirty(room);

      return {
        actionType: "add",
        element: el
      };
    }

    return null;
  }

  redo(canvasId, userId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return null;

    const uId = String(userId);
    const userRedo = room.redoStacks.get(uId) || [];
    if (userRedo.length === 0) return null;

    const action = userRedo.pop();
    const userUndo = room.undoStacks.get(uId) || [];

    if (action.type === "add") {
      const el = action.element;
      const elId = String(el.id);
      room.elements.set(elId, el);
      if (!room.elementOrder.includes(elId)) {
        room.elementOrder.push(elId);
      }

      userUndo.push({ type: "add", element: el });
      room.undoStacks.set(uId, userUndo);
      this.markDirty(room);

      return {
        actionType: "add",
        element: el
      };
    }

    if (action.type === "remove") {
      const elId = String(action.element.id);
      const current = room.elements.get(elId);
      room.elements.delete(elId);
      room.elementOrder = room.elementOrder.filter((id) => id !== elId);

      userUndo.push({ type: "remove", element: current || action.element });
      room.undoStacks.set(uId, userUndo);
      this.markDirty(room);

      return {
        actionType: "remove",
        id: action.element.id
      };
    }

    return null;
  }

  getElements(canvasId) {
    const room = this.rooms.get(String(canvasId));
    if (!room) return [];
    return room.elementOrder
      .map((id) => room.elements.get(id))
      .filter(Boolean);
  }

  markDirty(room) {
    room.isDirty = true;
    if (room.debounceTimer) {
      clearTimeout(room.debounceTimer);
    }
    room.debounceTimer = setTimeout(() => {
      this.flushRoom(room.canvasId).catch((err) => {
        console.error(`Debounced flush failed for canvas ${room.canvasId}:`, err.message);
      });
    }, this.debounceMs);
  }

  async flushRoom(canvasId) {
    const room = this.rooms.get(String(canvasId));
    if (!room || !room.isDirty) return;

    if (room.debounceTimer) {
      clearTimeout(room.debounceTimer);
      room.debounceTimer = null;
    }

    const elementsArray = this.getElements(canvasId);
    if (mongoose.Types.ObjectId.isValid(canvasId)) {
      await Canvas.findByIdAndUpdate(canvasId, {
        elements: elementsArray,
        updatedAt: new Date()
      });
    }

    room.isDirty = false;
  }

  async flushAll() {
    const flushPromises = [];
    for (const [canvasId] of this.rooms.entries()) {
      flushPromises.push(this.flushRoom(canvasId));
    }
    await Promise.all(flushPromises);
  }

  evictRoom(canvasId) {
    const id = String(canvasId);
    const room = this.rooms.get(id);
    if (room && room.debounceTimer) {
      clearTimeout(room.debounceTimer);
    }
    this.rooms.delete(id);
  }
}

module.exports = { CanvasRoomManager };

