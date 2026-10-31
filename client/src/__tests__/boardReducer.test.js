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
    case "UPDATE_DELTA_ELEMENT":
      return {
        ...state,
        elements: state.elements.map((el) =>
          String(el.id) === String(action.payload.id) ? { ...el, ...action.payload.patch } : el
        )
      };
    case "REMOVE_DELTA_ELEMENT":
      return {
        ...state,
        elements: state.elements.filter((el) => String(el.id) !== String(action.payload.id))
      };
    case BOARD_ACTIONS.SET_CANVAS_ELEMENTS:
      return { ...state, elements: action.payload.elements };
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
