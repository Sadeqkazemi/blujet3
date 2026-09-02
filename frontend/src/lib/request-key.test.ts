import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestKey } from "./request-key";

afterEach(() => vi.unstubAllGlobals());

describe("createRequestKey", () => {
  it("works when randomUUID is unavailable on an HTTP page", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(17);
        return bytes;
      },
    });

    expect(createRequestKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
