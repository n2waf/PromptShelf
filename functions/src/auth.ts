import * as admin from "firebase-admin";
import { AuthResult } from "./types";

/**
 * Validate API key from Authorization header and return user info
 * @param authHeader - The Authorization header value (Bearer ps_XXXX_...)
 * @returns User UID and email if valid
 * @throws Error if invalid or missing
 */
export async function validateApiKey(authHeader: string | undefined): Promise<AuthResult> {
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  // Extract API key from "Bearer <api_key>" format
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    throw new Error("Invalid Authorization header format. Expected: Bearer <api_key>");
  }

  const apiKey = parts[1];

  // Validate API key format (ps_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX)
  if (!apiKey.startsWith("ps_")) {
    throw new Error("Invalid API key format");
  }

  // Query Firestore for user with this API key
  const db = admin.firestore();
  const usersSnapshot = await db
    .collection("users")
    .where("apiKey", "==", apiKey)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    throw new Error("Invalid API key");
  }

  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();

  return {
    uid: userDoc.id,
    email: userData.email || "",
  };
}
