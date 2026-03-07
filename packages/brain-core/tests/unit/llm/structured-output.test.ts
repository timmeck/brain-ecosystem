import { describe, it, expect } from 'vitest';
import {
  parseStructuredOutput,
  extractJson,
  validateJsonSchema,
  getBlocks,
  getTextContent,
  getToolCalls,
  hasReasoning,
} from '../../../src/llm/structured-output.js';

describe('parseStructuredOutput', () => {
  it('returns empty array for empty input', () => {
    expect(parseStructuredOutput('')).toEqual([]);
    expect(parseStructuredOutput('  ')).toEqual([]);
  });

  it('parses plain text as single TextBlock', () => {
    const blocks = parseStructuredOutput('Hello world');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: 'text', content: 'Hello world' });
  });

  it('parses <thinking> tags as ReasoningBlock', () => {
    const raw = 'Some intro\n<thinking>Let me think about this...</thinking>\nConclusion here.';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'text', content: 'Some intro' });
    expect(blocks[1]).toEqual({ type: 'reasoning', content: 'Let me think about this...' });
    expect(blocks[2]).toEqual({ type: 'text', content: 'Conclusion here.' });
  });

  it('parses <tool_call> tags as ToolCallBlock', () => {
    const raw = '<tool_call>{"name":"search","args":{"query":"AI"}}</tool_call>';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: 'tool_call', toolName: 'search', args: { query: 'AI' } });
  });

  it('handles invalid JSON in tool_call gracefully', () => {
    const raw = '<tool_call>not json</tool_call>';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
  });

  it('parses <citation> tags as CitationBlock', () => {
    const raw = '<citation source="paper.pdf">Important quote here</citation>';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: 'citation', source: 'paper.pdf', quote: 'Important quote here' });
  });

  it('parses ```json blocks as JsonBlock', () => {
    const raw = 'Before\n```json\n{"key":"value"}\n```\nAfter';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'text', content: 'Before' });
    expect(blocks[1]).toEqual({ type: 'json', data: { key: 'value' } });
    expect(blocks[2]).toEqual({ type: 'text', content: 'After' });
  });

  it('handles mixed content with multiple block types', () => {
    const raw = 'Intro\n<thinking>Step 1</thinking>\nMiddle\n<citation source="src">Quote</citation>\nEnd';
    const blocks = parseStructuredOutput(raw);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    const types = blocks.map(b => b.type);
    expect(types).toContain('text');
    expect(types).toContain('reasoning');
    expect(types).toContain('citation');
  });

  it('parses tool_call with "tool" key variant', () => {
    const raw = '<tool_call>{"tool":"fetch","arguments":{"url":"https://example.com"}}</tool_call>';
    const blocks = parseStructuredOutput(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'tool_call',
      toolName: 'fetch',
      args: { url: 'https://example.com' },
    });
  });
});

describe('extractJson', () => {
  it('extracts JSON from raw string', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts JSON from code block', () => {
    expect(extractJson('Some text\n```json\n{"b":2}\n```\nMore text')).toEqual({ b: 2 });
  });

  it('returns null for invalid JSON', () => {
    expect(extractJson('not json at all')).toBeNull();
  });

  it('extracts arrays', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });
});

describe('validateJsonSchema', () => {
  it('validates required keys', () => {
    expect(validateJsonSchema({ name: 'test', age: 5 }, ['name', 'age'])).toEqual({ name: 'test', age: 5 });
  });

  it('returns null for missing keys', () => {
    expect(validateJsonSchema({ name: 'test' }, ['name', 'age'])).toBeNull();
  });

  it('returns null for non-objects', () => {
    expect(validateJsonSchema('string', ['key'])).toBeNull();
    expect(validateJsonSchema(null, ['key'])).toBeNull();
  });
});

describe('block helpers', () => {
  const blocks = parseStructuredOutput(
    'Hello\n<thinking>Reason</thinking>\n<tool_call>{"name":"x","args":{}}</tool_call>\nBye',
  );

  it('getBlocks filters by type', () => {
    expect(getBlocks(blocks, 'text')).toHaveLength(2);
    expect(getBlocks(blocks, 'reasoning')).toHaveLength(1);
    expect(getBlocks(blocks, 'tool_call')).toHaveLength(1);
  });

  it('getTextContent joins text blocks', () => {
    const text = getTextContent(blocks);
    expect(text).toContain('Hello');
    expect(text).toContain('Bye');
  });

  it('getToolCalls returns tool call blocks', () => {
    const calls = getToolCalls(blocks);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe('x');
  });

  it('hasReasoning detects reasoning blocks', () => {
    expect(hasReasoning(blocks)).toBe(true);
    expect(hasReasoning([{ type: 'text', content: 'no reasoning' }])).toBe(false);
  });
});
