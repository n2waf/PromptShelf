import * as admin from "firebase-admin";
import { PromptDetail } from "../types";

interface GetPromptParams {
  prompt_id: string;
}

/**
 * Get a specific prompt with its current version content
 */
export async function getPrompt(
  uid: string,
  params: GetPromptParams
): Promise<PromptDetail | null> {
  const db = admin.firestore();

  // Get the prompt document
  const promptDoc = await db
    .collection("users")
    .doc(uid)
    .collection("prompts")
    .doc(params.prompt_id)
    .get();

  if (!promptDoc.exists) {
    return null;
  }

  const promptData = promptDoc.data()!;

  // Get the current version
  let body = "";
  let versionNumber = 1;

  if (promptData.currentVersionId) {
    const versionDoc = await db
      .collection("users")
      .doc(uid)
      .collection("versions")
      .doc(promptData.currentVersionId)
      .get();

    if (versionDoc.exists) {
      const versionData = versionDoc.data()!;
      body = versionData.body || "";
      versionNumber = versionData.versionNumber || 1;
    }
  }

  return {
    id: promptDoc.id,
    title: promptData.title || "",
    description: promptData.description || "",
    body,
    tags: promptData.tags || [],
    isFavorite: promptData.isFavorite || false,
    versionNumber,
    createdAt: promptData.createdAt?.toDate?.()?.toISOString() || "",
    updatedAt: promptData.updatedAt?.toDate?.()?.toISOString() || "",
  };
}
