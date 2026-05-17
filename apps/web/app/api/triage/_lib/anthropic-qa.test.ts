// What: Unit tests for callQaTurn — the Q&A Anthropic Messages wrapper.
//       Mocks the SDK constructor + messages.create to assert call
//       shape (model, system, messages, tools, tool_choice,
//       max_tokens, timeout, baseURL).
// Why:  Locks the SDK-pinned constants (web_search variant, model
//       literal) + the force-confirm tool_choice dispatch + the
//       image-on-first-user-message-only behavior. Drift here lands as
//       a 400 from Anthropic; catch it before deploy.

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
  callQaTurn,
  ASK_NEXT_QUESTION_TOOL_NAME,
  CONFIRM_ASSESSMENT_TOOL_NAME,
  DEFAULT_TRIAGE_MODEL,
  WEB_SEARCH_TOOL_TYPE,
} from './anthropic-qa';

beforeEach(() => {
  ctorSpy.mockReset();
  createSpy.mockReset();
  createSpy.mockResolvedValue({ id: 'msg_test', content: [] });
});

const BASE_INPUT = {
  apiKey: 'sk-ant-test',
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'first user turn' }],
  images: [],
  forceConfirm: false,
};

describe('callQaTurn — SDK construction', () => {
  it('constructs the SDK with the apiKey + default 30s timeout', async () => {
    await callQaTurn(BASE_INPUT);
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.apiKey).toBe('sk-ant-test');
    expect(opts.timeout).toBe(30_000);
    expect(opts.baseURL).toBeUndefined();
  });

  it('threads through a baseURL override (test seam)', async () => {
    await callQaTurn({
      ...BASE_INPUT,
      baseURL: 'http://127.0.0.1:54321',
    });
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.baseURL).toBe('http://127.0.0.1:54321');
  });

  it('threads through a timeoutMs override', async () => {
    await callQaTurn({ ...BASE_INPUT, timeoutMs: 5_000 });
    const opts = ctorSpy.mock.calls[0]?.[0];
    expect(opts.timeout).toBe(5_000);
  });
});

describe('callQaTurn — messages.create call shape', () => {
  it('defaults model to claude-sonnet-4-6 (spec D1 from PR #19)', async () => {
    await callQaTurn(BASE_INPUT);
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.model).toBe(DEFAULT_TRIAGE_MODEL);
    expect(args.model).toBe('claude-sonnet-4-6');
  });

  it('accepts a model override', async () => {
    await callQaTurn({ ...BASE_INPUT, model: 'claude-opus-4-7' });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.model).toBe('claude-opus-4-7');
  });

  it('passes through the system prompt', async () => {
    await callQaTurn({ ...BASE_INPUT, system: 'CALIBRATED_PROMPT' });
    expect(createSpy.mock.calls[0]?.[0].system).toBe('CALIBRATED_PROMPT');
  });

  it('sets max_tokens=4096', async () => {
    await callQaTurn(BASE_INPUT);
    expect(createSpy.mock.calls[0]?.[0].max_tokens).toBe(4096);
  });
});

describe('callQaTurn — tools array', () => {
  it('includes ask_next_question, confirm_assessment, and web_search', async () => {
    await callQaTurn(BASE_INPUT);
    const tools = createSpy.mock.calls[0]?.[0].tools as Array<{
      name: string;
      type?: string;
    }>;
    const names = tools.map((t) => t.name);
    expect(names).toContain(ASK_NEXT_QUESTION_TOOL_NAME);
    expect(names).toContain(CONFIRM_ASSESSMENT_TOOL_NAME);
    expect(names).toContain('web_search');
    const webSearch = tools.find((t) => t.name === 'web_search');
    expect(webSearch?.type).toBe(WEB_SEARCH_TOOL_TYPE);
  });

  it('ask_next_question schema requires question + is_location_ask + updated_provisional_severity + reasoning_so_far', async () => {
    await callQaTurn(BASE_INPUT);
    const tools = createSpy.mock.calls[0]?.[0].tools as Array<{
      name: string;
      input_schema?: { required?: string[] };
    }>;
    const ask = tools.find((t) => t.name === ASK_NEXT_QUESTION_TOOL_NAME);
    expect(ask?.input_schema?.required).toEqual(
      expect.arrayContaining([
        'question',
        'is_location_ask',
        'updated_provisional_severity',
        'reasoning_so_far',
      ])
    );
  });

  it('confirm_assessment schema requires the seven Q&A fields', async () => {
    await callQaTurn(BASE_INPUT);
    const tools = createSpy.mock.calls[0]?.[0].tools as Array<{
      name: string;
      input_schema?: { required?: string[] };
    }>;
    const confirm = tools.find((t) => t.name === CONFIRM_ASSESSMENT_TOOL_NAME);
    expect(confirm?.input_schema?.required).toEqual(
      expect.arrayContaining([
        'final_diagnosis',
        'severity_confirmed',
        'system_tag',
        'contractor_tag',
        'monitoring_cadence_days_proposal',
        'confidence_note',
        'sources',
      ])
    );
  });
});

describe('callQaTurn — tool_choice dispatch', () => {
  it('uses { type: auto } when forceConfirm=false', async () => {
    await callQaTurn({ ...BASE_INPUT, forceConfirm: false });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.tool_choice).toEqual({ type: 'auto' });
  });

  it('uses { type: tool, name: confirm_assessment } when forceConfirm=true', async () => {
    await callQaTurn({ ...BASE_INPUT, forceConfirm: true });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.tool_choice).toEqual({
      type: 'tool',
      name: CONFIRM_ASSESSMENT_TOOL_NAME,
    });
  });
});

describe('callQaTurn — messages composition', () => {
  it('passes the messages array through', async () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'second' },
      { role: 'user' as const, content: 'third' },
    ];
    await callQaTurn({ ...BASE_INPUT, messages });
    const args = createSpy.mock.calls[0]?.[0];
    expect(args.messages.length).toBe(3);
    expect(args.messages[0].role).toBe('user');
    expect(args.messages[1].role).toBe('assistant');
    expect(args.messages[2].role).toBe('user');
  });

  it('attaches image blocks ONLY to the first user message', async () => {
    const images = [
      { media_type: 'image/jpeg' as const, data: 'AAAA' },
      { media_type: 'image/jpeg' as const, data: 'BBBB' },
    ];
    const messages = [
      { role: 'user' as const, content: 'first user' },
      { role: 'assistant' as const, content: 'first assistant' },
      { role: 'user' as const, content: 'second user (no images)' },
    ];
    await callQaTurn({ ...BASE_INPUT, messages, images });

    const args = createSpy.mock.calls[0]?.[0];
    // First user: image blocks + text block
    const firstUserContent = args.messages[0].content as Array<{
      type: string;
    }>;
    const imageBlocks = firstUserContent.filter((b) => b.type === 'image');
    const textBlocks = firstUserContent.filter((b) => b.type === 'text');
    expect(imageBlocks.length).toBe(2);
    expect(textBlocks.length).toBe(1);

    // Second user: text only
    const secondUserContent = args.messages[2].content as Array<{
      type: string;
    }>;
    expect(secondUserContent.every((b) => b.type === 'text')).toBe(true);

    // Assistant: text only
    const assistantContent = args.messages[1].content as Array<{
      type: string;
    }>;
    expect(assistantContent.every((b) => b.type === 'text')).toBe(true);
  });

  it('handles zero images (text-only first user message)', async () => {
    await callQaTurn(BASE_INPUT);
    const args = createSpy.mock.calls[0]?.[0];
    const firstUserContent = args.messages[0].content as Array<{
      type: string;
    }>;
    expect(firstUserContent.every((b) => b.type === 'text')).toBe(true);
  });
});
