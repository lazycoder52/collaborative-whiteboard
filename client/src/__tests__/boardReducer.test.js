import { BOARD_ACTIONS, TOOL_ITEMS, TOOL_ACTION_TYPES } from "../constants";

// We extract the pure reducer logic to test state transitions
function reduceBoardState(state, action) {
  switch (action.type) {
    case BOARD_ACTIONS.CHANGE_TOOL:
      return { ...state, activeToolItem: action.payload.tool };
    case "ADD_DELTA_ELEMENT": {
      const exists = state.elements.some((el) => String(el.id) === String(action.payload.element.id));
      if (exists) {
        return {
          ...state,
          elements: state.elements.map((el) =>
            String(el.id) === String(action.payload.element.id) ? action.payload.element : el
          )
        };
      }
      return { ...state, elements: [...state.elements, action.payload.element] };
    }
    case "UPDATE_DELTA_ELEMENT": {
      const { id, patch, points, seq } = action.payload;
      return {
        ...state,
        elements: state.elements.map((el) => {
          if (String(el.id) === String(id)) {
            let nextPoints = el.points;
            if (points && Array.isArray(points)) {
              nextPoints = [...(el.points || []), ...points];
            } else if (patch && patch.points && Array.isArray(patch.points)) {
              nextPoints = patch.points;
            }
            return {
              ...el,
              ...(patch || {}),
              points: nextPoints,
              ...(seq !== undefined ? { lastSeq: seq } : {})
            };
          }
          return el;
        })
      };
    }
    case "REMOVE_DELTA_ELEMENT":
      return {
        ...state,
        elements: state.elements.filter((el) => String(el.id) !== String(action.payload.id))
      };
    case BOARD_ACTIONS.SET_CANVAS_ELEMENTS: {
      const incoming = action.payload.elements || [];
      if (action.payload.resync) {
        const incomingMap = new Map(incoming.map((el) => [String(el.id), el]));
        const merged = state.elements.map((el) => {
          const found = incomingMap.get(String(el.id));
          if (found) {
            incomingMap.delete(String(el.id));
            return found;
          }
          return el;
        });
        for (const remaining of incomingMap.values()) {
          merged.push(remaining);
        }
        return { ...state, elements: merged };
      }
      return { ...state, elements: incoming };
    }
    default:
      return state;
  }
}

describe("Client Board Reducer", () => {
  const initialState = {
    activeToolItem: TOOL_ITEMS.BRUSH,
    toolActionType: TOOL_ACTION_TYPES.NONE,
    elements: [],
    canvasId: ""
  };

  test("changes active tool item", () => {
    const nextState = reduceBoardState(initialState, {
      type: BOARD_ACTIONS.CHANGE_TOOL,
      payload: { tool: TOOL_ITEMS.RECTANGLE }
    });
    expect(nextState.activeToolItem).toBe(TOOL_ITEMS.RECTANGLE);
  });

  test("applies ADD_DELTA_ELEMENT", () => {
    const elem = { id: "e1", type: TOOL_ITEMS.LINE, x1: 0, y1: 0, x2: 10, y2: 10 };
    const nextState = reduceBoardState(initialState, {
      type: "ADD_DELTA_ELEMENT",
      payload: { element: elem }
    });
    expect(nextState.elements).toHaveLength(1);
    expect(nextState.elements[0].id).toBe("e1");
  });

  test("applies UPDATE_DELTA_ELEMENT", () => {
    const stateWithElem = {
      ...initialState,
      elements: [{ id: "e1", type: TOOL_ITEMS.BRUSH, points: [{ x: 1, y: 1 }] }]
    };
    const nextState = reduceBoardState(stateWithElem, {
      type: "UPDATE_DELTA_ELEMENT",
      payload: { id: "e1", patch: { points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] } }
    });
    expect(nextState.elements[0].points).toHaveLength(2);
  });

  test("applies UPDATE_DELTA_ELEMENT appending points with sequence number", () => {
    const stateWithElem = {
      ...initialState,
      elements: [{ id: "e1", type: TOOL_ITEMS.BRUSH, points: [{ x: 1, y: 1 }], lastSeq: 0 }]
    };
    const nextState = reduceBoardState(stateWithElem, {
      type: "UPDATE_DELTA_ELEMENT",
      payload: { id: "e1", points: [{ x: 5, y: 5 }, { x: 10, y: 10 }], seq: 1 }
    });
    expect(nextState.elements[0].points).toHaveLength(3);
    expect(nextState.elements[0].points[2]).toEqual({ x: 10, y: 10 });
    expect(nextState.elements[0].lastSeq).toBe(1);
  });

  test("merges resynced element into state on SET_CANVAS_ELEMENTS with resync: true", () => {
    const stateWithElems = {
      ...initialState,
      elements: [
        { id: "e1", type: TOOL_ITEMS.BRUSH, points: [{ x: 1, y: 1 }] },
        { id: "e2", type: TOOL_ITEMS.LINE, x1: 0, y1: 0, x2: 20, y2: 20 }
      ]
    };
    const nextState = reduceBoardState(stateWithElems, {
      type: BOARD_ACTIONS.SET_CANVAS_ELEMENTS,
      payload: {
        resync: true,
        elements: [
          {
            id: "e1",
            type: TOOL_ITEMS.BRUSH,
            points: [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 10, y: 10 }]
          }
        ]
      }
    });
    expect(nextState.elements).toHaveLength(2);
    expect(nextState.elements.find((e) => e.id === "e1").points).toHaveLength(3);
    expect(nextState.elements.find((e) => e.id === "e2")).toBeTruthy();
  });

  test("applies REMOVE_DELTA_ELEMENT", () => {
    const stateWithElems = {
      ...initialState,
      elements: [
        { id: "e1", type: TOOL_ITEMS.LINE },
        { id: "e2", type: TOOL_ITEMS.RECTANGLE }
      ]
    };
    const nextState = reduceBoardState(stateWithElems, {
      type: "REMOVE_DELTA_ELEMENT",
      payload: { id: "e1" }
    });
    expect(nextState.elements).toHaveLength(1);
    expect(nextState.elements[0].id).toBe("e2");
  });
});
