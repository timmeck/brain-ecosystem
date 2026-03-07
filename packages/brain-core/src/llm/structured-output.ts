/**
 * Structured LLM Output — Typed ContentBlocks statt nur `{ text: string }`
 *
 * Inspiriert von LangChain's structured output parsing.
 * Ermöglicht es, LLM-Antworten in typisierte Blöcke zu zerlegen:
 * Text, Reasoning, Tool Calls, Citations, JSON.
 */

// ── Content Block Types ─────────────────────────────────

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface ReasoningBlock {
  type: 'reasoning';
  content: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  toolName: string;
  args: Record<string, unknown>;
}

export interface CitationBlock {
  type: 'citation';
  source: string;
  quote: string;
}

export interface JsonBlock {
  type: 'json';
  data: unknown;
}

export type ContentBlock = TextBlock | ReasoningBlock | ToolCallBlock | CitationBlock | JsonBlock;

// ── Structured Response ─────────────────────────────────

export interface StructuredLLMResponse {
  /** Full raw text (for backwards-compat) */
  text: string;
  /** Parsed content blocks */
  blocks: ContentBlock[];
  /** Token usage */
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  model: string;
  durationMs: number;
  provider: string;
}

// ── Parsing ─────────────────────────────────────────────

/**
 * Parse raw LLM output into structured ContentBlocks.
 *
 * Erkennt:
 * - <thinking>...</thinking> → ReasoningBlock
 * - <tool_call>{"name":"...","args":{...}}</tool_call> → ToolCallBlock
 * - <citation source="...">...</citation> → CitationBlock
 * - ```json ... ``` → JsonBlock
 * - Alles andere → TextBlock
 */
export function parseStructuredOutput(raw: string): ContentBlock[] {
  if (!raw || raw.trim().length === 0) return [];

  const blocks: ContentBlock[] = [];
  let remaining = raw;

  // Regex patterns for structured sections
  const patterns: Array<{
    regex: RegExp;
    handler: (match: RegExpMatchArray) => ContentBlock;
  }> = [
    {
      // <thinking>...</thinking>
      regex: /<thinking>([\s\S]*?)<\/thinking>/,
      handler: (m) => ({ type: 'reasoning', content: m[1].trim() }),
    },
    {
      // <tool_call>{"name":"x","args":{...}}</tool_call>
      regex: /<tool_call>([\s\S]*?)<\/tool_call>/,
      handler: (m) => {
        try {
          const parsed = JSON.parse(m[1].trim());
          return {
            type: 'tool_call',
            toolName: parsed.name ?? parsed.tool ?? 'unknown',
            args: parsed.args ?? parsed.arguments ?? parsed.input ?? {},
          };
        } catch {
          return { type: 'text', content: m[0] };
        }
      },
    },
    {
      // <citation source="...">...</citation>
      regex: /<citation\s+source="([^"]*)">([\s\S]*?)<\/citation>/,
      handler: (m) => ({ type: 'citation', source: m[1], quote: m[2].trim() }),
    },
    {
      // ```json ... ```
      regex: /```json\s*\n([\s\S]*?)\n```/,
      handler: (m) => {
        try {
          return { type: 'json', data: JSON.parse(m[1].trim()) };
        } catch {
          return { type: 'text', content: m[0] };
        }
      },
    },
  ];

  while (remaining.length > 0) {
    // Find the earliest matching pattern
    let earliest: { index: number; match: RegExpMatchArray; handler: (m: RegExpMatchArray) => ContentBlock } | null = null;

    for (const p of patterns) {
      const match = remaining.match(p.regex);
      if (match && match.index !== undefined) {
        if (!earliest || match.index < earliest.index) {
          earliest = { index: match.index, match, handler: p.handler };
        }
      }
    }

    if (!earliest) {
      // No more patterns found — rest is text
      const trimmed = remaining.trim();
      if (trimmed.length > 0) {
        blocks.push({ type: 'text', content: trimmed });
      }
      break;
    }

    // Text before the match
    const before = remaining.slice(0, earliest.index).trim();
    if (before.length > 0) {
      blocks.push({ type: 'text', content: before });
    }

    // The matched block
    blocks.push(earliest.handler(earliest.match));

    // Continue after the match
    remaining = remaining.slice(earliest.index + earliest.match[0].length);
  }

  return blocks;
}

// ── JSON Mode Helper ────────────────────────────────────

/**
 * Extrahiert JSON aus einer LLM-Antwort.
 * Versucht zuerst die gesamte Antwort als JSON zu parsen,
 * dann sucht es nach ```json Code-Blöcken.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  // Try full string
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    // Try code block
    const match = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validate parsed JSON against a simple schema (key presence check).
 * Returns the data if valid, null otherwise.
 */
export function validateJsonSchema<T = unknown>(
  data: unknown,
  requiredKeys: string[],
): T | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  for (const key of requiredKeys) {
    if (!(key in obj)) return null;
  }
  return data as T;
}

// ── Block Helpers ────────────────────────────────────────

/** Get all blocks of a specific type */
export function getBlocks<T extends ContentBlock['type']>(
  blocks: ContentBlock[],
  type: T,
): Extract<ContentBlock, { type: T }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: T }> => b.type === type);
}

/** Get combined text from all TextBlocks */
export function getTextContent(blocks: ContentBlock[]): string {
  return getBlocks(blocks, 'text').map(b => b.content).join('\n\n');
}

/** Get all tool calls */
export function getToolCalls(blocks: ContentBlock[]): ToolCallBlock[] {
  return getBlocks(blocks, 'tool_call');
}

/** Check if response contains reasoning */
export function hasReasoning(blocks: ContentBlock[]): boolean {
  return blocks.some(b => b.type === 'reasoning');
}
