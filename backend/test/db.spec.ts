import { describe, expect } from "vitest";
import { createDB } from "./util/db.ts";

describe("database initializes properly", async () => {
  const db = await createDB();
  expect(db).toBeDefined();
});
