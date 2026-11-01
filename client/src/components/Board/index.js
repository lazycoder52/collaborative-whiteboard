import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import rough from "roughjs";
import boardContext from "../../store/board-context";
import { TOOL_ACTION_TYPES, TOOL_ITEMS } from "../../constants";
import toolboxContext from "../../store/toolbox-context";
import { getSocket } from "../../utils/socket";
import classes from "./index.module.css";
import { createElement, getSvgPathFromStroke, isPointNearElement } from "../../utils/element";
import { throttle } from "../../utils/throttle";
import getStroke from "perfect-freehand";

function Board({ id }) {
  const canvasRef = useRef(null);
  const textAreaRef = useRef(null);
  const activeElementRef = useRef(null);
  const strokeSeqRef = useRef({ id: null, seq: 0, pendingPoints: [], unackedPoints: [] });

  const {
    elements,
    toolActionType,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    setCanvasId,
    setElements,
    addDeltaElement,
    updateDeltaElement,
    removeDeltaElement
  } = useContext(boardContext);

  const { toolboxState } = useContext(toolboxContext);
  const [isAuthorized, setIsAuthorized] = useState(true);

  // Flush appended brush points with element ID and incremental sequence number
  const flushBrushPoints = useCallback((canvasId, elementId) => {
    const state = strokeSeqRef.current;
    if (!state || state.id !== elementId || state.pendingPoints.length === 0) return;
    const socket = getSocket();
    if (!socket) return;

    const nextSeq = state.seq + 1;
    const pointsToSend = [...state.pendingPoints];
    state.pendingPoints = [];
    state.unackedPoints = pointsToSend;
    state.seq = nextSeq;

    socket.emit(
      "element:update",
      {
        canvasId,
        id: elementId,
        seq: nextSeq,
        points: pointsToSend
      },
      (response) => {
        if (response && response.success) {
          state.unackedPoints = [];
        } else if (response && response.resync) {
          socket.emit("joinCanvas", { canvasId });
        }
      }
    );
  }, []);

  // Throttled delta updates (50ms interval)
  const throttledEmitBrushUpdate = useMemo(() => {
    return throttle((canvasId, elementId) => {
      flushBrushPoints(canvasId, elementId);
    }, 50);
  }, [flushBrushPoints]);

  const throttledEmitShapeUpdate = useMemo(() => {
    return throttle((canvasId, elementId, patch) => {
      const socket = getSocket();
      if (socket) {
        socket.emit("element:update", { canvasId, id: elementId, patch });
      }
    }, 50);
  }, []);

  // Socket room connection and delta event listeners
  useEffect(() => {
    if (!id) return;
    setCanvasId(id);
    const socket = getSocket();

    socket.emit("joinCanvas", { canvasId: id });

    const handleCanvasLoad = (data) => {
      setElements(data.elements || [], !!data.resync);
    };

    const handleElementAdd = (data) => {
      if (data.element) {
        addDeltaElement(data.element);
      }
    };

    const handleElementUpdate = (data) => {
      if (data.id) {
        updateDeltaElement(data.id, data.patch, data.points, data.seq);
      }
    };

    const handleElementRemove = (data) => {
      if (data.id) {
        removeDeltaElement(data.id);
      }
    };

    const handleUnauthorized = (data) => {
      alert(data.message || "Access Denied: You cannot edit this canvas.");
      setIsAuthorized(false);
    };

    socket.on("canvas:load", handleCanvasLoad);
    socket.on("element:add", handleElementAdd);
    socket.on("element:update", handleElementUpdate);
    socket.on("element:remove", handleElementRemove);
    socket.on("unauthorized", handleUnauthorized);

    return () => {
      socket.off("canvas:load", handleCanvasLoad);
      socket.off("element:add", handleElementAdd);
      socket.off("element:update", handleElementUpdate);
      socket.off("element:remove", handleElementRemove);
      socket.off("unauthorized", handleUnauthorized);
    };
  }, [id, setCanvasId, setElements, addDeltaElement, updateDeltaElement, removeDeltaElement]);

  // Canvas resize listener
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard undo/redo shortcuts
  const handleUndo = useCallback(() => {
    if (id) {
      getSocket().emit("undo", { canvasId: id });
    }
  }, [id]);

  const handleRedo = useCallback(() => {
    if (id) {
      getSocket().emit("redo", { canvasId: id });
    }
  }, [id]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
      } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Canvas paint render loop
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.save();

    const roughCanvas = rough.canvas(canvas);

    elements.forEach((element) => {
      switch (element.type) {
        case TOOL_ITEMS.LINE:
        case TOOL_ITEMS.RECTANGLE:
        case TOOL_ITEMS.CIRCLE:
        case TOOL_ITEMS.ARROW:
          if (element.roughEle) {
            roughCanvas.draw(element.roughEle);
          }
          break;
        case TOOL_ITEMS.BRUSH:
          if (element.points && element.points.length > 0) {
            context.fillStyle = element.stroke || "#000000";
            const path = new Path2D(getSvgPathFromStroke(getStroke(element.points)));
            context.fill(path);
          }
          break;
        case TOOL_ITEMS.TEXT:
          context.textBaseline = "top";
          context.font = `${element.size || 24}px Caveat`;
          context.fillStyle = element.stroke || "#000000";
          context.fillText(element.text || "", element.x1, element.y1);
          break;
        default:
          break;
      }
    });

    return () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    };
  }, [elements]);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (toolActionType === TOOL_ACTION_TYPES.WRITING && textarea) {
      setTimeout(() => {
        textarea.focus();
      }, 0);
    }
  }, [toolActionType]);

  const handleMouseDown = (event) => {
    if (!isAuthorized || !id) return;
    const { clientX, clientY } = event;

    const elementId = boardMouseDownHandler(event, toolboxState);
    if (!elementId) return;

    const stroke = toolboxState[activeElementRef.current?.type || TOOL_ITEMS.BRUSH]?.stroke || "#000000";
    const fill = toolboxState[activeElementRef.current?.type || TOOL_ITEMS.BRUSH]?.fill || null;
    const size = toolboxState[activeElementRef.current?.type || TOOL_ITEMS.BRUSH]?.size || 3;

    const newElem = createElement(elementId, clientX, clientY, clientX, clientY, {
      type: activeElementRef.current?.type || TOOL_ITEMS.BRUSH,
      stroke,
      fill,
      size
    });

    activeElementRef.current = {
      id: elementId,
      type: newElem.type,
      x1: clientX,
      y1: clientY,
      x2: clientX,
      y2: clientY,
      points: newElem.points ? [...newElem.points] : []
    };

    if (newElem.type === TOOL_ITEMS.BRUSH) {
      strokeSeqRef.current = {
        id: elementId,
        seq: 0,
        pendingPoints: [],
        unackedPoints: []
      };
    }

    // Emit initial element:add delta
    getSocket().emit("element:add", {
      canvasId: id,
      element: newElem
    });
  };

  const handleMouseMove = (event) => {
    if (!isAuthorized || !id) return;
    boardMouseMoveHandler(event);
    const { clientX, clientY } = event;

    if (toolActionType === TOOL_ACTION_TYPES.DRAWING && activeElementRef.current) {
      const active = activeElementRef.current;
      if (active.type === TOOL_ITEMS.BRUSH) {
        active.points.push({ x: clientX, y: clientY });
        strokeSeqRef.current.pendingPoints.push({ x: clientX, y: clientY });
        throttledEmitBrushUpdate(id, active.id);
      } else {
        active.x2 = clientX;
        active.y2 = clientY;
        throttledEmitShapeUpdate(id, active.id, { x2: clientX, y2: clientY });
      }
    } else if (toolActionType === TOOL_ACTION_TYPES.ERASING) {
      const target = elements.find((el) => isPointNearElement(el, clientX, clientY));
      if (target) {
        getSocket().emit("element:remove", { canvasId: id, id: target.id });
      }
    }
  };

  const handleMouseUp = () => {
    if (!isAuthorized || !id) return;
    boardMouseUpHandler();

    if (activeElementRef.current) {
      const active = activeElementRef.current;
      if (active.type === TOOL_ITEMS.BRUSH) {
        flushBrushPoints(id, active.id);
        strokeSeqRef.current = { id: null, seq: 0, pendingPoints: [], unackedPoints: [] };
      } else {
        getSocket().emit("element:update", {
          canvasId: id,
          id: active.id,
          patch: { x2: active.x2, y2: active.y2 }
        });
      }
      activeElementRef.current = null;
    }
  };

  return (
    <>
      {toolActionType === TOOL_ACTION_TYPES.WRITING && elements.length > 0 && (
        <textarea
          ref={textAreaRef}
          className={classes.textElementBox}
          style={{
            top: elements[elements.length - 1]?.y1 || 0,
            left: elements[elements.length - 1]?.x1 || 0,
            fontSize: `${elements[elements.length - 1]?.size || 24}px`,
            color: elements[elements.length - 1]?.stroke || "#000000"
          }}
          onBlur={(event) => textAreaBlurHandler(event.target.value)}
        />
      )}
      <canvas
        ref={canvasRef}
        id="canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default Board;
