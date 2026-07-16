import { describe, expect, it } from "vitest";
import { resolveHostFsLayout } from "./fs.js";

describe("host filesystem layout", () => {
  it("uses HOST_ROOT when configured", () => {
    expect(
      resolveHostFsLayout({
        HOST_ROOT: "/custom",
        HOST_ROOTFS: "/custom/root",
      }),
    ).toEqual({
      prefix: "/custom",
      rootfs: "/custom/root",
    });
  });
});
