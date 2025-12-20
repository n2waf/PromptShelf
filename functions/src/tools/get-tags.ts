import * as admin from "firebase-admin";
import { TagInfo } from "../types";

/**
 * Get all tags for a user with usage counts
 */
export async function getTags(uid: string): Promise<TagInfo[]> {
  const db = admin.firestore();

  const tagsSnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("tags")
    .orderBy("usageCount", "desc")
    .get();

  return tagsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "",
      color: data.color || "#6366f1",
      usageCount: data.usageCount || 0,
    };
  });
}
