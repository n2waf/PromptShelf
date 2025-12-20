// PromptShelf - Single file application (no modules for file:// compatibility)
(function() {
    'use strict';

    // ========================================
    // Database Layer (IndexedDB)
    // ========================================
    const DB_NAME = 'PromptShelfDB';
    const DB_VERSION = 1;
    let db = null;

    const DB = {
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    db = request.result;
                    resolve(db);
                };

                request.onupgradeneeded = (event) => {
                    const database = event.target.result;

                    if (!database.objectStoreNames.contains('prompts')) {
                        const promptStore = database.createObjectStore('prompts', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        promptStore.createIndex('title', 'title', { unique: false });
                        promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }

                    if (!database.objectStoreNames.contains('versions')) {
                        const versionStore = database.createObjectStore('versions', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        versionStore.createIndex('promptId', 'promptId', { unique: false });
                    }

                    if (!database.objectStoreNames.contains('tags')) {
                        database.createObjectStore('tags', { keyPath: 'name' });
                    }

                    if (!database.objectStoreNames.contains('settings')) {
                        database.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            });
        },

        transaction(storeName, mode = 'readonly') {
            return db.transaction(storeName, mode).objectStore(storeName);
        },

        async getAllPrompts() {
            return new Promise((resolve, reject) => {
                const store = this.transaction('prompts');
                const request = store.index('updatedAt').openCursor(null, 'prev');
                const prompts = [];

                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        prompts.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(prompts);
                    }
                };
            });
        },

        async getPrompt(id) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('prompts');
                const request = store.get(id);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        },

        async createPrompt(data) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('prompts', 'readwrite');
                const prompt = {
                    title: data.title || 'Untitled Prompt',
                    description: data.description || '',
                    tags: data.tags || [],
                    currentVersionId: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                const request = store.add(prompt);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    prompt.id = request.result;
                    resolve(prompt);
                };
            });
        },

        async updatePrompt(id, data) {
            const existing = await this.getPrompt(id);
            if (!existing) throw new Error('Prompt not found');

            return new Promise((resolve, reject) => {
                const store = this.transaction('prompts', 'readwrite');
                const updated = { ...existing, ...data, id, updatedAt: Date.now() };
                const request = store.put(updated);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(updated);
            });
        },

        async deletePrompt(id) {
            const versions = await this.getVersions(id);
            for (const version of versions) {
                await this.deleteVersion(version.id);
            }

            return new Promise((resolve, reject) => {
                const store = this.transaction('prompts', 'readwrite');
                const request = store.delete(id);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        },

        // Clear all prompts, versions, and tags
        async clearAllPrompts() {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['prompts', 'versions', 'tags'], 'readwrite');
                transaction.onerror = () => reject(transaction.error);
                transaction.oncomplete = () => resolve();

                transaction.objectStore('prompts').clear();
                transaction.objectStore('versions').clear();
                transaction.objectStore('tags').clear();
            });
        },

        async getVersions(promptId) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('versions');
                const index = store.index('promptId');
                const request = index.getAll(promptId);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const versions = request.result.sort((a, b) => b.versionNumber - a.versionNumber);
                    resolve(versions);
                };
            });
        },

        async getVersion(id) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('versions');
                const request = store.get(id);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        },

        async createVersion(data) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('versions', 'readwrite');
                const version = {
                    promptId: data.promptId,
                    body: data.body || '',
                    versionNumber: data.versionNumber || 1,
                    note: data.note || '',
                    createdAt: Date.now()
                };
                const request = store.add(version);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    version.id = request.result;
                    resolve(version);
                };
            });
        },

        async deleteVersion(id) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('versions', 'readwrite');
                const request = store.delete(id);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        },

        async getAllTags() {
            return new Promise((resolve, reject) => {
                const store = this.transaction('tags');
                const request = store.getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const tags = request.result.sort((a, b) => b.usageCount - a.usageCount);
                    resolve(tags);
                };
            });
        },

        async updateTagUsage(tagName, delta) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('tags', 'readwrite');
                const getRequest = store.get(tagName);

                getRequest.onerror = () => reject(getRequest.error);
                getRequest.onsuccess = () => {
                    const existing = getRequest.result;
                    if (existing) {
                        existing.usageCount = Math.max(0, existing.usageCount + delta);
                        if (existing.usageCount === 0) {
                            store.delete(tagName);
                        } else {
                            store.put(existing);
                        }
                        resolve(existing);
                    } else if (delta > 0) {
                        const newTag = { name: tagName, usageCount: delta };
                        store.add(newTag);
                        resolve(newTag);
                    } else {
                        resolve();
                    }
                };
            });
        },

        async getSetting(key) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('settings');
                const request = store.get(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result?.value);
            });
        },

        async setSetting(key, value) {
            return new Promise((resolve, reject) => {
                const store = this.transaction('settings', 'readwrite');
                const request = store.put({ key, value });
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        },

        async importPrompts(promptsData) {
            const results = [];
            for (const promptData of promptsData) {
                const prompt = await this.createPrompt({
                    title: promptData.title,
                    description: promptData.description,
                    tags: promptData.tags || []
                });

                for (const tag of prompt.tags) {
                    await this.updateTagUsage(tag, 1);
                }

                // Create all versions
                for (const versionData of (promptData.versions || [])) {
                    await this.createVersion({
                        promptId: prompt.id,
                        body: versionData.body,
                        versionNumber: versionData.versionNumber,
                        note: versionData.note
                    });
                }

                // Get all versions and find the one with highest versionNumber
                const allVersions = await this.getVersions(prompt.id);
                if (allVersions.length > 0) {
                    // getVersions returns sorted by versionNumber descending, so [0] is the latest
                    const latestVersion = allVersions[0];
                    await this.updatePrompt(prompt.id, { currentVersionId: latestVersion.id });
                }

                const updatedPrompt = await this.getPrompt(prompt.id);
                results.push(updatedPrompt);
            }
            return results;
        },

        async exportPrompt(promptId) {
            const prompt = await this.getPrompt(promptId);
            if (!prompt) return null;

            const versions = await this.getVersions(promptId);
            return {
                title: prompt.title,
                description: prompt.description,
                tags: prompt.tags,
                versions: versions.map(v => ({
                    body: v.body,
                    versionNumber: v.versionNumber,
                    note: v.note,
                    createdAt: new Date(v.createdAt).toISOString()
                }))
            };
        },

        async exportAllPrompts() {
            const prompts = await this.getAllPrompts();
            const exported = [];
            for (const prompt of prompts) {
                const data = await this.exportPrompt(prompt.id);
                if (data) exported.push(data);
            }
            return exported;
        }
    };

    // ========================================
    // Firebase Integration
    // ========================================
    const firebaseConfig = {
        apiKey: "AIzaSyAmt4mVNacdYyIt67lMQYpzgS4AFsgVLFg",
        authDomain: "promptshelf-75139.firebaseapp.com",
        projectId: "promptshelf-75139",
        storageBucket: "promptshelf-75139.firebasestorage.app",
        messagingSenderId: "160331377328",
        appId: "1:160331377328:web:792933eb3e090b9e982975",
        measurementId: "G-0KKG8DQGKS"
    };

    let firebaseApp = null;
    let firebaseAuth = null;
    let firebaseDb = null;

    const Firebase = {
        init() {
            if (typeof firebase === 'undefined') {
                console.warn('Firebase SDK not loaded');
                return false;
            }
            try {
                firebaseApp = firebase.initializeApp(firebaseConfig);
                firebaseAuth = firebase.auth();
                firebaseDb = firebase.firestore();
                return true;
            } catch (error) {
                console.error('Firebase init error:', error);
                return false;
            }
        },

        isInitialized() {
            return firebaseApp !== null;
        },

        async signUp(email, password) {
            if (!firebaseAuth) throw new Error('Firebase not initialized');
            const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            return userCredential.user;
        },

        async signIn(email, password) {
            if (!firebaseAuth) throw new Error('Firebase not initialized');
            const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
            return userCredential.user;
        },

        async signOut() {
            if (!firebaseAuth) throw new Error('Firebase not initialized');
            await firebaseAuth.signOut();
        },

        async signInWithGitHub() {
            if (!firebaseAuth) throw new Error('Firebase not initialized');
            const provider = new firebase.auth.GithubAuthProvider();
            provider.addScope('user:email');
            provider.setCustomParameters({ allow_signup: 'true' });
            const userCredential = await firebaseAuth.signInWithPopup(provider);
            return userCredential.user;
        },

        onAuthChange(callback) {
            if (!firebaseAuth) return () => {};
            return firebaseAuth.onAuthStateChanged(callback);
        },

        getCurrentUser() {
            return firebaseAuth?.currentUser || null;
        },

        generateApiKey() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            const segments = [];
            for (let s = 0; s < 4; s++) {
                let segment = '';
                for (let i = 0; i < 8; i++) {
                    segment += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                segments.push(segment);
            }
            return 'ps_' + segments.join('_');
        },

        async getOrCreateApiKey() {
            const user = this.getCurrentUser();
            if (!user || !firebaseDb) return null;

            const userDoc = firebaseDb.collection('users').doc(user.uid);
            const doc = await userDoc.get();

            if (doc.exists && doc.data().apiKey) {
                return doc.data().apiKey;
            }

            // Generate new API key
            const apiKey = this.generateApiKey();
            await userDoc.set({ apiKey }, { merge: true });
            return apiKey;
        },

        async regenerateApiKey() {
            const user = this.getCurrentUser();
            if (!user || !firebaseDb) return null;

            const apiKey = this.generateApiKey();
            const userDoc = firebaseDb.collection('users').doc(user.uid);
            await userDoc.set({ apiKey }, { merge: true });
            return apiKey;
        }
    };

    // ========================================
    // Cloud Database (Firestore) - Mirrors DB module exactly
    // ========================================
    const CloudDB = {
        getUserDoc() {
            const user = Firebase.getCurrentUser();
            if (!user || !firebaseDb) return null;
            return firebaseDb.collection('users').doc(user.uid);
        },

        // ========== PROMPTS ==========
        async getAllPrompts() {
            const userDoc = this.getUserDoc();
            if (!userDoc) return [];

            const snapshot = await userDoc.collection('prompts')
                .orderBy('updatedAt', 'desc')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        },

        async getPrompt(id) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return null;

            const doc = await userDoc.collection('prompts').doc(String(id)).get();
            if (!doc.exists) return null;

            return { id: doc.id, ...doc.data() };
        },

        async createPrompt(data) {
            const userDoc = this.getUserDoc();
            if (!userDoc) throw new Error('Not authenticated');

            const prompt = {
                title: data.title || 'Untitled Prompt',
                description: data.description || '',
                tags: data.tags || [],
                currentVersionId: null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const docRef = await userDoc.collection('prompts').add(prompt);
            return { id: docRef.id, ...prompt };
        },

        async updatePrompt(id, data) {
            const userDoc = this.getUserDoc();
            if (!userDoc) throw new Error('Not authenticated');

            const existing = await this.getPrompt(id);
            if (!existing) throw new Error('Prompt not found');

            const updated = { ...data, updatedAt: Date.now() };
            await userDoc.collection('prompts').doc(String(id)).update(updated);

            return { ...existing, ...updated };
        },

        async deletePrompt(id) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            // Delete all versions first
            const versions = await this.getVersions(id);
            for (const version of versions) {
                await this.deleteVersion(version.id);
            }

            // Delete the prompt
            await userDoc.collection('prompts').doc(String(id)).delete();
        },

        // Batch delete all prompts and versions (for import clear)
        async clearAllPrompts() {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            console.log('CloudDB.clearAllPrompts: Starting batch delete');

            // Get all prompts and versions
            const [promptsSnapshot, versionsSnapshot, tagsSnapshot] = await Promise.all([
                userDoc.collection('prompts').get(),
                userDoc.collection('versions').get(),
                userDoc.collection('tags').get()
            ]);

            console.log('CloudDB.clearAllPrompts: Deleting', promptsSnapshot.size, 'prompts,', versionsSnapshot.size, 'versions,', tagsSnapshot.size, 'tags');

            // Firestore batches have a limit of 500 operations
            const BATCH_LIMIT = 500;
            let batch = firebaseDb.batch();
            let operationCount = 0;

            const commitBatchIfNeeded = async () => {
                if (operationCount >= BATCH_LIMIT) {
                    await batch.commit();
                    batch = firebaseDb.batch();
                    operationCount = 0;
                }
            };

            // Delete all prompts
            for (const doc of promptsSnapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                await commitBatchIfNeeded();
            }

            // Delete all versions
            for (const doc of versionsSnapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                await commitBatchIfNeeded();
            }

            // Delete all tags
            for (const doc of tagsSnapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                await commitBatchIfNeeded();
            }

            // Commit remaining
            if (operationCount > 0) {
                await batch.commit();
            }

            console.log('CloudDB.clearAllPrompts: Done');
        },

        // ========== VERSIONS ==========
        async getVersions(promptId) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return [];

            const snapshot = await userDoc.collection('versions')
                .where('promptId', '==', String(promptId))
                .get();

            const versions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort by versionNumber descending (newest first)
            return versions.sort((a, b) => b.versionNumber - a.versionNumber);
        },

        async getVersion(id) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return null;

            const doc = await userDoc.collection('versions').doc(String(id)).get();
            if (!doc.exists) return null;

            return { id: doc.id, ...doc.data() };
        },

        async createVersion(data) {
            const userDoc = this.getUserDoc();
            if (!userDoc) throw new Error('Not authenticated');

            const version = {
                promptId: String(data.promptId),
                body: data.body || '',
                versionNumber: data.versionNumber || 1,
                note: data.note || '',
                createdAt: Date.now()
            };

            const docRef = await userDoc.collection('versions').add(version);
            return { id: docRef.id, ...version };
        },

        async deleteVersion(id) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            await userDoc.collection('versions').doc(String(id)).delete();
        },

        // ========== TAGS ==========
        async getAllTags() {
            const userDoc = this.getUserDoc();
            if (!userDoc) return [];

            const snapshot = await userDoc.collection('tags').get();
            const tags = snapshot.docs.map(doc => ({
                name: doc.id,
                ...doc.data()
            }));

            return tags.sort((a, b) => b.usageCount - a.usageCount);
        },

        async updateTagUsage(tagName, delta) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            const tagRef = userDoc.collection('tags').doc(tagName);
            const tagDoc = await tagRef.get();

            if (tagDoc.exists) {
                const existing = tagDoc.data();
                const newCount = Math.max(0, (existing.usageCount || 0) + delta);
                if (newCount === 0) {
                    await tagRef.delete();
                } else {
                    await tagRef.update({ usageCount: newCount });
                }
                return { name: tagName, usageCount: newCount };
            } else if (delta > 0) {
                const newTag = { usageCount: delta };
                await tagRef.set(newTag);
                return { name: tagName, usageCount: delta };
            }
        },

        // ========== SETTINGS ==========
        async getSetting(key) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return null;

            const doc = await userDoc.collection('settings').doc(key).get();
            return doc.exists ? doc.data().value : null;
        },

        async setSetting(key, value) {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            await userDoc.collection('settings').doc(key).set({ value });
        },

        // ========== IMPORT ==========
        async importPrompts(promptsData) {
            console.log('CloudDB.importPrompts: Starting import of', promptsData.length, 'prompts');
            const userDoc = this.getUserDoc();
            if (!userDoc) throw new Error('Not authenticated');

            const results = [];

            for (let i = 0; i < promptsData.length; i++) {
                const promptData = promptsData[i];
                console.log(`CloudDB.importPrompts: Processing prompt ${i + 1}/${promptsData.length}:`, promptData.title);

                try {
                    // Create prompt document
                    const promptRef = userDoc.collection('prompts').doc();
                    const promptId = promptRef.id;
                    const now = Date.now();

                    const promptDoc = {
                        title: promptData.title || 'Untitled',
                        description: promptData.description || '',
                        tags: promptData.tags || [],
                        currentVersionId: null,
                        createdAt: now,
                        updatedAt: now
                    };

                    // Create versions and track the latest
                    const versions = promptData.versions || [];
                    let latestVersionId = null;
                    let highestVersionNum = 0;

                    // Use batch write for speed
                    const batch = firebaseDb.batch();
                    batch.set(promptRef, promptDoc);

                    for (const versionData of versions) {
                        const versionRef = userDoc.collection('versions').doc();
                        const versionDoc = {
                            promptId: promptId,
                            body: versionData.body || '',
                            versionNumber: versionData.versionNumber || 1,
                            note: versionData.note || '',
                            createdAt: now
                        };
                        batch.set(versionRef, versionDoc);

                        if (versionDoc.versionNumber >= highestVersionNum) {
                            highestVersionNum = versionDoc.versionNumber;
                            latestVersionId = versionRef.id;
                        }
                    }

                    // Update prompt with currentVersionId
                    if (latestVersionId) {
                        batch.update(promptRef, { currentVersionId: latestVersionId });
                    }

                    // Commit the batch
                    await batch.commit();
                    console.log('CloudDB.importPrompts: Created prompt', promptId, 'with', versions.length, 'versions');

                    // Update tags (can't be batched easily due to read-modify-write)
                    for (const tag of (promptData.tags || [])) {
                        await this.updateTagUsage(tag, 1);
                    }

                    results.push({ id: promptId, ...promptDoc, currentVersionId: latestVersionId });
                } catch (err) {
                    console.error('CloudDB.importPrompts: Error importing prompt:', promptData.title, err);
                    throw err;
                }
            }

            console.log('CloudDB.importPrompts: Import complete, imported', results.length, 'prompts');
            return results;
        },

        async exportPrompt(promptId) {
            const prompt = await this.getPrompt(promptId);
            if (!prompt) return null;

            const versions = await this.getVersions(promptId);
            return {
                title: prompt.title,
                description: prompt.description,
                tags: prompt.tags,
                versions: versions.map(v => ({
                    body: v.body,
                    versionNumber: v.versionNumber,
                    note: v.note,
                    createdAt: new Date(v.createdAt).toISOString()
                }))
            };
        },

        async exportAllPrompts() {
            const prompts = await this.getAllPrompts();
            const exported = [];
            for (const prompt of prompts) {
                const data = await this.exportPrompt(prompt.id);
                if (data) exported.push(data);
            }
            return exported;
        },

        // ========== UTILITY ==========
        async clearAll() {
            const userDoc = this.getUserDoc();
            if (!userDoc) return;

            // Delete all prompts (which cascades to versions)
            const prompts = await this.getAllPrompts();
            for (const prompt of prompts) {
                await this.deletePrompt(prompt.id);
            }

            // Delete all tags
            const tags = await this.getAllTags();
            for (const tag of tags) {
                await userDoc.collection('tags').doc(tag.name).delete();
            }
        }
    };

    // ========================================
    // App Mode Detection
    // ========================================
    const AppMode = {
        isLocal() {
            // Running locally via file:// protocol
            return window.location.protocol === 'file:';
        },

        isWeb() {
            // Running on web (https:// or http://)
            return window.location.protocol.startsWith('http');
        },

        // Get the active database based on mode
        getDB() {
            // Local mode: use IndexedDB
            // Web mode: use CloudDB (requires login)
            return this.isLocal() ? DB : CloudDB;
        }
    };

    // ========================================
    // State Management
    // ========================================
    const state = {
        prompts: [],
        allTags: [],
        currentPromptId: null,
        currentVersion: null,
        versions: [],
        isDirty: false,
        darkMode: false,
        searchQuery: '',
        filterTags: [],
        showVersionHistory: false,
        editMode: false,
        user: null,
        syncStatus: 'idle', // 'idle' | 'syncing' | 'error'
        authMode: 'signin' // 'signin' | 'signup'
    };

    const listeners = new Set();

    const State = {
        get() { return { ...state }; },

        set(updates) {
            Object.assign(state, updates);
            listeners.forEach(fn => fn(state));
        },

        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        getCurrentPrompt() {
            return state.prompts.find(p => p.id === state.currentPromptId) || null;
        },

        getFilteredPrompts() {
            let filtered = state.prompts;

            if (state.filterTags.length > 0) {
                filtered = filtered.filter(p =>
                    state.filterTags.every(tag => p.tags?.includes(tag))
                );
            }

            if (state.searchQuery.trim()) {
                const query = state.searchQuery.toLowerCase();
                filtered = filtered.filter(p =>
                    p.title.toLowerCase().includes(query) ||
                    p.description?.toLowerCase().includes(query)
                );
            }

            return filtered;
        }
    };

    // ========================================
    // Utilities
    // ========================================
    const Utils = {
        debounce(fn, ms) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn.apply(this, args), ms);
            };
        },

        formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            if (diff < 60000) return 'Just now';
            if (diff < 3600000) {
                const mins = Math.floor(diff / 60000);
                return `${mins}m ago`;
            }
            if (diff < 86400000) {
                const hours = Math.floor(diff / 3600000);
                return `${hours}h ago`;
            }
            if (diff < 604800000) {
                const days = Math.floor(diff / 86400000);
                return `${days}d ago`;
            }

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        },

        formatFullDate(timestamp) {
            return new Date(timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        textDiff(oldText, newText) {
            const oldLines = (oldText || '').split('\n');
            const newLines = (newText || '').split('\n');
            const result = [];

            const lcs = this.computeLCS(oldLines, newLines);
            let oldIndex = 0, newIndex = 0, lcsIndex = 0;

            while (oldIndex < oldLines.length || newIndex < newLines.length) {
                if (lcsIndex < lcs.length && oldIndex < oldLines.length && oldLines[oldIndex] === lcs[lcsIndex]) {
                    if (newIndex < newLines.length && newLines[newIndex] === lcs[lcsIndex]) {
                        result.push({ type: 'unchanged', text: lcs[lcsIndex] });
                        oldIndex++; newIndex++; lcsIndex++;
                    } else {
                        result.push({ type: 'added', text: newLines[newIndex] });
                        newIndex++;
                    }
                } else if (oldIndex < oldLines.length && (lcsIndex >= lcs.length || oldLines[oldIndex] !== lcs[lcsIndex])) {
                    result.push({ type: 'removed', text: oldLines[oldIndex] });
                    oldIndex++;
                } else if (newIndex < newLines.length) {
                    result.push({ type: 'added', text: newLines[newIndex] });
                    newIndex++;
                }
            }

            return result;
        },

        computeLCS(arr1, arr2) {
            const m = arr1.length, n = arr2.length;
            const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    dp[i][j] = arr1[i-1] === arr2[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
                }
            }

            const lcs = [];
            let i = m, j = n;
            while (i > 0 && j > 0) {
                if (arr1[i-1] === arr2[j-1]) {
                    lcs.unshift(arr1[i-1]);
                    i--; j--;
                } else if (dp[i-1][j] > dp[i][j-1]) {
                    i--;
                } else {
                    j--;
                }
            }
            return lcs;
        },

        downloadFile(content, filename) {
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        validateImport(data) {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid JSON' };
            if (!data.prompts || !Array.isArray(data.prompts)) return { valid: false, error: 'Missing prompts array' };
            for (let i = 0; i < data.prompts.length; i++) {
                if (!data.prompts[i].title) return { valid: false, error: `Prompt ${i+1} missing title` };
            }
            return { valid: true };
        },

        saveDraft(promptId, data) {
            localStorage.setItem(`promptshelf_draft_${promptId}`, JSON.stringify({ ...data, savedAt: Date.now() }));
        },

        getDraft(promptId) {
            const data = localStorage.getItem(`promptshelf_draft_${promptId}`);
            return data ? JSON.parse(data) : null;
        },

        clearDraft(promptId) {
            localStorage.removeItem(`promptshelf_draft_${promptId}`);
        }
    };

    // ========================================
    // UI Rendering
    // ========================================
    const elements = {};

    const UI = {
        cacheElements() {
            elements.promptList = document.getElementById('prompt-list');
            elements.tagFilter = document.getElementById('tag-filter');
            elements.searchInput = document.getElementById('search-input');
            elements.editorEmpty = document.getElementById('editor-empty');
            elements.editorContent = document.getElementById('editor-content');
            elements.titleInput = document.getElementById('title-input');
            elements.descriptionInput = document.getElementById('description-input');
            elements.bodyInput = document.getElementById('body-input');
            elements.bodyDisplay = document.getElementById('body-display');
            elements.tagInput = document.getElementById('tag-input');
            elements.tagSuggestions = document.getElementById('tag-suggestions');
            elements.promptTags = document.getElementById('prompt-tags');
            elements.versionPanel = document.getElementById('version-panel');
            elements.versionList = document.getElementById('version-list');
            elements.currentVersionInfo = document.getElementById('current-version-info');
            elements.modal = document.getElementById('modal');
            elements.modalContent = document.getElementById('modal-content');
            elements.toast = document.getElementById('toast');
            elements.darkModeToggle = document.getElementById('dark-mode-toggle');
            elements.newPromptBtn = document.getElementById('new-prompt-btn');
            elements.saveBtn = document.getElementById('save-btn');
            elements.editBtn = document.getElementById('edit-btn');
            elements.cancelEditBtn = document.getElementById('cancel-edit-btn');
            elements.copyBtn = document.getElementById('copy-btn');
            elements.historyBtn = document.getElementById('history-btn');
            elements.deleteBtn = document.getElementById('delete-btn');
            elements.exportBtn = document.getElementById('export-btn');
            elements.importBtn = document.getElementById('import-btn');
            elements.importInput = document.getElementById('import-input');
            // Auth elements
            elements.authBtn = document.getElementById('auth-btn');
            elements.userMenu = document.getElementById('user-menu');
            elements.userMenuBtn = document.getElementById('user-menu-btn');
            elements.userDropdown = document.getElementById('user-dropdown');
            elements.userEmail = document.getElementById('user-email');
            elements.syncStatus = document.getElementById('sync-status');
            elements.syncNowBtn = document.getElementById('sync-now-btn');
            elements.logoutBtn = document.getElementById('logout-btn');
            elements.authModal = document.getElementById('auth-modal');
            elements.authForm = document.getElementById('auth-form');
            elements.authEmail = document.getElementById('auth-email');
            elements.authPassword = document.getElementById('auth-password');
            elements.authError = document.getElementById('auth-error');
            elements.authSubmitBtn = document.getElementById('auth-submit-btn');
            elements.authModalTitle = document.getElementById('auth-modal-title');
            elements.authSwitchText = document.getElementById('auth-switch-text');
            elements.authSwitchBtn = document.getElementById('auth-switch-btn');

            // Profile elements
            elements.profileBtn = document.getElementById('profile-btn');
            elements.profilePage = document.getElementById('profile-page');
            elements.profileBackBtn = document.getElementById('profile-back-btn');
            elements.profileAvatar = document.getElementById('profile-avatar');
            elements.profileName = document.getElementById('profile-name');
            elements.profileEmail = document.getElementById('profile-email');
            elements.profileInfoEmail = document.getElementById('profile-info-email');
            elements.profileCreated = document.getElementById('profile-created');
            elements.profileLastSignin = document.getElementById('profile-last-signin');
            elements.profileUid = document.getElementById('profile-uid');
            elements.profileProviders = document.getElementById('profile-providers');
            elements.profileApiKey = document.getElementById('profile-api-key');
            elements.copyApiKeyBtn = document.getElementById('copy-api-key-btn');
            elements.regenerateApiKeyBtn = document.getElementById('regenerate-api-key-btn');
            elements.profileSignoutBtn = document.getElementById('profile-signout-btn');
            elements.mcpConfigJson = document.getElementById('mcp-config-json');
            elements.copyMcpUrlBtn = document.getElementById('copy-mcp-url-btn');
            elements.copyMcpConfigBtn = document.getElementById('copy-mcp-config-btn');
        },

        getElements() { return elements; },

        renderPromptList(prompts, currentId) {
            if (!elements.promptList) return;

            if (prompts.length === 0) {
                elements.promptList.innerHTML = `
                    <div class="empty-list">
                        <p>No prompts yet</p>
                        <p class="hint">Create your first prompt</p>
                    </div>
                `;
                return;
            }

            elements.promptList.innerHTML = prompts.map(prompt => `
                <div class="prompt-item ${prompt.id === currentId ? 'active' : ''}" data-id="${prompt.id}">
                    <div class="prompt-item-title">${Utils.escapeHtml(prompt.title)}</div>
                    ${prompt.tags?.length ? `
                        <div class="prompt-item-tags">
                            ${prompt.tags.slice(0, 3).map(tag => `<span class="tag-chip small">${Utils.escapeHtml(tag)}</span>`).join('')}
                            ${prompt.tags.length > 3 ? `<span class="tag-more">+${prompt.tags.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                    <div class="prompt-item-date">${Utils.formatDate(prompt.updatedAt)}</div>
                </div>
            `).join('');
        },

        renderTagFilter(allTags, activeTags) {
            if (!elements.tagFilter) return;

            if (allTags.length === 0) {
                elements.tagFilter.classList.add('hidden');
                return;
            }

            elements.tagFilter.classList.remove('hidden');
            elements.tagFilter.innerHTML = `
                <div class="tag-filter-header">Filter by tag</div>
                <div class="tag-filter-chips">
                    ${allTags.map(tag => `
                        <button class="tag-chip filter ${activeTags.includes(tag.name) ? 'active' : ''}" data-tag="${Utils.escapeHtml(tag.name)}">
                            ${Utils.escapeHtml(tag.name)}
                        </button>
                    `).join('')}
                </div>
            `;
        },

        lastRenderedPromptId: null,
        lastRenderedVersionId: null,

        renderEditor(prompt, version, isDirty, editMode) {
            if (!elements.editorContent || !elements.editorEmpty) return;

            if (!prompt) {
                elements.editorEmpty.classList.remove('hidden');
                elements.editorContent.classList.add('hidden');
                this.lastRenderedPromptId = null;
                this.lastRenderedVersionId = null;
                return;
            }

            elements.editorEmpty.classList.add('hidden');
            elements.editorContent.classList.remove('hidden');

            // Only update input values when prompt/version actually changes
            const promptChanged = this.lastRenderedPromptId !== prompt.id;
            const versionChanged = this.lastRenderedVersionId !== version?.id;

            if (promptChanged || versionChanged) {
                elements.titleInput.value = prompt.title || '';
                elements.descriptionInput.value = prompt.description || '';
                elements.bodyInput.value = version?.body || '';
                this.lastRenderedPromptId = prompt.id;
                this.lastRenderedVersionId = version?.id;
            }

            // Set readonly state based on edit mode
            const readonly = !editMode;
            elements.titleInput.readOnly = readonly;
            elements.descriptionInput.readOnly = readonly;

            // Toggle between display (with placeholders highlighted) and textarea
            if (elements.bodyDisplay && elements.bodyInput) {
                if (editMode) {
                    elements.bodyDisplay.classList.add('hidden');
                    elements.bodyInput.classList.remove('hidden');
                } else {
                    elements.bodyInput.classList.add('hidden');
                    elements.bodyDisplay.classList.remove('hidden');
                    // Render body with highlighted placeholders (App.placeholderFills for temp fills)
                    elements.bodyDisplay.innerHTML = this.highlightPlaceholders(version?.body || '', App.placeholderFills || {});
                }
            }

            // Hide tag input container when not in edit mode
            const tagInputContainer = document.getElementById('tag-input-container');
            if (tagInputContainer) tagInputContainer.classList.toggle('hidden', readonly);

            // Toggle button visibility based on edit mode
            if (elements.editBtn) elements.editBtn.classList.toggle('hidden', editMode);
            if (elements.copyBtn) elements.copyBtn.classList.toggle('hidden', editMode);
            if (elements.saveBtn) elements.saveBtn.classList.toggle('hidden', !editMode);
            if (elements.cancelEditBtn) elements.cancelEditBtn.classList.toggle('hidden', !editMode);

            if (elements.saveBtn) {
                elements.saveBtn.disabled = !isDirty;
                elements.saveBtn.textContent = isDirty ? 'Save*' : 'Save';
            }

            if (elements.currentVersionInfo && version) {
                elements.currentVersionInfo.innerHTML = `
                    <span class="version-badge">v${version.versionNumber}</span>
                    <span class="version-date">${Utils.formatFullDate(version.createdAt)}</span>
                `;
            }
        },

        highlightPlaceholders(text, fills = {}) {
            if (!text) return '';
            // Escape HTML first, then highlight [placeholders]
            const escaped = Utils.escapeHtml(text);
            return escaped.replace(/\[([^\]]+)\]/g, (match) => {
                const filled = fills[match];
                if (filled) {
                    // Show filled value with different style
                    return `<span class="placeholder filled" data-placeholder="${Utils.escapeHtml(match)}">${Utils.escapeHtml(filled)}</span>`;
                }
                return `<span class="placeholder" data-placeholder="${Utils.escapeHtml(match)}">${match}</span>`;
            });
        },

        renderPromptTags(tags, editMode) {
            if (!elements.promptTags) return;
            elements.promptTags.innerHTML = tags.map(tag => `
                <span class="tag-chip ${editMode ? 'editable' : ''}" data-tag="${Utils.escapeHtml(tag)}">
                    ${Utils.escapeHtml(tag)}
                    ${editMode ? `<button class="tag-remove" data-tag="${Utils.escapeHtml(tag)}">&times;</button>` : ''}
                </span>
            `).join('');
        },

        renderTagSuggestions(suggestions, query) {
            if (!elements.tagSuggestions) return;

            if (!query || suggestions.length === 0) {
                elements.tagSuggestions.classList.add('hidden');
                return;
            }

            elements.tagSuggestions.classList.remove('hidden');
            elements.tagSuggestions.innerHTML = suggestions.map(tag => `
                <button class="tag-suggestion" data-tag="${Utils.escapeHtml(tag.name)}">
                    ${Utils.escapeHtml(tag.name)}
                </button>
            `).join('');
        },

        renderVersionHistory(versions, currentVersionId) {
            if (!elements.versionList) return;

            if (versions.length === 0) {
                elements.versionList.innerHTML = '<p class="empty-versions">No versions yet</p>';
                return;
            }

            elements.versionList.innerHTML = versions.map(version => `
                <div class="version-item ${version.id === currentVersionId ? 'current' : ''}">
                    <div class="version-info">
                        <span class="version-badge">v${version.versionNumber}</span>
                        <span class="version-date">${Utils.formatFullDate(version.createdAt)}</span>
                        ${version.note ? `<span class="version-note">${Utils.escapeHtml(version.note)}</span>` : ''}
                    </div>
                    <div class="version-actions">
                        ${version.id !== currentVersionId ? `
                            <button class="btn-small" data-action="restore" data-version-id="${version.id}">Restore</button>
                        ` : ''}
                        ${versions.length > 1 ? `
                            <button class="btn-small secondary" data-action="compare" data-version-id="${version.id}">Compare</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        },

        showVersionPanel(show) {
            if (elements.versionPanel) elements.versionPanel.classList.toggle('hidden', !show);
            if (elements.historyBtn) elements.historyBtn.classList.toggle('active', show);
        },

        renderDiffModal(oldVersion, newVersion) {
            const diff = Utils.textDiff(oldVersion.body, newVersion.body);
            const diffHtml = diff.map(line => {
                const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
                return `<div class="diff-line ${line.type}"><span class="diff-prefix">${prefix}</span><span class="diff-text">${Utils.escapeHtml(line.text)}</span></div>`;
            }).join('');

            this.showModal(`
                <div class="diff-modal">
                    <div class="diff-header">
                        <h3>Version Comparison</h3>
                        <div class="diff-versions">
                            <span class="version-badge">v${oldVersion.versionNumber}</span>
                            <span class="diff-arrow">→</span>
                            <span class="version-badge">v${newVersion.versionNumber}</span>
                        </div>
                    </div>
                    <div class="diff-content">
                        <div class="diff-legend">
                            <span class="diff-legend-item added">+ Added</span>
                            <span class="diff-legend-item removed">- Removed</span>
                        </div>
                        <div class="diff-body">${diffHtml || '<p class="no-changes">No changes</p>'}</div>
                    </div>
                    <div class="diff-footer">
                        <button class="btn" data-action="close-modal">Close</button>
                    </div>
                </div>
            `);
        },

        showModal(content) {
            if (!elements.modal) return;
            elements.modalContent.innerHTML = content;
            elements.modal.classList.remove('hidden');
            document.body.classList.add('modal-open');
        },

        hideModal() {
            if (!elements.modal) return;
            elements.modal.classList.add('hidden');
            document.body.classList.remove('modal-open');
        },

        showConfirmDialog(message, onConfirm) {
            this.showModal(`
                <div class="confirm-dialog">
                    <p>${Utils.escapeHtml(message)}</p>
                    <div class="confirm-actions">
                        <button class="btn secondary" data-action="close-modal">Cancel</button>
                        <button class="btn danger" id="confirm-action-btn">Delete</button>
                    </div>
                </div>
            `);

            document.getElementById('confirm-action-btn').onclick = () => {
                this.hideModal();
                onConfirm();
            };
        },

        showVersionNoteDialog(onSave) {
            this.showModal(`
                <div class="version-note-dialog">
                    <h3>Save as New Version</h3>
                    <p>Add an optional note for this version:</p>
                    <textarea id="version-note-input" placeholder="What changed?" rows="3"></textarea>
                    <div class="dialog-actions">
                        <button class="btn secondary" data-action="close-modal">Cancel</button>
                        <button class="btn primary" id="save-version-note-btn">Save Version</button>
                    </div>
                </div>
            `);

            const saveBtn = document.getElementById('save-version-note-btn');
            const noteInput = document.getElementById('version-note-input');
            noteInput.focus();

            saveBtn.onclick = () => {
                this.hideModal();
                onSave(noteInput.value.trim());
            };
        },

        showToast(message, type = 'info') {
            if (!elements.toast) return;
            clearTimeout(this.toastTimeout);
            elements.toast.textContent = message;
            elements.toast.className = `toast ${type}`;
            elements.toast.classList.remove('hidden');
            this.toastTimeout = setTimeout(() => elements.toast.classList.add('hidden'), 3000);
        },

        setDarkMode(enabled) {
            document.body.classList.toggle('dark', enabled);
            if (elements.darkModeToggle) {
                elements.darkModeToggle.innerHTML = enabled ?
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' :
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            }
        },

        // Auth UI Methods
        renderAuthState(user, syncStatus) {
            if (user) {
                // User is logged in - show user menu, hide auth button
                if (elements.authBtn) elements.authBtn.classList.add('hidden');
                if (elements.userMenu) elements.userMenu.classList.remove('hidden');
                if (elements.userEmail) elements.userEmail.textContent = user.email;

                // Update sync status
                if (elements.syncStatus) {
                    elements.syncStatus.className = 'sync-status';
                    if (syncStatus === 'syncing') {
                        elements.syncStatus.classList.add('syncing');
                        elements.syncStatus.textContent = 'Syncing...';
                    } else if (syncStatus === 'error') {
                        elements.syncStatus.classList.add('error');
                        elements.syncStatus.textContent = 'Sync error';
                    } else {
                        elements.syncStatus.textContent = 'Synced';
                    }
                }
            } else {
                // User is logged out - show auth button, hide user menu
                if (elements.authBtn) elements.authBtn.classList.remove('hidden');
                if (elements.userMenu) elements.userMenu.classList.add('hidden');
            }
        },

        showAuthModal(mode = 'signin') {
            if (!elements.authModal) return;

            elements.authModal.classList.remove('hidden');
            document.body.classList.add('modal-open');

            // Reset form
            if (elements.authForm) elements.authForm.reset();
            if (elements.authError) elements.authError.classList.add('hidden');

            this.updateAuthMode(mode);
            elements.authEmail?.focus();
        },

        hideAuthModal() {
            if (!elements.authModal) return;
            elements.authModal.classList.add('hidden');
            document.body.classList.remove('modal-open');
        },

        updateAuthMode(mode) {
            if (elements.authModalTitle) {
                elements.authModalTitle.textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
            }
            if (elements.authSubmitBtn) {
                elements.authSubmitBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
            }
            if (elements.authSwitchText) {
                elements.authSwitchText.textContent = mode === 'signup'
                    ? 'Already have an account?'
                    : "Don't have an account?";
            }
            if (elements.authSwitchBtn) {
                elements.authSwitchBtn.textContent = mode === 'signup' ? 'Sign In' : 'Sign Up';
            }
        },

        showAuthError(message) {
            if (elements.authError) {
                elements.authError.textContent = message;
                elements.authError.classList.remove('hidden');
            }
        },

        hideAuthError() {
            if (elements.authError) {
                elements.authError.classList.add('hidden');
            }
        },

        setAuthLoading(loading) {
            if (elements.authSubmitBtn) {
                elements.authSubmitBtn.disabled = loading;
                elements.authSubmitBtn.classList.toggle('loading', loading);
            }
        },

        showUserDropdown() {
            if (elements.userDropdown) {
                elements.userDropdown.classList.remove('hidden');
            }
        },

        hideUserDropdown() {
            if (elements.userDropdown) {
                elements.userDropdown.classList.add('hidden');
            }
        },

        toggleUserDropdown() {
            if (elements.userDropdown) {
                elements.userDropdown.classList.toggle('hidden');
            }
        },

        // Profile Page Methods
        showProfilePage(pushState = true) {
            if (elements.profilePage) {
                elements.profilePage.classList.remove('hidden');
                this.renderProfileData();
            }
            if (elements.appContainer) {
                elements.appContainer.classList.add('hidden');
            }
            if (pushState) {
                history.pushState({ page: 'profile' }, '', '/profile');
            }
            this.hideUserDropdown();
        },

        hideProfilePage(pushState = true) {
            if (elements.profilePage) {
                elements.profilePage.classList.add('hidden');
            }
            if (elements.appContainer) {
                elements.appContainer.classList.remove('hidden');
            }
            if (pushState) {
                history.pushState({ page: 'home' }, '', '/');
            }
        },

        handleRoute() {
            const path = window.location.pathname;
            if (path === '/profile') {
                this.showProfilePage(false);
            } else {
                this.hideProfilePage(false);
            }
        },

        renderProfileData() {
            const user = Firebase.getCurrentUser();
            if (!user) return;

            // Avatar
            if (elements.profileAvatar) {
                if (user.photoURL) {
                    elements.profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="Profile">`;
                } else {
                    elements.profileAvatar.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>`;
                }
            }

            // Name and email
            if (elements.profileName) {
                elements.profileName.textContent = user.displayName || 'User';
            }
            if (elements.profileEmail) {
                elements.profileEmail.textContent = user.email || '';
            }
            if (elements.profileInfoEmail) {
                elements.profileInfoEmail.textContent = user.email || 'Not set';
            }

            // Account dates
            if (elements.profileCreated) {
                const createdDate = user.metadata?.creationTime;
                elements.profileCreated.textContent = createdDate
                    ? new Date(createdDate).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric'
                    })
                    : 'Unknown';
            }
            if (elements.profileLastSignin) {
                const lastSignIn = user.metadata?.lastSignInTime;
                elements.profileLastSignin.textContent = lastSignIn
                    ? new Date(lastSignIn).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    })
                    : 'Unknown';
            }

            // User ID
            if (elements.profileUid) {
                elements.profileUid.textContent = user.uid;
            }

            // Providers
            if (elements.profileProviders) {
                const providers = user.providerData || [];
                const providerTypes = {
                    'password': { name: 'Email & Password', icon: this.getEmailIcon() },
                    'github.com': { name: 'GitHub', icon: this.getGitHubIcon() },
                    'google.com': { name: 'Google', icon: this.getGoogleIcon() }
                };

                const hasPassword = providers.some(p => p.providerId === 'password');
                const hasGitHub = providers.some(p => p.providerId === 'github.com');

                let html = '';

                // Email/Password provider
                html += `
                    <div class="provider-item">
                        <div class="provider-info">
                            <div class="provider-icon">${providerTypes['password'].icon}</div>
                            <span class="provider-name">${providerTypes['password'].name}</span>
                        </div>
                        <span class="provider-status ${hasPassword ? 'connected' : 'not-connected'}">
                            ${hasPassword ? 'Connected' : 'Not connected'}
                        </span>
                    </div>`;

                // GitHub provider
                html += `
                    <div class="provider-item">
                        <div class="provider-info">
                            <div class="provider-icon">${providerTypes['github.com'].icon}</div>
                            <span class="provider-name">${providerTypes['github.com'].name}</span>
                        </div>
                        <span class="provider-status ${hasGitHub ? 'connected' : 'not-connected'}">
                            ${hasGitHub ? 'Connected' : 'Not connected'}
                        </span>
                    </div>`;

                elements.profileProviders.innerHTML = html;
            }

            // Load API Key
            this.loadApiKey();
        },

        async loadApiKey() {
            if (elements.profileApiKey) {
                elements.profileApiKey.textContent = 'Loading...';
                try {
                    const apiKey = await Firebase.getOrCreateApiKey();
                    elements.profileApiKey.textContent = apiKey || 'Error loading key';

                    // Update MCP config with the API key
                    if (elements.mcpConfigJson && apiKey) {
                        const mcpConfig = {
                            mcpServers: {
                                promptshelf: {
                                    url: "https://us-central1-promptshelf-75139.cloudfunctions.net/mcp",
                                    headers: {
                                        Authorization: `Bearer ${apiKey}`
                                    }
                                }
                            }
                        };
                        elements.mcpConfigJson.textContent = JSON.stringify(mcpConfig, null, 2);
                    }
                } catch (error) {
                    console.error('Failed to load API key:', error);
                    elements.profileApiKey.textContent = 'Error loading key';
                }
            }
        },

        async copyApiKey() {
            const apiKey = elements.profileApiKey?.textContent;
            if (apiKey && apiKey !== 'Loading...' && apiKey !== 'Error loading key') {
                try {
                    await navigator.clipboard.writeText(apiKey);
                    UI.showToast('API key copied!');
                } catch (error) {
                    console.error('Failed to copy:', error);
                    UI.showToast('Failed to copy', 'error');
                }
            }
        },

        async regenerateApiKey() {
            if (elements.profileApiKey) {
                elements.profileApiKey.textContent = 'Generating...';
                try {
                    const apiKey = await Firebase.regenerateApiKey();
                    elements.profileApiKey.textContent = apiKey || 'Error generating key';
                    UI.showToast('API key regenerated!');
                } catch (error) {
                    console.error('Failed to regenerate API key:', error);
                    elements.profileApiKey.textContent = 'Error generating key';
                    UI.showToast('Failed to regenerate', 'error');
                }
            }
        },

        getEmailIcon() {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
            </svg>`;
        },

        getGitHubIcon() {
            return `<svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>`;
        },

        getGoogleIcon() {
            return `<svg viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>`;
        }
    };

    // ========================================
    // App Controller
    // ========================================
    const autoSave = Utils.debounce(() => {
        const s = State.get();
        if (s.currentPromptId && s.isDirty) {
            Utils.saveDraft(s.currentPromptId, {
                title: elements.titleInput?.value || '',
                description: elements.descriptionInput?.value || '',
                body: elements.bodyInput?.value || ''
            });
        }
    }, 2000);

    const App = {
        loginMode: 'signin', // 'signin' or 'signup'

        async init() {
            try {
                UI.cacheElements();

                // Cache screen elements
                elements.loadingScreen = document.getElementById('loading-screen');
                elements.loginScreen = document.getElementById('login-screen');
                elements.appContainer = document.getElementById('app-container');

                // Cache login form elements
                elements.loginForm = document.getElementById('login-form');
                elements.loginEmail = document.getElementById('login-email');
                elements.loginPassword = document.getElementById('login-password');
                elements.loginError = document.getElementById('login-error');
                elements.loginSubmitBtn = document.getElementById('login-submit-btn');
                elements.loginSwitchText = document.getElementById('login-switch-text');
                elements.loginSwitchBtn = document.getElementById('login-switch-btn');
                elements.githubLoginBtn = document.getElementById('github-login-btn');

                // Cache landing page elements
                elements.loginModal = document.getElementById('login-modal');
                elements.closeLoginModal = document.getElementById('close-login-modal');
                elements.heroGetStarted = document.getElementById('hero-get-started');
                elements.ctaGetStarted = document.getElementById('cta-get-started');

                // Bind login form events
                this.bindLoginEvents();

                // Initialize Firebase
                Firebase.init();

                // Local mode: use IndexedDB, no login required
                if (AppMode.isLocal()) {
                    await DB.init();
                    await this.loadData();
                    this.hideLoading();
                    this.showApp();

                    State.subscribe(() => this.render());
                    this.bindEvents();
                    this.render();
                } else {
                    // Web mode: require login - wait for auth state
                    await DB.init();

                    // Set up auth state listener
                    Firebase.onAuthChange(async (user) => {
                        State.set({ user });

                        if (user) {
                            // User logged in - load data then show app
                            await this.loadData();
                            this.hideLoading();
                            this.showApp();
                            UI.handleRoute(); // Handle /profile route
                        } else {
                            // User logged out - show login screen
                            this.hideLoading();
                            this.showLoginScreen();
                        }
                    });

                    State.subscribe(() => this.render());
                    this.bindEvents();
                    this.render();
                }
            } catch (error) {
                console.error('Failed to initialize:', error);
                this.hideLoading();
                UI.showToast('Failed to initialize app', 'error');
            }
        },

        bindLoginEvents() {
            // Form submission
            elements.loginForm?.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLoginSubmit();
            });

            // Toggle between sign in and sign up
            elements.loginSwitchBtn?.addEventListener('click', () => {
                this.toggleLoginMode();
            });

            // GitHub login
            elements.githubLoginBtn?.addEventListener('click', async () => {
                await this.handleGitHubLogin();
            });

            // Landing page - Get Started buttons
            elements.heroGetStarted?.addEventListener('click', () => {
                this.showLoginModal();
            });
            elements.ctaGetStarted?.addEventListener('click', () => {
                this.showLoginModal();
            });

            // Close login modal
            elements.closeLoginModal?.addEventListener('click', () => {
                this.hideLoginModal();
            });

            // Close modal on backdrop click
            elements.loginModal?.addEventListener('click', (e) => {
                if (e.target === elements.loginModal) {
                    this.hideLoginModal();
                }
            });
        },

        showLoginModal() {
            elements.loginModal?.classList.remove('hidden');
            document.body.classList.add('modal-open');
        },

        hideLoginModal() {
            elements.loginModal?.classList.add('hidden');
            document.body.classList.remove('modal-open');
        },

        async handleLoginSubmit() {
            const email = elements.loginEmail?.value.trim();
            const password = elements.loginPassword?.value;

            if (!email || !password) {
                this.showLoginError('Please fill in all fields');
                return;
            }

            // Disable button and show loading
            elements.loginSubmitBtn.disabled = true;
            elements.loginSubmitBtn.textContent = this.loginMode === 'signin' ? 'Signing In...' : 'Creating Account...';
            this.hideLoginError();

            try {
                if (this.loginMode === 'signin') {
                    await Firebase.signIn(email, password);
                } else {
                    await Firebase.signUp(email, password);
                }
                // Auth state listener will handle the rest
            } catch (error) {
                console.error('Auth error:', error);
                this.showLoginError(this.getAuthErrorMessage(error.code));
                elements.loginSubmitBtn.disabled = false;
                elements.loginSubmitBtn.textContent = this.loginMode === 'signin' ? 'Sign In' : 'Sign Up';
            }
        },

        async handleGitHubLogin() {
            elements.githubLoginBtn.disabled = true;
            this.hideLoginError();

            try {
                await Firebase.signInWithGitHub();
            } catch (error) {
                console.error('GitHub auth error:', error);
                this.showLoginError(this.getAuthErrorMessage(error.code));
                elements.githubLoginBtn.disabled = false;
            }
        },

        getAuthErrorMessage(code) {
            const messages = {
                'auth/invalid-email': 'Invalid email address',
                'auth/user-disabled': 'This account has been disabled',
                'auth/user-not-found': 'No account found with this email',
                'auth/wrong-password': 'Incorrect password',
                'auth/email-already-in-use': 'An account already exists with this email',
                'auth/weak-password': 'Password should be at least 6 characters',
                'auth/invalid-credential': 'Invalid email or password',
                'auth/too-many-requests': 'Too many attempts. Please try again later',
                'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method',
                'auth/popup-closed-by-user': 'Sign-in popup was closed'
            };
            return messages[code] || 'Authentication failed. Please try again.';
        },

        showLoginError(message) {
            if (elements.loginError) {
                elements.loginError.textContent = message;
                elements.loginError.classList.remove('hidden');
            }
        },

        hideLoginError() {
            if (elements.loginError) {
                elements.loginError.classList.add('hidden');
            }
        },

        toggleLoginMode() {
            this.loginMode = this.loginMode === 'signin' ? 'signup' : 'signin';

            if (this.loginMode === 'signin') {
                elements.loginSubmitBtn.textContent = 'Sign In';
                elements.loginSwitchText.textContent = "Don't have an account?";
                elements.loginSwitchBtn.textContent = 'Sign Up';
            } else {
                elements.loginSubmitBtn.textContent = 'Sign Up';
                elements.loginSwitchText.textContent = 'Already have an account?';
                elements.loginSwitchBtn.textContent = 'Sign In';
            }

            this.hideLoginError();
            elements.loginPassword.value = '';
        },

        hideLoading() {
            if (elements.loadingScreen) elements.loadingScreen.classList.add('hidden');
        },

        showLoginScreen() {
            if (elements.loadingScreen) elements.loadingScreen.classList.add('hidden');
            if (elements.loginScreen) elements.loginScreen.classList.remove('hidden');
            if (elements.appContainer) elements.appContainer.classList.add('hidden');
        },

        showApp() {
            if (elements.loadingScreen) elements.loadingScreen.classList.add('hidden');
            if (elements.loginScreen) elements.loginScreen.classList.add('hidden');
            if (elements.appContainer) elements.appContainer.classList.remove('hidden');
        },

        async loadData() {
            try {
                const activeDB = AppMode.getDB();
                const [prompts, tags, darkMode] = await Promise.all([
                    activeDB.getAllPrompts(),
                    activeDB.getAllTags(),
                    activeDB.getSetting('darkMode')
                ]);

                State.set({
                    prompts,
                    allTags: tags,
                    darkMode: darkMode || false,
                    currentPromptId: null,
                    currentVersion: null,
                    versions: [],
                    isDirty: false,
                    showVersionHistory: false,
                    editMode: false
                });
                UI.setDarkMode(State.get().darkMode);

                if (prompts.length > 0) {
                    await this.selectPrompt(prompts[0].id);
                }
            } catch (error) {
                console.error('Failed to load data:', error);
                UI.showToast('Failed to load data', 'error');
            }
        },

        render() {
            const s = State.get();
            const filteredPrompts = State.getFilteredPrompts();
            const currentPrompt = State.getCurrentPrompt();

            UI.renderPromptList(filteredPrompts, s.currentPromptId);
            UI.renderTagFilter(s.allTags, s.filterTags);
            UI.renderEditor(currentPrompt, s.currentVersion, s.isDirty, s.editMode);
            UI.renderAuthState(s.user, s.syncStatus);

            if (currentPrompt) {
                UI.renderPromptTags(currentPrompt.tags || [], s.editMode);
            }

            if (s.showVersionHistory) {
                UI.renderVersionHistory(s.versions, currentPrompt?.currentVersionId);
            }
        },

        bindEvents() {
            elements.newPromptBtn?.addEventListener('click', () => this.handleNewPrompt());

            elements.searchInput?.addEventListener('input', (e) => {
                State.set({ searchQuery: e.target.value });
            });

            elements.promptList?.addEventListener('click', (e) => {
                const item = e.target.closest('.prompt-item');
                if (item) this.selectPrompt(item.dataset.id);
            });

            elements.tagFilter?.addEventListener('click', (e) => {
                const chip = e.target.closest('.tag-chip');
                if (chip) this.handleFilterByTag(chip.dataset.tag);
            });

            const trackDirty = () => {
                State.set({ isDirty: true });
                autoSave();
            };
            elements.titleInput?.addEventListener('input', trackDirty);
            elements.descriptionInput?.addEventListener('input', trackDirty);
            elements.bodyInput?.addEventListener('input', trackDirty);

            elements.tagInput?.addEventListener('input', (e) => this.handleTagInputChange(e));
            elements.tagInput?.addEventListener('keydown', (e) => this.handleTagInputKeydown(e));
            elements.tagInput?.addEventListener('blur', () => {
                setTimeout(() => UI.renderTagSuggestions([], ''), 200);
            });

            elements.tagSuggestions?.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.tag-suggestion');
                if (suggestion) this.handleAddTag(suggestion.dataset.tag);
            });

            elements.promptTags?.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.tag-remove');
                if (removeBtn) this.handleRemoveTag(removeBtn.dataset.tag);
            });

            elements.saveBtn?.addEventListener('click', () => this.handleSave());
            elements.editBtn?.addEventListener('click', () => this.handleEnterEditMode());
            elements.cancelEditBtn?.addEventListener('click', () => this.handleCancelEdit());
            elements.copyBtn?.addEventListener('click', () => this.handleCopy());
            elements.historyBtn?.addEventListener('click', () => this.handleToggleHistory());
            elements.deleteBtn?.addEventListener('click', () => this.handleDelete());
            elements.exportBtn?.addEventListener('click', () => this.handleExport());
            elements.importBtn?.addEventListener('click', () => elements.importInput?.click());
            elements.importInput?.addEventListener('change', (e) => this.handleImport(e));
            elements.darkModeToggle?.addEventListener('click', () => this.handleToggleDarkMode());

            // Auth events
            elements.authBtn?.addEventListener('click', () => this.handleShowAuthModal());
            elements.userMenuBtn?.addEventListener('click', () => UI.toggleUserDropdown());
            elements.logoutBtn?.addEventListener('click', () => this.handleLogout());
            elements.syncNowBtn?.addEventListener('click', () => this.handleSyncNow());
            elements.profileBtn?.addEventListener('click', () => UI.showProfilePage());
            elements.profileBackBtn?.addEventListener('click', () => UI.hideProfilePage());
            elements.profileSignoutBtn?.addEventListener('click', () => this.handleLogout());
            elements.copyApiKeyBtn?.addEventListener('click', () => UI.copyApiKey());
            elements.regenerateApiKeyBtn?.addEventListener('click', () => {
                if (confirm('Are you sure you want to regenerate your API key? The old key will stop working.')) {
                    UI.regenerateApiKey();
                }
            });
            elements.copyMcpUrlBtn?.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText('https://us-central1-promptshelf-75139.cloudfunctions.net/mcp');
                    UI.showToast('MCP URL copied!');
                } catch (error) {
                    UI.showToast('Failed to copy', 'error');
                }
            });
            elements.copyMcpConfigBtn?.addEventListener('click', async () => {
                const config = elements.mcpConfigJson?.textContent;
                if (config && config !== 'Loading...') {
                    try {
                        await navigator.clipboard.writeText(config);
                        UI.showToast('MCP config copied!');
                    } catch (error) {
                        UI.showToast('Failed to copy', 'error');
                    }
                }
            });

            // Handle browser back/forward for routing
            window.addEventListener('popstate', () => UI.handleRoute());
            elements.authForm?.addEventListener('submit', (e) => this.handleAuthSubmit(e));
            elements.authSwitchBtn?.addEventListener('click', () => this.handleAuthModeSwitch());
            elements.authModal?.addEventListener('click', (e) => {
                if (e.target === elements.authModal || e.target.closest('[data-action="close-auth-modal"]')) {
                    UI.hideAuthModal();
                }
            });

            // Close user dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#user-menu')) {
                    UI.hideUserDropdown();
                }
            });

            // Click on placeholder to edit it
            elements.bodyDisplay?.addEventListener('click', (e) => {
                const placeholder = e.target.closest('.placeholder');
                if (placeholder) {
                    this.handlePlaceholderClick(placeholder.dataset.placeholder);
                }
            });

            elements.modal?.addEventListener('click', (e) => {
                if (e.target === elements.modal || e.target.closest('[data-action="close-modal"]')) {
                    UI.hideModal();
                }
            });

            elements.versionList?.addEventListener('click', async (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const versionId = btn.dataset.versionId;
                if (!versionId) return;
                // Handle both string (Firestore) and number (IndexedDB) IDs
                const parsedId = /^\d+$/.test(versionId) ? parseInt(versionId, 10) : versionId;
                if (btn.dataset.action === 'restore') await this.handleRestore(parsedId);
                else if (btn.dataset.action === 'compare') await this.handleCompare(parsedId);
            });

            document.addEventListener('keydown', (e) => this.handleKeyboardShortcut(e));
        },

        async handleNewPrompt() {
            try {
                const activeDB = AppMode.getDB();
                const prompt = await activeDB.createPrompt({ title: 'Untitled Prompt' });
                const version = await activeDB.createVersion({ promptId: prompt.id, body: '', versionNumber: 1 });
                await activeDB.updatePrompt(prompt.id, { currentVersionId: version.id });

                const prompts = await activeDB.getAllPrompts();
                State.set({ prompts });
                await this.selectPrompt(prompt.id);

                // Enter edit mode for new prompt
                State.set({ editMode: true });
                elements.titleInput?.focus();
                elements.titleInput?.select();
                UI.showToast('Prompt created');
            } catch (error) {
                console.error('Failed to create prompt:', error);
                UI.showToast('Failed to create prompt', 'error');
            }
        },

        async selectPrompt(id) {
            try {
                const activeDB = AppMode.getDB();

                // Fetch prompt and versions in parallel for speed
                const [prompt, versions] = await Promise.all([
                    activeDB.getPrompt(id),
                    activeDB.getVersions(id)
                ]);

                if (!prompt) return;

                // Clear temporary placeholder fills when switching prompts
                this.placeholderFills = {};

                const currentVersion = versions.find(v => v.id === prompt.currentVersionId) || versions[0];

                State.set({
                    currentPromptId: id,
                    currentVersion,
                    versions,
                    isDirty: false,
                    showVersionHistory: false,
                    editMode: false
                });

                UI.showVersionPanel(false);
            } catch (error) {
                console.error('Failed to select prompt:', error);
                UI.showToast('Failed to load prompt', 'error');
            }
        },

        async handleSave() {
            const s = State.get();
            if (!s.currentPromptId || !s.isDirty) return;

            try {
                const activeDB = AppMode.getDB();
                const title = elements.titleInput?.value.trim() || 'Untitled Prompt';
                const description = elements.descriptionInput?.value.trim() || '';
                const body = elements.bodyInput?.value || '';

                await activeDB.updatePrompt(s.currentPromptId, { title, description });

                // Always create a new version on save
                const versions = await activeDB.getVersions(s.currentPromptId);
                const maxVersion = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);

                const newVersion = await activeDB.createVersion({
                    promptId: s.currentPromptId,
                    body,
                    versionNumber: maxVersion + 1
                });

                await activeDB.updatePrompt(s.currentPromptId, { currentVersionId: newVersion.id });
                Utils.clearDraft(s.currentPromptId);

                const [updatedPrompts, updatedVersions] = await Promise.all([
                    activeDB.getAllPrompts(),
                    activeDB.getVersions(s.currentPromptId)
                ]);

                State.set({ prompts: updatedPrompts, versions: updatedVersions, currentVersion: newVersion, isDirty: false });
                UI.showToast(`Saved v${newVersion.versionNumber}`);
                // Exit edit mode after save
                State.set({ editMode: false });
            } catch (error) {
                console.error('Failed to save:', error);
                UI.showToast('Failed to save', 'error');
            }
        },

        handleEnterEditMode() {
            State.set({ editMode: true });
        },

        // Temporary placeholder fills (not saved, just for copying)
        placeholderFills: {},

        handlePlaceholderClick(placeholderText) {
            // Show inline input to fill the placeholder temporarily
            const placeholder = document.querySelector(`.placeholder[data-placeholder="${CSS.escape(placeholderText)}"]`);
            if (!placeholder) return;

            // Create inline input
            const currentValue = this.placeholderFills[placeholderText] || placeholderText.slice(1, -1); // Remove brackets for default
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'placeholder-input';
            input.value = currentValue === placeholderText.slice(1, -1) ? '' : currentValue;
            input.placeholder = placeholderText.slice(1, -1);

            // Replace placeholder with input
            placeholder.replaceWith(input);
            input.focus();
            input.select();

            const finishEdit = () => {
                const value = input.value.trim();
                if (value) {
                    // Store the fill value
                    this.placeholderFills[placeholderText] = value;
                } else {
                    // Remove fill if empty
                    delete this.placeholderFills[placeholderText];
                }
                // Re-render the body display
                this.refreshBodyDisplay();
            };

            input.addEventListener('blur', finishEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    delete this.placeholderFills[placeholderText];
                    input.blur();
                }
            });
        },

        refreshBodyDisplay() {
            const s = State.get();
            if (!s.currentVersion?.id || s.editMode) return;

            const activeDB = AppMode.getDB();
            activeDB.getVersion(s.currentVersion.id).then(version => {
                if (version && elements.bodyDisplay) {
                    elements.bodyDisplay.innerHTML = UI.highlightPlaceholders(version.body || '', this.placeholderFills);
                }
            });
        },

        clearPlaceholderFills() {
            this.placeholderFills = {};
        },

        handleCancelEdit() {
            // Reset to last saved values
            UI.lastRenderedPromptId = null;
            UI.lastRenderedVersionId = null;
            State.set({ editMode: false, isDirty: false });
        },

        handleCopy() {
            let body = elements.bodyInput?.value || '';
            if (!body) {
                UI.showToast('Nothing to copy', 'error');
                return;
            }

            // Apply placeholder fills if any
            if (Object.keys(this.placeholderFills).length > 0) {
                for (const [placeholder, value] of Object.entries(this.placeholderFills)) {
                    body = body.split(placeholder).join(value);
                }
            }

            navigator.clipboard.writeText(body).then(() => {
                UI.showToast('Copied to clipboard');
            }).catch(() => {
                UI.showToast('Failed to copy', 'error');
            });
        },

        handleSaveAsVersion() {
            const s = State.get();
            if (!s.currentPromptId) return;

            UI.showVersionNoteDialog(async (note) => {
                try {
                    const activeDB = AppMode.getDB();
                    const title = elements.titleInput?.value.trim() || 'Untitled Prompt';
                    const description = elements.descriptionInput?.value.trim() || '';
                    const body = elements.bodyInput?.value || '';

                    await activeDB.updatePrompt(s.currentPromptId, { title, description });

                    const versions = await activeDB.getVersions(s.currentPromptId);
                    const maxVersion = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);

                    const newVersion = await activeDB.createVersion({
                        promptId: s.currentPromptId,
                        body,
                        versionNumber: maxVersion + 1,
                        note
                    });

                    await activeDB.updatePrompt(s.currentPromptId, { currentVersionId: newVersion.id });
                    Utils.clearDraft(s.currentPromptId);

                    const [prompts, updatedVersions] = await Promise.all([
                        activeDB.getAllPrompts(),
                        activeDB.getVersions(s.currentPromptId)
                    ]);

                    State.set({ prompts, versions: updatedVersions, currentVersion: newVersion, isDirty: false });
                    UI.showToast(`Saved as v${newVersion.versionNumber}`);
                } catch (error) {
                    console.error('Failed to save version:', error);
                    UI.showToast('Failed to save version', 'error');
                }
            });
        },

        async handleRestore(versionId) {
            const s = State.get();
            if (!s.currentPromptId) return;

            try {
                const activeDB = AppMode.getDB();
                const version = await activeDB.getVersion(versionId);
                if (!version) return;

                await activeDB.updatePrompt(s.currentPromptId, { currentVersionId: versionId });

                const prompts = await activeDB.getAllPrompts();
                State.set({ prompts, currentVersion: version, isDirty: false });
                UI.showToast(`Restored to v${version.versionNumber}`);
            } catch (error) {
                console.error('Failed to restore:', error);
                UI.showToast('Failed to restore', 'error');
            }
        },

        async handleCompare(versionId) {
            const s = State.get();
            if (!s.currentVersion) return;

            try {
                const activeDB = AppMode.getDB();
                const compareVersion = await activeDB.getVersion(versionId);
                if (!compareVersion) return;

                const isOlder = compareVersion.versionNumber < s.currentVersion.versionNumber;
                const oldVersion = isOlder ? compareVersion : s.currentVersion;
                const newVersion = isOlder ? s.currentVersion : compareVersion;

                UI.renderDiffModal(oldVersion, newVersion);
            } catch (error) {
                console.error('Failed to compare:', error);
                UI.showToast('Failed to compare', 'error');
            }
        },

        handleToggleHistory() {
            const s = State.get();
            State.set({ showVersionHistory: !s.showVersionHistory });
            UI.showVersionPanel(!s.showVersionHistory);
        },

        handleDelete() {
            const s = State.get();
            if (!s.currentPromptId) return;

            const prompt = State.getCurrentPrompt();
            const promptIdToDelete = s.currentPromptId;

            UI.showConfirmDialog(`Delete "${prompt?.title}"?`, async () => {
                try {
                    const activeDB = AppMode.getDB();
                    for (const tag of (prompt?.tags || [])) {
                        await activeDB.updateTagUsage(tag, -1);
                    }

                    await activeDB.deletePrompt(promptIdToDelete);
                    Utils.clearDraft(promptIdToDelete);

                    const [prompts, tags] = await Promise.all([
                        activeDB.getAllPrompts(),
                        activeDB.getAllTags()
                    ]);

                    State.set({
                        prompts,
                        allTags: tags,
                        currentPromptId: null,
                        currentVersion: null,
                        versions: [],
                        isDirty: false,
                        showVersionHistory: false
                    });

                    if (prompts.length > 0) {
                        await this.selectPrompt(prompts[0].id);
                    }

                    UI.showToast('Deleted');
                } catch (error) {
                    console.error('Failed to delete:', error);
                    UI.showToast('Failed to delete', 'error');
                }
            });
        },

        handleFilterByTag(tag) {
            const s = State.get();
            const filterTags = s.filterTags.includes(tag)
                ? s.filterTags.filter(t => t !== tag)
                : [...s.filterTags, tag];
            State.set({ filterTags });
        },

        handleTagInputChange(e) {
            const query = e.target.value.trim().toLowerCase();
            const s = State.get();
            const currentPrompt = State.getCurrentPrompt();
            const existingTags = currentPrompt?.tags || [];

            if (!query) {
                UI.renderTagSuggestions([], '');
                return;
            }

            const suggestions = s.allTags
                .filter(t => t.name.toLowerCase().includes(query) && !existingTags.includes(t.name))
                .slice(0, 5);

            if (!s.allTags.some(t => t.name.toLowerCase() === query)) {
                suggestions.push({ name: query, usageCount: 0 });
            }

            UI.renderTagSuggestions(suggestions, query);
        },

        handleTagInputKeydown(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const tag = e.target.value.trim();
                if (tag) {
                    this.handleAddTag(tag);
                    e.target.value = '';
                }
            } else if (e.key === 'Escape') {
                e.target.value = '';
                UI.renderTagSuggestions([], '');
            }
        },

        async handleAddTag(tagName) {
            const s = State.get();
            if (!s.currentPromptId) return;

            const prompt = State.getCurrentPrompt();
            if (!prompt) return;

            const normalizedTag = tagName.toLowerCase().trim();
            if (prompt.tags?.includes(normalizedTag)) return;

            try {
                const activeDB = AppMode.getDB();
                const newTags = [...(prompt.tags || []), normalizedTag];
                await activeDB.updatePrompt(s.currentPromptId, { tags: newTags });
                await activeDB.updateTagUsage(normalizedTag, 1);

                const [prompts, tags] = await Promise.all([
                    activeDB.getAllPrompts(),
                    activeDB.getAllTags()
                ]);

                State.set({ prompts, allTags: tags });
                elements.tagInput.value = '';
                UI.renderTagSuggestions([], '');
            } catch (error) {
                console.error('Failed to add tag:', error);
                UI.showToast('Failed to add tag', 'error');
            }
        },

        async handleRemoveTag(tagName) {
            const s = State.get();
            if (!s.currentPromptId) return;

            const prompt = State.getCurrentPrompt();
            if (!prompt) return;

            try {
                const activeDB = AppMode.getDB();
                const newTags = (prompt.tags || []).filter(t => t !== tagName);
                await activeDB.updatePrompt(s.currentPromptId, { tags: newTags });
                await activeDB.updateTagUsage(tagName, -1);

                const [prompts, tags] = await Promise.all([
                    activeDB.getAllPrompts(),
                    activeDB.getAllTags()
                ]);

                State.set({ prompts, allTags: tags });
            } catch (error) {
                console.error('Failed to remove tag:', error);
                UI.showToast('Failed to remove tag', 'error');
            }
        },

        async handleExport() {
            const s = State.get();
            const hasCurrentPrompt = !!s.currentPromptId;

            // Show export options dialog
            UI.showModal(`
                <div class="export-dialog">
                    <h3>Export Prompts</h3>
                    <p>Choose what to export:</p>
                    <div class="export-options">
                        ${hasCurrentPrompt ? `
                            <button class="btn secondary full-width" data-action="export-current">
                                Export Current Prompt
                            </button>
                        ` : ''}
                        <button class="btn primary full-width" data-action="export-all">
                            Export All Prompts (${s.prompts.length})
                        </button>
                    </div>
                    <div class="dialog-actions" style="margin-top: 16px;">
                        <button class="btn secondary" data-action="close-modal">Cancel</button>
                    </div>
                </div>
            `);

            // Add event listeners for export options
            const modalContent = document.getElementById('modal-content');
            modalContent.querySelector('[data-action="export-current"]')?.addEventListener('click', async () => {
                UI.hideModal();
                await this.doExport('current');
            });
            modalContent.querySelector('[data-action="export-all"]')?.addEventListener('click', async () => {
                UI.hideModal();
                await this.doExport('all');
            });
        },

        async doExport(type) {
            const s = State.get();

            try {
                const activeDB = AppMode.getDB();
                let data, filename;

                if (type === 'current' && s.currentPromptId) {
                    const promptData = await activeDB.exportPrompt(s.currentPromptId);
                    data = { version: '1.0', exportedAt: new Date().toISOString(), prompts: [promptData] };
                    filename = `promptshelf-${State.getCurrentPrompt()?.title?.toLowerCase().replace(/\s+/g, '-') || 'prompt'}.json`;
                } else {
                    const allPrompts = await activeDB.exportAllPrompts();
                    data = { version: '1.0', exportedAt: new Date().toISOString(), prompts: allPrompts };
                    filename = 'promptshelf-all-prompts.json';
                }

                Utils.downloadFile(JSON.stringify(data, null, 2), filename);
                UI.showToast(`Exported ${data.prompts.length} prompt(s)`);
            } catch (error) {
                console.error('Failed to export:', error);
                UI.showToast('Failed to export', 'error');
            }
        },

        pendingImportData: null,

        async handleImport(e) {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                const validation = Utils.validateImport(data);
                if (!validation.valid) {
                    UI.showToast(validation.error, 'error');
                    e.target.value = '';
                    return;
                }

                // Store import data for later
                this.pendingImportData = data;

                const s = State.get();
                const existingCount = s.prompts.length;

                // Show import options dialog
                UI.showModal(`
                    <div class="import-dialog">
                        <h3>Import Prompts</h3>
                        <p>Found <strong>${data.prompts.length}</strong> prompt(s) in file.</p>
                        ${existingCount > 0 ? `
                            <label class="checkbox-label">
                                <input type="checkbox" id="import-clear-existing">
                                <span>Remove existing ${existingCount} prompt(s) before importing</span>
                            </label>
                        ` : ''}
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="btn secondary" data-action="close-modal">Cancel</button>
                            <button class="btn primary" id="confirm-import-btn">Import</button>
                        </div>
                    </div>
                `);

                // Handle import confirmation
                const confirmBtn = document.getElementById('confirm-import-btn');
                if (confirmBtn) {
                    confirmBtn.addEventListener('click', () => this.doImport());
                }
            } catch (error) {
                console.error('Failed to parse import file:', error);
                UI.showToast('Invalid file', 'error');
            }

            e.target.value = '';
        },

        async doImport() {
            console.log('doImport: Starting');
            const data = this.pendingImportData;
            if (!data) {
                console.error('doImport: No pending import data');
                UI.showToast('No import data', 'error');
                return;
            }

            // Read checkbox BEFORE hiding modal
            const clearExisting = document.getElementById('import-clear-existing')?.checked || false;
            console.log('doImport: clearExisting =', clearExisting);

            UI.hideModal();

            try {
                UI.showToast('Importing...', 'info');
                const activeDB = AppMode.getDB();
                console.log('doImport: Using', AppMode.isLocal() ? 'local DB' : 'CloudDB');

                // Clear existing prompts if checkbox is checked
                if (clearExisting) {
                    console.log('doImport: Clearing existing prompts (batch delete)');
                    await activeDB.clearAllPrompts();
                    console.log('doImport: Cleared existing prompts');
                }

                console.log('doImport: Calling importPrompts with', data.prompts.length, 'prompts');
                const importedPrompts = await activeDB.importPrompts(data.prompts);
                console.log('doImport: importPrompts returned', importedPrompts.length, 'prompts');

                console.log('doImport: Fetching updated prompts and tags');
                const [prompts, tags] = await Promise.all([
                    activeDB.getAllPrompts(),
                    activeDB.getAllTags()
                ]);
                console.log('doImport: Got', prompts.length, 'prompts and', tags.length, 'tags');

                State.set({
                    prompts,
                    allTags: tags,
                    currentPromptId: null,
                    currentVersion: null,
                    versions: []
                });
                console.log('doImport: State updated');

                // Select first prompt if available
                if (prompts.length > 0) {
                    console.log('doImport: Selecting first prompt:', prompts[0].id);
                    await this.selectPrompt(prompts[0].id);
                }

                this.pendingImportData = null;
                console.log('doImport: Complete');
                UI.showToast(`Imported ${data.prompts.length} prompt(s)${clearExisting ? ' (replaced existing)' : ''}`, 'success');
            } catch (error) {
                console.error('doImport: Failed:', error);
                UI.showToast('Import failed: ' + error.message, 'error');
            }
        },

        async handleToggleDarkMode() {
            const s = State.get();
            const newMode = !s.darkMode;
            State.set({ darkMode: newMode });
            UI.setDarkMode(newMode);
            const activeDB = AppMode.getDB();
            await activeDB.setSetting('darkMode', newMode);
        },

        // Auth handlers
        handleShowAuthModal() {
            UI.showAuthModal(State.get().authMode);
        },

        handleAuthModeSwitch() {
            const currentMode = State.get().authMode;
            const newMode = currentMode === 'signin' ? 'signup' : 'signin';
            State.set({ authMode: newMode });
            UI.updateAuthMode(newMode);
            UI.hideAuthError();
        },

        async handleAuthSubmit(e) {
            e.preventDefault();

            const email = elements.authEmail?.value.trim();
            const password = elements.authPassword?.value;
            const mode = State.get().authMode;

            if (!email || !password) {
                UI.showAuthError('Please fill in all fields');
                return;
            }

            UI.setAuthLoading(true);
            UI.hideAuthError();

            try {
                if (mode === 'signup') {
                    await Firebase.signUp(email, password);
                    UI.showToast('Account created!', 'success');
                } else {
                    await Firebase.signIn(email, password);
                    UI.showToast('Signed in!', 'success');
                }
                UI.hideAuthModal();
            } catch (error) {
                console.error('Auth error:', error);
                let message = 'Authentication failed';
                if (error.code === 'auth/email-already-in-use') {
                    message = 'Email already in use';
                } else if (error.code === 'auth/invalid-email') {
                    message = 'Invalid email address';
                } else if (error.code === 'auth/weak-password') {
                    message = 'Password should be at least 6 characters';
                } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    message = 'Invalid email or password';
                } else if (error.code === 'auth/invalid-credential') {
                    message = 'Invalid email or password';
                }
                UI.showAuthError(message);
            } finally {
                UI.setAuthLoading(false);
            }
        },

        async handleLogout() {
            try {
                await Firebase.signOut();
                UI.hideUserDropdown();
                UI.hideProfilePage();
                UI.showToast('Signed out');
            } catch (error) {
                console.error('Logout error:', error);
                UI.showToast('Failed to sign out', 'error');
            }
        },

        async handleSyncNow() {
            const user = State.get().user;
            if (!user) return;

            UI.hideUserDropdown();
            UI.showToast('Data syncs automatically when logged in', 'info');
        },

        handleKeyboardShortcut(e) {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            if (modifier && e.key === 's') {
                e.preventDefault();
                if (e.shiftKey) this.handleSaveAsVersion();
                else this.handleSave();
            } else if (modifier && e.key === 'n') {
                e.preventDefault();
                this.handleNewPrompt();
            } else if (modifier && e.key === '/') {
                e.preventDefault();
                elements.searchInput?.focus();
            } else if (e.key === 'Escape') {
                if (!elements.modal?.classList.contains('hidden')) {
                    UI.hideModal();
                }
            }
        }
    };

    // Start the app
    document.addEventListener('DOMContentLoaded', () => App.init());
})();
