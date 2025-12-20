import * as admin from "firebase-admin";
import { PromptListItem } from "../types";

interface ListPromptsParams {
  tag?: string;
  limit?: number;
}

/**
 * List all prompts for a user, optionally filtered by tag
 */
export async function listPrompts(
  uid: string,
  params: ListPromptsParams
): Promise<PromptListItem[]> {
  const db = admin.firestore();
  const limit = params.limit || 100;

  let query: admin.firestore.Query = db
    .collection("users")
    .doc(uid)
    .collection("prompts")
    .orderBy("updatedAt", "desc")
    .limit(limit);

  // Filter by tag if provided
  if (params.tag) {
    query = query.where("tags", "array-contains", params.tag);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title || "",
      description: data.description || "",
      tags: data.tags || [],
      isFavorite: data.isFavorite || false,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || "",
    };
  });
}
