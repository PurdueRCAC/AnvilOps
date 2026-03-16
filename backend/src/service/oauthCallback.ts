import * as client from "openid-client";
import { db } from "../db/index.ts";
import { logger } from "../index.ts";
import { CallbackError, usingCILogon, usingRancherOIDC } from "../lib/auth.ts";
import { getRancherUserID, isRancherManaged } from "../lib/cluster/rancher.ts";
import { env, parseCsv } from "../lib/env.ts";

const ciLogonAllowedIdps = parseCsv(env.ALLOWED_IDPS) ?? [];

const getPrincipalIdValue = (claims: client.IDToken) => {
  if (process.env._PURDUE_GEDDES) {
    // On Purdue's Geddes cluster, Rancher is not configured to use a claim available from CILogon as a principalId.
    // Rather, it uses the Purdue-specific UID:
    const email = claims.email as string | undefined;
    return email?.replace("@purdue.edu", "");
  }
  return claims[env.LOGIN_CLAIM] as string;
};

const getClusterUsername = async (claims: client.IDToken) => {
  if (usingRancherOIDC()) {
    return claims.sub;
  }

  if (isRancherManaged()) {
    const principalIdValue = getPrincipalIdValue(claims);
    const rancherId = await getRancherUserID(principalIdValue);
    if (!rancherId) {
      throw new CallbackError("RANCHER_ID_MISSING");
    }
    return rancherId;
  }

  return null;
};

export async function oauthCallback(claims: client.IDToken): Promise<{
  id: number;
  name: string;
  email?: string;
}> {
  if (
    usingCILogon() &&
    !ciLogonAllowedIdps.includes((claims.idp as string)?.toString())
  ) {
    throw new CallbackError("IDP_ERROR");
  }
  const existingUser = await db.user.getByOIDCUserId(claims.sub);

  if (existingUser) {
    logger.info({ userId: existingUser.id }, "User logged in");
    return {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
    };
  }

  const clusterUsername: string | null = await getClusterUsername(claims);

  const newUser = await db.user.createUserWithPersonalOrg(
    claims.email as string,
    claims.name as string,
    claims.sub,
    clusterUsername,
  );

  logger.info(newUser, "User signed up");
  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
  };
}
