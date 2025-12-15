import { expect, test } from "vitest";
import { db } from "../../src/db/index.ts";
import { getUser } from "../../src/service/getUser.ts";

test("createUser", async (c) => {
  const newUser = await db.user.createUserWithPersonalOrg(
    "create-user@anvilops.local",
    "full name",
    "cilogonUserId",
    "clusterUsername",
  );
  const user = await getUser(newUser.id);

  expect(user.orgs).toEqual([
    {
      id: 1,
      name: "full name's Apps",
      permissionLevel: "OWNER",
      githubConnected: false,
    },
  ]);

  expect(user.email).toEqual("create-user@anvilops.local");
  expect(user.name).toBe("full name");
});
