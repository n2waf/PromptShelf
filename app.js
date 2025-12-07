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

                let lastVersionId = null;
                for (const versionData of (promptData.versions || [])) {
                    const version = await this.createVersion({
                        promptId: prompt.id,
                        body: versionData.body,
                        versionNumber: versionData.versionNumber,
                        note: versionData.note
                    });
                    lastVersionId = version.id;
                }

                if (lastVersionId) {
                    await this.updatePrompt(prompt.id, { currentVersionId: lastVersionId });
                }
                results.push(prompt);
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
        showVersionHistory: false
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
            elements.saveVersionBtn = document.getElementById('save-version-btn');
            elements.historyBtn = document.getElementById('history-btn');
            elements.deleteBtn = document.getElementById('delete-btn');
            elements.exportBtn = document.getElementById('export-btn');
            elements.importBtn = document.getElementById('import-btn');
            elements.importInput = document.getElementById('import-input');
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

        renderEditor(prompt, version, isDirty) {
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

        renderPromptTags(tags) {
            if (!elements.promptTags) return;
            elements.promptTags.innerHTML = tags.map(tag => `
                <span class="tag-chip editable" data-tag="${Utils.escapeHtml(tag)}">
                    ${Utils.escapeHtml(tag)}
                    <button class="tag-remove" data-tag="${Utils.escapeHtml(tag)}">&times;</button>
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
        async init() {
            try {
                await DB.init();
                UI.cacheElements();

                const [prompts, tags, darkMode] = await Promise.all([
                    DB.getAllPrompts(),
                    DB.getAllTags(),
                    DB.getSetting('darkMode')
                ]);

                State.set({ prompts, allTags: tags, darkMode: darkMode || false });
                UI.setDarkMode(State.get().darkMode);

                State.subscribe(() => this.render());
                this.bindEvents();
                this.render();

                if (prompts.length > 0) {
                    await this.selectPrompt(prompts[0].id);
                }
            } catch (error) {
                console.error('Failed to initialize:', error);
                UI.showToast('Failed to initialize app', 'error');
            }
        },

        render() {
            const s = State.get();
            const filteredPrompts = State.getFilteredPrompts();
            const currentPrompt = State.getCurrentPrompt();

            UI.renderPromptList(filteredPrompts, s.currentPromptId);
            UI.renderTagFilter(s.allTags, s.filterTags);
            UI.renderEditor(currentPrompt, s.currentVersion, s.isDirty);

            if (currentPrompt) {
                UI.renderPromptTags(currentPrompt.tags || []);
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
                if (item) this.selectPrompt(parseInt(item.dataset.id, 10));
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
            elements.saveVersionBtn?.addEventListener('click', () => this.handleSaveAsVersion());
            elements.historyBtn?.addEventListener('click', () => this.handleToggleHistory());
            elements.deleteBtn?.addEventListener('click', () => this.handleDelete());
            elements.exportBtn?.addEventListener('click', () => this.handleExport());
            elements.importBtn?.addEventListener('click', () => elements.importInput?.click());
            elements.importInput?.addEventListener('change', (e) => this.handleImport(e));
            elements.darkModeToggle?.addEventListener('click', () => this.handleToggleDarkMode());

            elements.modal?.addEventListener('click', (e) => {
                if (e.target === elements.modal || e.target.closest('[data-action="close-modal"]')) {
                    UI.hideModal();
                }
            });

            elements.versionList?.addEventListener('click', async (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const versionId = parseInt(btn.dataset.versionId, 10);
                if (btn.dataset.action === 'restore') await this.handleRestore(versionId);
                else if (btn.dataset.action === 'compare') await this.handleCompare(versionId);
            });

            document.addEventListener('keydown', (e) => this.handleKeyboardShortcut(e));
        },

        async handleNewPrompt() {
            try {
                const prompt = await DB.createPrompt({ title: 'Untitled Prompt' });
                const version = await DB.createVersion({ promptId: prompt.id, body: '', versionNumber: 1 });
                await DB.updatePrompt(prompt.id, { currentVersionId: version.id });

                const prompts = await DB.getAllPrompts();
                State.set({ prompts });
                await this.selectPrompt(prompt.id);

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
                const prompt = await DB.getPrompt(id);
                if (!prompt) return;

                const versions = await DB.getVersions(id);
                const currentVersion = versions.find(v => v.id === prompt.currentVersionId) || versions[0];

                State.set({
                    currentPromptId: id,
                    currentVersion,
                    versions,
                    isDirty: false,
                    showVersionHistory: false
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
                const title = elements.titleInput?.value.trim() || 'Untitled Prompt';
                const description = elements.descriptionInput?.value.trim() || '';
                const body = elements.bodyInput?.value || '';

                await DB.updatePrompt(s.currentPromptId, { title, description });

                // Always create a new version on save
                const versions = await DB.getVersions(s.currentPromptId);
                const maxVersion = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);

                const newVersion = await DB.createVersion({
                    promptId: s.currentPromptId,
                    body,
                    versionNumber: maxVersion + 1
                });

                await DB.updatePrompt(s.currentPromptId, { currentVersionId: newVersion.id });
                Utils.clearDraft(s.currentPromptId);

                const [updatedPrompts, updatedVersions] = await Promise.all([
                    DB.getAllPrompts(),
                    DB.getVersions(s.currentPromptId)
                ]);

                State.set({ prompts: updatedPrompts, versions: updatedVersions, currentVersion: newVersion, isDirty: false });
                UI.showToast(`Saved v${newVersion.versionNumber}`);
            } catch (error) {
                console.error('Failed to save:', error);
                UI.showToast('Failed to save', 'error');
            }
        },

        handleSaveAsVersion() {
            const s = State.get();
            if (!s.currentPromptId) return;

            UI.showVersionNoteDialog(async (note) => {
                try {
                    const title = elements.titleInput?.value.trim() || 'Untitled Prompt';
                    const description = elements.descriptionInput?.value.trim() || '';
                    const body = elements.bodyInput?.value || '';

                    await DB.updatePrompt(s.currentPromptId, { title, description });

                    const versions = await DB.getVersions(s.currentPromptId);
                    const maxVersion = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);

                    const newVersion = await DB.createVersion({
                        promptId: s.currentPromptId,
                        body,
                        versionNumber: maxVersion + 1,
                        note
                    });

                    await DB.updatePrompt(s.currentPromptId, { currentVersionId: newVersion.id });
                    Utils.clearDraft(s.currentPromptId);

                    const [prompts, updatedVersions] = await Promise.all([
                        DB.getAllPrompts(),
                        DB.getVersions(s.currentPromptId)
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
                const version = await DB.getVersion(versionId);
                if (!version) return;

                await DB.updatePrompt(s.currentPromptId, { currentVersionId: versionId });

                const prompts = await DB.getAllPrompts();
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
                const compareVersion = await DB.getVersion(versionId);
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
            UI.showConfirmDialog(`Delete "${prompt?.title}"?`, async () => {
                try {
                    for (const tag of (prompt?.tags || [])) {
                        await DB.updateTagUsage(tag, -1);
                    }

                    await DB.deletePrompt(s.currentPromptId);
                    Utils.clearDraft(s.currentPromptId);

                    const [prompts, tags] = await Promise.all([
                        DB.getAllPrompts(),
                        DB.getAllTags()
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
                const newTags = [...(prompt.tags || []), normalizedTag];
                await DB.updatePrompt(s.currentPromptId, { tags: newTags });
                await DB.updateTagUsage(normalizedTag, 1);

                const [prompts, tags] = await Promise.all([
                    DB.getAllPrompts(),
                    DB.getAllTags()
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
                const newTags = (prompt.tags || []).filter(t => t !== tagName);
                await DB.updatePrompt(s.currentPromptId, { tags: newTags });
                await DB.updateTagUsage(tagName, -1);

                const [prompts, tags] = await Promise.all([
                    DB.getAllPrompts(),
                    DB.getAllTags()
                ]);

                State.set({ prompts, allTags: tags });
            } catch (error) {
                console.error('Failed to remove tag:', error);
                UI.showToast('Failed to remove tag', 'error');
            }
        },

        async handleExport() {
            const s = State.get();

            try {
                let data, filename;

                if (s.currentPromptId) {
                    const promptData = await DB.exportPrompt(s.currentPromptId);
                    data = { version: '1.0', exportedAt: new Date().toISOString(), prompts: [promptData] };
                    filename = `promptshelf-${State.getCurrentPrompt()?.title?.toLowerCase().replace(/\s+/g, '-') || 'prompt'}.json`;
                } else {
                    const allPrompts = await DB.exportAllPrompts();
                    data = { version: '1.0', exportedAt: new Date().toISOString(), prompts: allPrompts };
                    filename = 'promptshelf-export.json';
                }

                Utils.downloadFile(JSON.stringify(data, null, 2), filename);
                UI.showToast('Exported');
            } catch (error) {
                console.error('Failed to export:', error);
                UI.showToast('Failed to export', 'error');
            }
        },

        async handleImport(e) {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                const validation = Utils.validateImport(data);
                if (!validation.valid) {
                    UI.showToast(validation.error, 'error');
                    return;
                }

                await DB.importPrompts(data.prompts);

                const [prompts, tags] = await Promise.all([
                    DB.getAllPrompts(),
                    DB.getAllTags()
                ]);

                State.set({ prompts, allTags: tags });
                UI.showToast(`Imported ${data.prompts.length} prompt(s)`);
            } catch (error) {
                console.error('Failed to import:', error);
                UI.showToast('Invalid file', 'error');
            }

            e.target.value = '';
        },

        async handleToggleDarkMode() {
            const s = State.get();
            const newMode = !s.darkMode;
            State.set({ darkMode: newMode });
            UI.setDarkMode(newMode);
            await DB.setSetting('darkMode', newMode);
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
