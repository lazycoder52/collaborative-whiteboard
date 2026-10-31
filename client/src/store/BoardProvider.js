import React, { useCallback, useReducer } from "react";
import boardContext from "./board-context";
import { BOARD_ACTIONS, TOOL_ACTION_TYPES, TOOL_ITEMS } from "../constants";
import { createElement, ensureRoughElement, isPointNearElement } from "../utils/element";

const initialBoardState = {
  activeToolItem: TOOL_ITEMS.BRUSH,
  toolActionType: TOOL_ACTION_TYPES.NONE,
  elements: [],
  canvasId: "",
  isUserLoggedIn: !!localStorage.getItem("whiteboard_user_token")
};

const boardReducer = (state, action) => {
  switch (action.type) {
    case BOARD_ACTIONS.CHANGE_TOOL: {
      return {
        ...state,
        activeToolItem: action.payload.tool
      };
    }
    case BOARD_ACTIONS.CHANGE_ACTION_TYPE:
      return {
        ...state,
        toolActionType: action.payload.actionType
      };

    case BOARD_ACTIONS.DRAW_DOWN: {
      const { id, clientX, clientY, stroke, fill, size } = action.payload;
      const newElement = createElement(id, clientX, clientY, clientX, clientY, {
        type: state.activeToolItem,
        stroke,
        fill,
        size
      });
      return {
        ...state,
        toolActionType:
          state.activeToolItem === TOOL_ITEMS.TEXT
            ? TOOL_ACTION_TYPES.WRITING
            : TOOL_ACTION_TYPES.DRAWING,
        elements: [...state.elements, newElement]
      };
    }

    case BOARD_ACTIONS.DRAW_MOVE: {
      const { clientX, clientY } = action.payload;
      if (state.elements.length === 0) return state;

      const newElements = [...state.elements];
      const index = newElements.length - 1;
      const current = newElements[index];
      if (!current) return state;

      if (current.type === TOOL_ITEMS.BRUSH) {
        const nextPoints = [...(current.points || []), { x: clientX, y: clientY }];
        newElements[index] = {
          ...current,
          points: nextPoints
        };
        return { ...state, elements: newElements };
      }

      const updated = createElement(
        current.id,
        current.x1,
        current.y1,
        clientX,
        clientY,
        {
          type: state.activeToolItem,
          stroke: current.stroke,
          fill: current.fill,
          size: current.size
        }
      );
      newElements[index] = updated;
      return { ...state, elements: newElements };
    }

    case BOARD_ACTIONS.DRAW_UP: {
      return {
        ...state,
        toolActionType: TOOL_ACTION_TYPES.NONE
      };
    }

    case BOARD_ACTIONS.ERASE: {
      const { clientX, clientY } = action.payload;
      const filtered = state.elements.filter(
        (el) => !isPointNearElement(el, clientX, clientY)
      );
      return {
        ...state,
        elements: filtered
      };
    }

    case BOARD_ACTIONS.CHANGE_TEXT: {
      if (state.elements.length === 0) return state;
      const newElements = [...state.elements];
      const index = newElements.length - 1;
      newElements[index] = {
        ...newElements[index],
        text: action.payload.text
      };
      return {
        ...state,
        toolActionType: TOOL_ACTION_TYPES.NONE,
        elements: newElements
      };
    }

    case BOARD_ACTIONS.SET_CANVAS_ELEMENTS: {
      const ensured = (action.payload.elements || []).map(ensureRoughElement);
      return {
        ...state,
        elements: ensured
      };
    }

    case "ADD_DELTA_ELEMENT": {
      const newElem = ensureRoughElement(action.payload.element);
      const exists = state.elements.some((el) => String(el.id) === String(newElem.id));
      if (exists) {
        return {
          ...state,
          elements: state.elements.map((el) =>
            String(el.id) === String(newElem.id) ? newElem : el
          )
        };
      }
      return {
        ...state,
        elements: [...state.elements, newElem]
      };
    }

    case "UPDATE_DELTA_ELEMENT": {
      const { id, patch } = action.payload;
      return {
        ...state,
        elements: state.elements.map((el) => {
          if (String(el.id) === String(id)) {
            const merged = { ...el, ...patch };
            return ensureRoughElement(merged);
          }
          return el;
        })
      };
    }

    case "REMOVE_DELTA_ELEMENT": {
      const { id } = action.payload;
      return {
        ...state,
        elements: state.elements.filter((el) => String(el.id) !== String(id))
      };
    }

    case BOARD_ACTIONS.SET_CANVAS_ID:
      return {
        ...state,
        canvasId: action.payload.canvasId
      };

    case BOARD_ACTIONS.SET_USER_LOGIN_STATUS:
      return {
        ...state,
        isUserLoggedIn: action.payload.isUserLoggedIn
      };

    default:
      return state;
  }
};

const BoardProvider = ({ children }) => {
  const [boardState, dispatchBoardAction] = useReducer(
    boardReducer,
    initialBoardState
  );

  const changeToolHandler = useCallback((tool) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.CHANGE_TOOL,
      payload: { tool }
    });
  }, []);

  const boardMouseDownHandler = useCallback((event, toolboxState) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return null;
    const { clientX, clientY } = event;

    if (boardState.activeToolItem === TOOL_ITEMS.ERASER) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.CHANGE_ACTION_TYPE,
        payload: { actionType: TOOL_ACTION_TYPES.ERASING }
      });
      return null;
    }

    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    dispatchBoardAction({
      type: BOARD_ACTIONS.DRAW_DOWN,
      payload: {
        id,
        clientX,
        clientY,
        stroke: toolboxState[boardState.activeToolItem]?.stroke,
        fill: toolboxState[boardState.activeToolItem]?.fill,
        size: toolboxState[boardState.activeToolItem]?.size
      }
    });

    return id;
  }, [boardState.toolActionType, boardState.activeToolItem]);

  const boardMouseMoveHandler = useCallback((event) => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    const { clientX, clientY } = event;

    if (boardState.toolActionType === TOOL_ACTION_TYPES.DRAWING) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.DRAW_MOVE,
        payload: { clientX, clientY }
      });
    } else if (boardState.toolActionType === TOOL_ACTION_TYPES.ERASING) {
      dispatchBoardAction({
        type: BOARD_ACTIONS.ERASE,
        payload: { clientX, clientY }
      });
    }
  }, [boardState.toolActionType]);

  const boardMouseUpHandler = useCallback(() => {
    if (boardState.toolActionType === TOOL_ACTION_TYPES.WRITING) return;
    dispatchBoardAction({ type: BOARD_ACTIONS.DRAW_UP });
  }, [boardState.toolActionType]);

  const textAreaBlurHandler = useCallback((text) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.CHANGE_TEXT,
      payload: { text }
    });
  }, []);

  const setCanvasId = useCallback((canvasId) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_CANVAS_ID,
      payload: { canvasId }
    });
  }, []);

  const setElements = useCallback((elements) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_CANVAS_ELEMENTS,
      payload: { elements }
    });
  }, []);

  const addDeltaElement = useCallback((element) => {
    dispatchBoardAction({
      type: "ADD_DELTA_ELEMENT",
      payload: { element }
    });
  }, []);

  const updateDeltaElement = useCallback((id, patch) => {
    dispatchBoardAction({
      type: "UPDATE_DELTA_ELEMENT",
      payload: { id, patch }
    });
  }, []);

  const removeDeltaElement = useCallback((id) => {
    dispatchBoardAction({
      type: "REMOVE_DELTA_ELEMENT",
      payload: { id }
    });
  }, []);

  const setUserLoginStatus = useCallback((isUserLoggedIn) => {
    dispatchBoardAction({
      type: BOARD_ACTIONS.SET_USER_LOGIN_STATUS,
      payload: { isUserLoggedIn }
    });
  }, []);

  const boardContextValue = {
    activeToolItem: boardState.activeToolItem,
    elements: boardState.elements,
    toolActionType: boardState.toolActionType,
    canvasId: boardState.canvasId,
    isUserLoggedIn: boardState.isUserLoggedIn,
    changeToolHandler,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    setCanvasId,
    setElements,
    addDeltaElement,
    updateDeltaElement,
    removeDeltaElement,
    setUserLoginStatus
  };

  return (
    <boardContext.Provider value={boardContextValue}>
      {children}
    </boardContext.Provider>
  );
};

export default BoardProvider;
