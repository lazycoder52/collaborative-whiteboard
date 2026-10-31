import { createContext } from "react";

const boardContext = createContext({
  activeToolItem: "",
  elements: [],
  toolActionType: "",
  canvasId: "",
  isUserLoggedIn: false,
  changeToolHandler: () => {},
  boardMouseDownHandler: () => {},
  boardMouseMoveHandler: () => {},
  boardMouseUpHandler: () => {},
  textAreaBlurHandler: () => {},
  setCanvasId: () => {},
  setElements: () => {},
  addDeltaElement: () => {},
  updateDeltaElement: () => {},
  removeDeltaElement: () => {},
  setUserLoginStatus: () => {}
});

export default boardContext;
