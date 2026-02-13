#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Configuration ---

const API_KEY = process.env.TANEBI_API_KEY;
const API_BASE_URL =
  process.env.TANEBI_API_BASE_URL?.replace(/\/+$/, "") ||
  "https://tanebi.app";

if (!API_KEY) {
  console.error(
    "Error: TANEBI_API_KEY environment variable is required.\n" +
      "Generate an API key from the Tanebi iOS app settings."
  );
  process.exit(1);
}

// --- API Client ---

interface ApiRequestOptions {
  method?: string;
  body?: Record<string, unknown>;
}

async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {
    "X-API-Key": API_KEY!,
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }

  return response.json() as Promise<T>;
}

// --- Response Types ---

interface SimplifiedUser {
  id: number;
  display_name: string;
  avatar_path: string | null;
}

interface IdeaSummary {
  id: number;
  title: string;
  visibility: string;
  current_stage: string;
  reactions_count: number;
  comments_count: number;
  is_bookmarked: boolean;
  created_at: string;
  updated_at: string;
  user: SimplifiedUser;
}

interface IdeaLine {
  id: number;
  line_type: string;
  content: string;
  position: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

interface Reaction {
  id: number;
  reaction_type: string;
  created_at: string;
  user: SimplifiedUser;
}

interface IdeaDetail {
  id: number;
  title: string;
  visibility: string;
  current_stage: string;
  reactions_count: number;
  is_bookmarked: boolean;
  created_at: string;
  updated_at: string;
  user: SimplifiedUser;
  lines: IdeaLine[];
  reactions: Reaction[];
}

interface PaginationMeta {
  current_page: number;
  total_pages: number;
  total_count: number;
}

interface IdeasListResponse {
  ideas: IdeaSummary[];
  meta: PaginationMeta;
}

// --- Formatters ---

function formatIdeaSummary(idea: IdeaSummary): string {
  return [
    `[ID: ${idea.id}] ${idea.title}`,
    `  Stage: ${idea.current_stage} | Visibility: ${idea.visibility}`,
    `  Author: ${idea.user.display_name}`,
    `  Reactions: ${idea.reactions_count} | Comments: ${idea.comments_count}`,
    `  Created: ${idea.created_at}`,
  ].join("\n");
}

function formatIdeaDetail(idea: IdeaDetail): string {
  const header = [
    `# ${idea.title}`,
    "",
    `ID: ${idea.id}`,
    `Stage: ${idea.current_stage} | Visibility: ${idea.visibility}`,
    `Author: ${idea.user.display_name}`,
    `Reactions: ${idea.reactions_count}`,
    `Created: ${idea.created_at} | Updated: ${idea.updated_at}`,
  ].join("\n");

  const content =
    idea.lines.length > 0
      ? "\n\n## Content\n\n" +
        idea.lines
          .sort((a, b) => a.position - b.position)
          .map((line) => {
            const prefix = line.line_type === "heading" ? "### " : "";
            const commentTag = line.comments_count > 0 ? ` [${line.comments_count} comments]` : "";
            return `${prefix}${line.content}${commentTag}`;
          })
          .join("\n\n")
      : "\n\n(No content yet)";

  const reactions =
    idea.reactions.length > 0
      ? "\n\n## Reactions\n\n" +
        idea.reactions
          .map((r) => `- ${r.reaction_type} by ${r.user.display_name}`)
          .join("\n")
      : "";

  return header + content + reactions;
}

// --- MCP Server ---

const server = new McpServer({
  name: "tanebi",
  version: "1.0.0",
});

// Tool: list_ideas
server.tool(
  "list_ideas",
  "List ideas from Tanebi. Returns summaries with title, stage, author, and counts.",
  {
    page: z
      .number()
      .int()
      .positive()
      .default(1)
      .describe("Page number (default: 1)"),
    per_page: z
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe("Items per page (default: 20, max: 100)"),
  },
  async ({ page, per_page }) => {
    const data = await apiRequest<IdeasListResponse>(
      `/api/v1/ideas?page=${page}&per_page=${per_page}`
    );

    const summaries = data.ideas.map(formatIdeaSummary).join("\n\n");
    const pagination = `\nPage ${data.meta.current_page} of ${data.meta.total_pages} (${data.meta.total_count} total ideas)`;

    return {
      content: [{ type: "text" as const, text: summaries + "\n" + pagination }],
    };
  }
);

// Tool: get_idea
server.tool(
  "get_idea",
  "Get detailed information about a specific idea, including its content lines and reactions.",
  {
    idea_id: z.number().int().positive().describe("The ID of the idea to retrieve"),
  },
  async ({ idea_id }) => {
    const data = await apiRequest<{ idea: IdeaDetail }>(
      `/api/v1/ideas/${idea_id}`
    );

    // The API may return the idea directly or wrapped in { idea: ... }
    const idea = "idea" in data ? data.idea : (data as unknown as IdeaDetail);

    return {
      content: [{ type: "text" as const, text: formatIdeaDetail(idea) }],
    };
  }
);

// Tool: create_idea
server.tool(
  "create_idea",
  "Create a new idea on Tanebi. Content is split into paragraphs (separated by blank lines) and stored as lines.",
  {
    title: z.string().min(1).describe("Title of the idea"),
    content: z
      .string()
      .optional()
      .describe(
        "Content of the idea. Paragraphs are separated by blank lines. Lines starting with # become headings."
      ),
    visibility: z
      .enum(["public", "private"])
      .default("public")
      .describe('Visibility: "public" or "private" (default: "public")'),
  },
  async ({ title, content, visibility }) => {
    const body: Record<string, unknown> = { title, visibility };
    if (content) {
      body.content = content;
    }

    const data = await apiRequest<{ idea: IdeaDetail } | IdeaDetail>(
      "/api/v1/ideas",
      { method: "POST", body }
    );

    const idea = "idea" in data ? data.idea : data;

    return {
      content: [
        {
          type: "text" as const,
          text: `Idea created successfully!\n\n${formatIdeaDetail(idea)}`,
        },
      ],
    };
  }
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
