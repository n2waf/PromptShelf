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
exports.validateApiKey = validateApiKey;
const admin = __importStar(require("firebase-admin"));
/**
 * Validate API key from Authorization header and return user info
 * @param authHeader - The Authorization header value (Bearer ps_XXXX_...)
 * @returns User UID and email if valid
 * @throws Error if invalid or missing
 */
async function validateApiKey(authHeader) {
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
//# sourceMappingURL=auth.js.map