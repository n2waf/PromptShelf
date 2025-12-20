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
exports.getPrompt = getPrompt;
const admin = __importStar(require("firebase-admin"));
/**
 * Get a specific prompt with its current version content
 */
async function getPrompt(uid, params) {
    var _a, _b, _c, _d, _e, _f;
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
    const promptData = promptDoc.data();
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
            const versionData = versionDoc.data();
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
        createdAt: ((_c = (_b = (_a = promptData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || "",
        updatedAt: ((_f = (_e = (_d = promptData.updatedAt) === null || _d === void 0 ? void 0 : _d.toDate) === null || _e === void 0 ? void 0 : _e.call(_d)) === null || _f === void 0 ? void 0 : _f.toISOString()) || "",
    };
}
//# sourceMappingURL=get-prompt.js.map