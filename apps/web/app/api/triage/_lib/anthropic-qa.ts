// What: Anthropic Messages-API wrapper for a Q&A turn. Constructs the
//       two custom tools (ask_next_question + confirm_assessment), the
//       web_search server tool (reused via WEB_SEARCH_TOOL_TYPE), and
//       sends the full prior conversation thread as alternating user /
//       assistant messages. Builds tool_choice from `forceConfirm`:
//       round-3 cap + skip path force `{ type: 'tool', name:
//       'confirm_assessment' }`; otherwise `{ type: 'auto' }`.
// Why:  spec § API contracts step 6 — single seam between the Q&A
//       route handler and the SDK. The `baseURL` override exists so
//       E2E + integration tests can point at a local mock server (same
//       seam as the initial-read wrapper). Force-confirm is the
//       server-side cap mechanism (D4 + D9) — robust to model
//       misbehavior compared to prompt-only nudging.
// Does NOT: Parse the response (parseQaTurn owns that — keeps runtime
//           validation as a clean transport-layer boundary). Doesn't
//           fire PostHog (server-side surface). Doesn't carry image
//           bytes past round 1 — only the first user message in the
//           thread gets image blocks (the rest are text-only, per
//           spec § API #6).

import Anthropic from '@anthropic-ai/sdk';
import type { Base64Image } from './photos';
import {
  CONTRACTOR_TAG_VALUES,
  SEVERITY_VALUES,
  SYSTEM_TAG_VALUES,
} from './parse-tool-output';
import { DEFAULT_TRIAGE_MODEL, WEB_SEARCH_TOOL_TYPE } from './anthropic';

/** Re-export the SDK-pinned constants so the route + tests see one
 *  source of truth without importing the initial-read wrapper. */
export { DEFAULT_TRIAGE_MODEL, WEB_SEARCH_TOOL_TYPE };

/** Tool-name constants — used by the wrapper to build the schema +
 *  by tests to assert call shape. */
export const ASK_NEXT_QUESTION_TOOL_NAME = 'ask_next_question';
export const CONFIRM_ASSESSMENT_TOOL_NAME = 'confirm_assessment';

/** Max web_search calls per Q&A turn (matches initial-read budget). */
const WEB_SEARCH_MAX_USES = 5;

/** Default SDK timeout. Q&A turn latency is 5-12s p50 (no image past
 *  round 1); 30s covers slow-path + web_search retries. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** A single conversation turn passed into the wrapper. The wrapper
 *  decides which image blocks to attach (only the first user message
 *  gets photos; rest are text-only). */
export type QaMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** Input args for the wrapper. */
export type CallQaTurnInput = {
  apiKey: string;
  model?: string;
  baseURL?: string;
  system: string;
  /** Full prior thread + the current user reply, alternating roles.
   *  The wrapper does NOT enforce alternation — it passes through as-is
   *  so the caller can experiment with rare shapes (e.g. assistant
   *  starting a turn). */
  messages: QaMessage[];
  /** Image blocks for the FIRST user message only. Subsequent user
   *  messages stay text-only. */
  images: Base64Image[];
  /** Force the model to call confirm_assessment exclusively (round-3
   *  cap OR user skip path — D4 + D9). */
  forceConfirm: boolean;
  timeoutMs?: number;
};

/** Build the JSON schema for the ask_next_question tool. */
function buildAskNextQuestionTool() {
  return {
    name: ASK_NEXT_QUESTION_TOOL_NAME,
    description:
      'Ask the homeowner one focused question. Use when you genuinely need one more piece of information before confirming. Set is_location_ask=true ONLY when the homeowner location would meaningfully change your assessment — location asks are free and do not count against the 3-question budget.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'One plain-English question. Phrase it for a yes/no or one-line answer.',
        },
        is_location_ask: {
          type: 'boolean',
          description:
            'True when this question is asking for the homeowner location (climate / code / region info). False otherwise.',
        },
        updated_provisional_severity: {
          type: 'string',
          enum: SEVERITY_VALUES,
          description:
            'Your current best severity guess after the conversation so far.',
        },
        reasoning_so_far: {
          type: 'string',
          description:
            'One or two short lines summarizing what has been established. Used as context next turn.',
        },
      },
      required: [
        'question',
        'is_location_ask',
        'updated_provisional_severity',
        'reasoning_so_far',
      ],
    },
  };
}

/** Build the JSON schema for the confirm_assessment tool. */
function buildConfirmAssessmentTool() {
  return {
    name: CONFIRM_ASSESSMENT_TOOL_NAME,
    description:
      'Confirm your final assessment of the issue. Use when you have what you need OR when the operator has forced you to commit (round 3 cap or user-requested skip).',
    input_schema: {
      type: 'object',
      properties: {
        final_diagnosis: {
          type: 'string',
          description:
            'One or two short paragraphs of plain-English read. What you think is going on, why, what comes next.',
        },
        severity_confirmed: {
          type: 'string',
          enum: SEVERITY_VALUES,
          description: 'Confirmed severity tier.',
        },
        system_tag: {
          type: 'string',
          enum: SYSTEM_TAG_VALUES,
          description: 'Closest match from the system enum.',
        },
        contractor_tag: {
          type: 'string',
          enum: CONTRACTOR_TAG_VALUES,
          description:
            'Closest contractor-type match. "diy" when the homeowner can plausibly handle it themselves.',
        },
        monitoring_cadence_days_proposal: {
          type: 'integer',
          minimum: 1,
          description:
            'Days between check-backs. Pick a number calibrated to severity.',
        },
        confidence_note: {
          type: 'string',
          description:
            'One short sentence on what you are confident about and what you are not.',
        },
        sources: {
          type: 'array',
          maxItems: 5,
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
      },
      required: [
        'final_diagnosis',
        'severity_confirmed',
        'system_tag',
        'contractor_tag',
        'monitoring_cadence_days_proposal',
        'confidence_note',
        'sources',
      ],
    },
  };
}

/** Build the web_search server-tool entry — pinned to the SDK 0.96.0
 *  variant (spec § Gotchas — empirical-verify). */
function buildWebSearchTool() {
  return {
    name: 'web_search',
    type: WEB_SEARCH_TOOL_TYPE,
    max_uses: WEB_SEARCH_MAX_USES,
  };
}

/** Build the content array for a single user message. The wrapper
 *  attaches image blocks to the FIRST user message only — subsequent
 *  user turns are text-only. */
function buildUserContent(text: string, images: Base64Image[]) {
  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.media_type,
      data: img.data,
    },
  }));
  return [...imageBlocks, { type: 'text' as const, text }];
}

/**
 * Compose the SDK `messages` array. The first user message carries
 * image blocks; assistant + subsequent user messages are text-only.
 * Empty/missing thread is tolerated — caller controls the shape.
 */
function buildMessages(messages: QaMessage[], images: Base64Image[]) {
  let firstUserAttached = false;
  return messages.map((m) => {
    if (m.role === 'user' && !firstUserAttached) {
      firstUserAttached = true;
      return {
        role: 'user' as const,
        content: buildUserContent(m.content, images),
      };
    }
    return {
      role: m.role,
      content: [{ type: 'text' as const, text: m.content }],
    };
  });
}

/**
 * Call Claude with the Q&A turn prompt + tools. Returns the raw SDK
 * Messages response — the caller pulls the tool_use block via
 * parseQaTurn.
 *
 * `forceConfirm=true` flips `tool_choice` to `{ type: 'tool', name:
 * 'confirm_assessment' }` (D4 + D9). `false` uses `{ type: 'auto' }`
 * so the model picks between the two tools.
 */
export async function callQaTurn(input: CallQaTurnInput) {
  const client = new Anthropic({
    apiKey: input.apiKey,
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const tool_choice = input.forceConfirm
    ? { type: 'tool' as const, name: CONFIRM_ASSESSMENT_TOOL_NAME }
    : { type: 'auto' as const };

  const response = await client.messages.create({
    model: input.model ?? DEFAULT_TRIAGE_MODEL,
    max_tokens: 4096,
    system: input.system,
    messages: buildMessages(input.messages, input.images),
    tools: [
      buildAskNextQuestionTool(),
      buildConfirmAssessmentTool(),
      buildWebSearchTool(),
    ] as never,
    tool_choice,
  });

  return response;
}
