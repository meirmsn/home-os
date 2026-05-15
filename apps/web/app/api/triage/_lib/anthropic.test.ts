// What: Unit tests for callInitialRead — the Anthropic Messages wrapper.
//       Mocks the SDK constructor + messages.create to assert the call
//       shape (model, system, messages, tools, tool_choice, max_tokens,
//       timeout, baseURL).
// Why:  This is the one place where SDK-version-specific constants
//       (model literal, web_search tool type) are baked in. A regression
//       that silently changed one of those would surface as a 400 from
//       Anthropic at runtime; locking the call shape here catches it
//       before deploy.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ctorSpy, createSpy } = vi.hoisted(() => ({
  ctorSpy: vi.fn(),
  createSpy: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor(opts: unknown) {
        ctorSpy(opts);
      }
      messages = {
        create: createSpy,
      };
    },
  };
});

import {
  callInitialRead,
  DEFAULT_TRIAGE_MODEL,
  RECORD_INITIAL_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_TYPE,
} from './anthropic';

beforeEach(() => {
  ctorSpy.mockReset();
  createSpy.mockReset();
  createSpy.mockResolvedValue({ id: 'msg_test', content: [] });
});

describe('callInitialRead', () => {
  it('constructs the SDK with the apiKey + default 30s timeout', async () => {
    await callInitialRead({
      apiKey: 'sk-ant-test',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.apiKey).toBe('sk-ant-test');
    expect(opts.timeout).toBe(30_000);
    expect(opts.baseURL).toBeUndefined();
  });

  it('threads through a baseURL override (test seam)', async () => {
    await callInitialRead({
      apiKey: 'k',
      baseURL: 'http://127.0.0.1:54321',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.baseURL).toBe('http://127.0.0.1:54321');
  });

  it('threads through a timeoutMs override', async () => {
    await callInitialRead({
      apiKey: 'k',
      timeoutMs: 5_000,
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.timeout).toBe(5_000);
  });

  it('defaults model to claude-sonnet-4-6 (spec D1)', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.model).toBe(DEFAULT_TRIAGE_MODEL);
    expect(args.model).toBe('claude-sonnet-4-6');
  });

  it('accepts a model override', async () => {
    await callInitialRead({
      apiKey: 'k',
      model: 'claude-opus-4-7',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.model).toBe('claude-opus-4-7');
  });

  it('passes the system prompt verbatim', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'CALM PERSONA',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.system).toBe('CALM PERSONA');
  });

  it('composes one user message with image blocks first then a text block', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'A leaking faucet under the kitchen sink.',
      images: [
        { media_type: 'image/jpeg', data: 'AAA=' },
        { media_type: 'image/jpeg', data: 'BBB=' },
      ],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.messages).toHaveLength(1);
    expect(args.messages[0].role).toBe('user');
    const content = args.messages[0].content;
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA=' },
    });
    expect(content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB=' },
    });
    expect(content[2]).toEqual({
      type: 'text',
      text: 'A leaking faucet under the kitchen sink.',
    });
  });

  it('composes a user message with a single text block when there are no images', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'No photo description.',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    const content = args.messages[0].content;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'No photo description.',
    });
  });

  it('includes the record_initial_read custom tool with the right schema', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    const recordTool = args.tools.find(
      (t: { name?: string }) => t.name === RECORD_INITIAL_READ_TOOL_NAME
    );
    expect(recordTool).toBeTruthy();
    expect(recordTool.input_schema.type).toBe('object');
    expect(recordTool.input_schema.required).toEqual([
      'summary',
      'severity_provisional',
      'what_im_confident_about',
      'what_i_need_to_know',
      'sources',
      'system_tag_proposed',
      'contractor_tag_proposed',
    ]);
  });

  it('includes the web_search server tool pinned to web_search_20260209', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    const webSearch = args.tools.find(
      (t: { type?: string }) => t.type === WEB_SEARCH_TOOL_TYPE
    );
    expect(webSearch).toBeTruthy();
    expect(webSearch.name).toBe('web_search');
    expect(webSearch.type).toBe('web_search_20260209');
    expect(webSearch.max_uses).toBe(5);
  });

  it('forces tool_choice to record_initial_read (D3)', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.tool_choice).toEqual({
      type: 'tool',
      name: RECORD_INITIAL_READ_TOOL_NAME,
    });
  });

  it('sets max_tokens to 4096', async () => {
    await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.max_tokens).toBe(4096);
  });

  it('returns the raw SDK response', async () => {
    createSpy.mockResolvedValue({ id: 'msg_abc', content: [{ type: 'text' }] });
    const result = await callInitialRead({
      apiKey: 'k',
      system: 'sys',
      userText: 'desc',
      images: [],
    });
    expect(result).toEqual({ id: 'msg_abc', content: [{ type: 'text' }] });
  });
});
