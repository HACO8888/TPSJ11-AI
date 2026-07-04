import { describe, expect, it } from "vitest";
import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  it("parses complete event/data frames and keeps the trailing remainder", () => {
    const { frames, rest } = parseSseFrames(
      'event: route\ndata: {"kind":"image"}\n\nevent: delta\ndata: {"text":"hi"}\n\nevent: del',
    );
    expect(frames).toEqual([
      { event: "route", data: '{"kind":"image"}' },
      { event: "delta", data: '{"text":"hi"}' },
    ]);
    expect(rest).toBe("event: del");
  });

  it("defaults the event name to 'message' when only data is present", () => {
    const { frames } = parseSseFrames('data: {"choices":[]}\n\n');
    expect(frames).toEqual([{ event: "message", data: '{"choices":[]}' }]);
  });

  it("drops frames that carry no data (e.g. keep-alives)", () => {
    const { frames } = parseSseFrames(": keep-alive\n\nevent: done\ndata: {}\n\n");
    expect(frames).toEqual([{ event: "done", data: "{}" }]);
  });

  it("returns no frames and the whole buffer as remainder when incomplete", () => {
    const { frames, rest } = parseSseFrames('event: delta\ndata: {"text":"par');
    expect(frames).toEqual([]);
    expect(rest).toBe('event: delta\ndata: {"text":"par');
  });

  it("concatenates multiple data lines in one frame", () => {
    const { frames } = parseSseFrames("data: part1\ndata: part2\n\n");
    expect(frames).toEqual([{ event: "message", data: "part1part2" }]);
  });
});
