// TypeScript interfaces for PromptShelf MCP Server

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  apiKey: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  currentVersionId: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  body: string;
  versionNumber: number;
  versionNotes?: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// API Response types
export interface PromptListItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  isFavorite: boolean;
  updatedAt: string;
}

export interface PromptDetail {
  id: string;
  title: string;
  description: string;
  body: string;
  tags: string[];
  isFavorite: boolean;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionInfo {
  id: string;
  versionNumber: number;
  versionNotes?: string;
  createdAt: string;
}

export interface TagInfo {
  id: string;
  name: string;
  color: string;
  usageCount: number;
}

// Auth types
export interface AuthResult {
  uid: string;
  email: string;
}
