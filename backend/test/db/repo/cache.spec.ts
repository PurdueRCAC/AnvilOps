import { expect, test } from "vitest";
import { createDB } from "../../util/db.ts";

test("encrypted cached values", async () => {
  const db = await createDB();

  await db.cache.setEncrypted(
    "key",
    "value",
    new Date(new Date().getTime() + 86_400_000),
  );

  const value = await db.cache.getEncrypted("key");

  expect(value).toEqual("value");
});
