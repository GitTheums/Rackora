import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@rackora/shared";
import { createTestApp } from "./test/helpers.js";

describe("GET /health", () => {
  it("returns a valid health payload", async () => {
    const { app, cleanup } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = healthResponseSchema.parse(JSON.parse(response.body));
    expect(body.status).toBe("ok");
    expect(body.service).toBe("rackora-server");

    await app.close();
    cleanup();
  });
});
