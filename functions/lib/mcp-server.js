"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpServer = void 0;
exports.createMcpServer = createMcpServer;
const list_prompts_1 = require("./tools/list-prompts");
const get_prompt_1 = require("./tools/get-prompt");
const search_prompts_1 = require("./tools/search-prompts");
const get_versions_1 = require("./tools/get-versions");
const get_tags_1 = require("./tools/get-tags");
const tools = [
    {
        name: "list_prompts",
        description: "List all prompts. Optionally filter by tag or limit results.",
        inputSchema: {
            type: "object",
            properties: {
                tag: { type: "string", description: "Filter prompts by tag name" },
                limit: { type: "number", description: "Maximum number of prompts to return (default: 100)" },
            },
        },
    },
    {
        name: "get_prompt",
        description: "Get a specific prompt with its current version content.",
        inputSchema: {
            type: "object",
            properties: {
                prompt_id: { type: "string", description: "The ID of the prompt to retrieve" },
            },
            required: ["prompt_id"],
        },
    },
    {
        name: "search_prompts",
        description: "Search prompts by title, description, or content.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query to match against prompt title, description, and content" },
            },
            required: ["query"],
        },
    },
    {
        name: "get_versions",
        description: "Get version history for a specific prompt.",
        inputSchema: {
            type: "object",
            properties: {
                prompt_id: { type: "string", description: "The ID of the prompt to get versions for" },
            },
            required: ["prompt_id"],
        },
    },
    {
        name: "get_tags",
        description: "Get all tags with their usage counts.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
];
class McpServer {
    constructor(uid) {
        this.uid = uid;
    }
    async handleListTools() {
        return { tools };
    }
    async handleToolCall(name, args) {
        try {
            let result;
            switch (name) {
                case "list_prompts":
                    result = await (0, list_prompts_1.listPrompts)(this.uid, {
                        tag: args.tag,
                        limit: args.limit,
                    });
                    break;
                case "get_prompt":
                    result = await (0, get_prompt_1.getPrompt)(this.uid, { prompt_id: args.prompt_id });
                    if (!result) {
                        return {
                            content: [{ type: "text", text: JSON.stringify({ error: "Prompt not found" }) }],
                            isError: true,
                        };
                    }
                    break;
                case "search_prompts":
                    result = await (0, search_prompts_1.searchPrompts)(this.uid, { query: args.query });
                    break;
                case "get_versions":
                    result = await (0, get_versions_1.getVersions)(this.uid, { prompt_id: args.prompt_id });
                    break;
                case "get_tags":
                    result = await (0, get_tags_1.getTags)(this.uid);
                    break;
                default:
                    return {
                        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
                        isError: true,
                    };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
                content: [{ type: "text", text: JSON.stringify({ error: message }) }],
                isError: true,
            };
        }
    }
}
exports.McpServer = McpServer;
function createMcpServer(uid) {
    return new McpServer(uid);
}
//# sourceMappingURL=mcp-server.js.map