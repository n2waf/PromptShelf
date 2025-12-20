"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPrompts = searchPrompts;
const admin = __importStar(require("firebase-admin"));
/**
 * Search prompts by title, description, and content
 */
async function searchPrompts(uid, params) {
    var _a, _b, _c, _d, _e, _f;
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
    const versionsMap = new Map();
    versionsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        versionsMap.set(doc.id, {
            body: data.body || "",
            versionNumber: data.versionNumber || 1,
        });
    });
    // Search and score each prompt
    const results = [];
    for (const promptDoc of promptsSnapshot.docs) {
        const data = promptDoc.data();
        const title = (data.title || "").toLowerCase();
        const description = (data.description || "").toLowerCase();
        // Get current version content
        const version = data.currentVersionId
            ? versionsMap.get(data.currentVersionId)
            : null;
        const body = (version === null || version === void 0 ? void 0 : version.body) || "";
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
        const tags = data.tags || [];
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
                versionNumber: (version === null || version === void 0 ? void 0 : version.versionNumber) || 1,
                createdAt: ((_c = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || "",
                updatedAt: ((_f = (_e = (_d = data.updatedAt) === null || _d === void 0 ? void 0 : _d.toDate) === null || _e === void 0 ? void 0 : _e.call(_d)) === null || _f === void 0 ? void 0 : _f.toISOString()) || "",
                relevance,
            });
        }
    }
    // Sort by relevance (highest first)
    results.sort((a, b) => b.relevance - a.relevance);
    return results;
}
//# sourceMappingURL=search-prompts.js.map