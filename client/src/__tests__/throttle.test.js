import { throttle } from "../utils/throttle";

describe("Client Throttle Utility", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("invokes function immediately on leading call", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 50);

    throttled("call 1");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("call 1");
  });

  test("batches subsequent calls within wait window and fires trailing call with latest arguments", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 50);

    throttled("point 1");
    expect(fn).toHaveBeenCalledTimes(1);

    throttled("point 2");
    throttled("point 3");
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("point 3");
  });
});
