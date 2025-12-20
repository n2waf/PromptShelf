import * as admin from "firebase-admin";
import { PromptDetail } from "../types";

interface SearchPromptsParams {
  query: string;
}

interface SearchResult extends PromptDetail {
  relevance: number;
}

/**
 * Search prompts by title, description, and content
 */
export async function searchPrompts(
  uid: string,
  params: SearchPromptsParams
): Promise<SearchResult[]> {
  const db = admin.firestore();
  const searchQuery = params.query.toLowerCase();

  // Get all prompts for the user
  const promptsSnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("prompts")
    .get();

  if (promptsSnapshot.empty) {
    return [];
  }

  // Get all versions to search content
  const versionsSnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("versions")
    .get();

  // Create a map of version ID to version data
  const versionsMap = new Map<string, { body: string; versionNumber: number }>();
  versionsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    versionsMap.set(doc.id, {
      body: data.body || "",
      versionNumber: data.versionNumber || 1,
    });
  });

  // Search and score each prompt
  const results: SearchResult[] = [];

  for (const promptDoc of promptsSnapshot.docs) {
    const data = promptDoc.data();
    const title = (data.title || "").toLowerCase();
    const description = (data.description || "").toLowerCase();

    // Get current version content
    const version = data.currentVersionId
      ? versionsMap.get(data.currentVersionId)
      : null;
    const body = version?.body || "";
    const bodyLower = body.toLowerCase();

    // Calculate relevance score
    let relevance = 0;

    // Title match (highest weight)
    if (title.includes(searchQuery)) {
      relevance += 10;
      if (title === searchQuery) {
        relevance += 5; // Exact match bonus
      }
    }

    // Description match (medium weight)
    if (description.includes(searchQuery)) {
      relevance += 5;
    }

    // Body match (lower weight)
    if (bodyLower.includes(searchQuery)) {
      relevance += 3;
      // Count occurrences for additional relevance
      const occurrences = (bodyLower.match(new RegExp(searchQuery, "g")) || [])
        .length;
      relevance += Math.min(occurrences, 5); // Cap at 5 extra points
    }

    // Tag match
    const tags: string[] = data.tags || [];
    if (tags.some((tag) => tag.toLowerCase().includes(searchQuery))) {
      relevance += 4;
    }

    // Only include if there's a match
    if (relevance > 0) {
      results.push({
        id: promptDoc.id,
        title: data.title || "",
        description: data.description || "",
        body,
        tags,
        isFavorite: data.isFavorite || false,
        versionNumber: version?.versionNumber || 1,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || "",
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || "",
        relevance,
      });
    }
  }

  // Sort by relevance (highest first)
  results.sort((a, b) => b.relevance - a.relevance);

  return results;
}
