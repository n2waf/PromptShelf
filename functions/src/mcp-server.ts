import { listPrompts } from "./tools/list-prompts";
import { getPrompt } from "./tools/get-prompt";
import { searchPrompts } from "./tools/search-prompts";
import { getVersions } from "./tools/get-versions";
import { getTags } from "./tools/get-tags";

const tools = [
  {
    name: "list_prompts",
    description: "List all prompts. Optionally filter by tag or limit results.",
    inputSchema: {
      type: "object" as const,
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
      type: "object" as const,
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
      type: "object" as const,
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
      type: "object" as const,
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
      type: "object" as const,
      properties: {},
    },
  },
];

export class McpServer {
  constructor(private uid: string) {}

  async handleListTools() {
    return { tools };
  }

  async handleToolCall(name: string, args: Record<string, unknown>) {
    try {
      let result: unknown;

      switch (name) {
        case "list_prompts":
          result = await listPrompts(this.uid, {
            tag: args.tag as string | undefined,
            limit: args.limit as number | undefined,
          });
          break;

        case "get_prompt":
          result = await getPrompt(this.uid, { prompt_id: args.prompt_id as string });
          if (!result) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "Prompt not found" }) }],
              isError: true,
            };
          }
          break;

        case "search_prompts":
          result = await searchPrompts(this.uid, { query: args.query as string });
          break;

        case "get_versions":
          result = await getVersions(this.uid, { prompt_id: args.prompt_id as string });
          break;

        case "get_tags":
          result = await getTags(this.uid);
          break;

        default:
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true,
          };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  }
}

export function createMcpServer(uid: string): McpServer {
  return new McpServer(uid);
}
