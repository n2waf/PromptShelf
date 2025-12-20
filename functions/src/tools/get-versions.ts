import * as admin from "firebase-admin";
import { VersionInfo } from "../types";

interface GetVersionsParams {
  prompt_id: string;
}

/**
 * Get version history for a specific prompt
 */
export async function getVersions(
  uid: string,
  params: GetVersionsParams
): Promise<VersionInfo[]> {
  const db = admin.firestore();

  // Query versions for this prompt, ordered by version number descending
  const versionsSnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("versions")
    .where("promptId", "==", params.prompt_id)
    .orderBy("versionNumber", "desc")
    .get();

  return versionsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      versionNumber: data.versionNumber || 1,
      versionNotes: data.versionNotes || undefined,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || "",
    };
  });
}
