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
exports.listPrompts = listPrompts;
const admin = __importStar(require("firebase-admin"));
/**
 * List all prompts for a user, optionally filtered by tag
 */
async function listPrompts(uid, params) {
    const db = admin.firestore();
    const limit = params.limit || 100;
    let query = db
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
        var _a, _b, _c;
        const data = doc.data();
        return {
            id: doc.id,
            title: data.title || "",
            description: data.description || "",
            tags: data.tags || [],
            isFavorite: data.isFavorite || false,
            updatedAt: ((_c = (_b = (_a = data.updatedAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || "",
        };
    });
}
//# sourceMappingURL=list-prompts.js.map