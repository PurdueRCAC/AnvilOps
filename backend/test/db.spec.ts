import { expect, test } from "vitest";
import { createDB } from "./util/db.ts";

test("database initializes properly", async () => {
  const db = await createDB();
  expect(db).toBeDefined();
});
