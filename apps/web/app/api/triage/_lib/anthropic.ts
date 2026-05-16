// What: Anthropic Messages-API wrapper for the triage initial-read call.
//       Constructs the `record_initial_read` custom tool + the
//       `web_search` server tool, composes the user message (image
//       blocks + final text block), forces the model to call
//       `record_initial_read` exclusively via `tool_choice`, and returns
//       the raw SDK response so the route handler can dispatch to
//       parseInitialRead.
// Why:  spec § API contracts § POST /api/triage #7 — single seam between
//       the route and the Anthropic SDK. The wrapper accepts a `baseURL`
//       override so E2E + integration tests can point at a local mock
//       server (spec § E2E test test-seam decision).
// Does NOT: Parse the response (parseInitialRead owns that — keeps
//           runtime validation as a clean transport-layer boundary).
//           Doesn't fire PostHog (server-side surface; spec § Gotchas #7).

import Anthropic from '@anthropic-ai/sdk';
import type { Base64Image } from './photos';
import {
  CONTRACTOR_TAG_VALUES,
  SEVERITY_VALUES,
  SYSTEM_TAG_VALUES,
} from './parse-tool-output';

/** Default model per spec D1. SDK 0.96.0 exports `claude-sonnet-4-6` as
 *  a first-class member of the `Model` union — no dated suffix needed.
 *  Recorded in tasks.md § Decisions. */
export const DEFAULT_TRIAGE_MODEL = 'claude-sonnet-4-6';

/** Web-search server-tool definition. Per spec § Gotchas #1
 *  ("empirical-verify rule") we pin to `web_search_20260209` — the
 *  newer of the two variants shipping in @anthropic-ai/sdk@0.96.0
 *  (`WebSearchTool20250305` + `WebSearchTool20260209` both available).
 *  Both share `name: 'web_search'`. */
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209' as const;

/** Forced tool name — the model must call record_initial_read (D3). */
export const RECORD_INITIAL_READ_TOOL_NAME = 'record_initial_read';

/** Max searches per call (D2). */
const WEB_SEARCH_MAX_USES = 5;

/** Default Anthropic SDK timeout per call (spec § API contracts #7). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Input args for the wrapper. */
export type CallInitialReadInput = {
  apiKey: string;
  model?: string;
  baseURL?: string;
  system: string;
  userText: string;
  images: Base64Image[];
  timeoutMs?: number;
};

/** Build the JSON schema for the record_initial_read tool. Values
 *  mirror parse-tool-output's runtime validator + the Postgres enums
 *  so the model is constrained on its end, then we double-check on
 *  ours. */
function buildRecordInitialReadTool() {
  return {
    name: RECORD_INITIAL_READ_TOOL_NAME,
    description:
      'Record your initial read of the captured home maintenance issue. Call this EXACTLY ONCE per request — do not return a text response. Be calibrated, calm, and source any web-search-derived claims.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description:
            'One or two short paragraphs of plain-English read. What you see, what it likely is, why it matters.',
        },
        severity_provisional: {
          type: 'string',
          enum: SEVERITY_VALUES,
          description:
            'Four-tier severity calibrated to homeowner action. cosmetic = months/years window, monitor = 30-90d check-back, soon = next few weeks, urgent = same/next-day safety or rapidly worsening.',
        },
        what_im_confident_about: {
          type: 'string',
          description:
            'One or two specific things you can say with high confidence from the evidence.',
        },
        what_i_need_to_know: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string' },
          description:
            '1 to 3 short, specific clarifying questions ordered by how much each would change your read. Yes/no or one-line answers, not essays.',
        },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
            },
            required: ['url', 'title'],
          },
          description:
            'Every URL you cited from web_search, with the page title. Empty array when you did not search.',
        },
        system_tag_proposed: {
          type: 'string',
          enum: SYSTEM_TAG_VALUES,
          description:
            'Closest match from the system enum. Pick "other" only when no specific match applies.',
        },
        contractor_tag_proposed: {
          type: 'string',
          enum: CONTRACTOR_TAG_VALUES,
          description:
            'Closest contractor-type match. "diy" when the homeowner can plausibly handle it themselves.',
        },
      },
      required: [
        'summary',
        'severity_provisional',
        'what_im_confident_about',
        'what_i_need_to_know',
        'sources',
        'system_tag_proposed',
        'contractor_tag_proposed',
      ],
    },
  };
}

/** Build the web_search server-tool entry — pinned to the empirically
 *  verified version from @anthropic-ai/sdk@0.96.0. */
function buildWebSearchTool() {
  return {
    name: 'web_search',
    type: WEB_SEARCH_TOOL_TYPE,
    max_uses: WEB_SEARCH_MAX_USES,
  };
}

/** Compose the user message content array — image blocks first, then a
 *  final text block carrying the description + room/system context. */
function buildUserContent(userText: string, images: Base64Image[]) {
  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.media_type,
      data: img.data,
    },
  }));
  return [...imageBlocks, { type: 'text' as const, text: userText }];
}

/**
 * Call Claude with the triage initial-read prompt + tools. Returns the
 * raw SDK Messages response — the caller parses `response.content` to
 * pull the record_initial_read tool_use block.
 *
 * The `baseURL` override exists so E2E + integration tests can route to
 * a local mock server (spec § E2E — Phase 2 Decision logged in tasks.md).
 */
export async function callInitialRead(input: CallInitialReadInput) {
  const client = new Anthropic({
    apiKey: input.apiKey,
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const response = await client.messages.create({
    model: input.model ?? DEFAULT_TRIAGE_MODEL,
    max_tokens: 4096,
    system: input.system,
    messages: [
      {
        role: 'user',
        content: buildUserContent(input.userText, input.images),
      },
    ],
    tools: [buildRecordInitialReadTool(), buildWebSearchTool()] as never,
    tool_choice: {
      type: 'tool',
      name: RECORD_INITIAL_READ_TOOL_NAME,
    },
  });

  return response;
}
