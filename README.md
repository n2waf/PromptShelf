# PromptShelf

A prompt management tool with automatic versioning and MCP integration. Store, organize, and track changes to your AI prompts — with cloud sync and API access.

**Live Demo:** [https://promptshelf-75139.web.app](https://promptshelf-75139.web.app)

## Features

- **Unlimited Prompts** — Create and manage as many prompts as you need
- **Automatic Versioning** — Every save creates a new version automatically
- **Version History** — View all previous versions with timestamps
- **Version Comparison** — Compare any two versions with unified diff view
- **Placeholder Quick-Fill** — Click `[placeholders]` to fill them temporarily before copying
- **Tags** — Organize prompts with custom tags and filter by them
- **Search** — Find prompts by title or description
- **Dark Mode** — Easy on the eyes, persists across sessions
- **Import/Export** — Backup and share prompts as JSON files
- **Auto-save Drafts** — Never lose work with automatic draft saving
- **Keyboard Shortcuts** — Work faster with hotkeys
- **Cloud Sync** — Sign in with Google to sync across devices
- **MCP Server** — Access your prompts from Claude Desktop and other MCP clients
- **Privacy First** — Your data, your control

## MCP Integration

Connect Claude Desktop or other MCP clients to access your prompts directly.

1. Sign in to PromptShelf
2. Go to your Profile page
3. Copy the MCP config
4. Add it to `~/Library/Application Support/Claude/claude_desktop_config.json`

Available tools:
- `list_prompts` — List all prompts, optionally filter by tag
- `get_prompt` — Get a specific prompt with its content
- `search_prompts` — Search prompts by title, description, or content
- `get_versions` — Get version history for a prompt
- `get_tags` — Get all tags with usage counts

## How to Use

### Cloud Version (Recommended)
Visit [https://promptshelf-75139.web.app](https://promptshelf-75139.web.app) and sign in with Google.

### Self-Hosted
1. Clone this repository
2. Set up Firebase project with Firestore and Authentication
3. Deploy with `firebase deploy`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save prompt (creates new version) |
| `Ctrl/Cmd + N` | Create new prompt |
| `Ctrl/Cmd + /` | Focus search |
| `Escape` | Close modals |

## Tech Stack

- Frontend: Pure HTML, CSS, and JavaScript
- Backend: Firebase (Firestore, Authentication, Cloud Functions, Hosting)
- MCP Server: Streamable HTTP transport for serverless compatibility

## Credits

- **Application**: Built entirely by [Claude Code](https://claude.ai) (Opus 4.5)
- **System Prompt**: Created by GPT 5.1

## License

MIT License — feel free to use, modify, and distribute.

---

Made with AI, for humans who work with AI.
