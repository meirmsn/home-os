// What: Operator-run accuracy harness for the triage initial-read prompt. Loads
//       dataset.json, calls the live triage seam (callInitialRead) for each
//       entry with bounded concurrency, parses + scores the model's severity +
//       DIY/hire path against the labels, prints a per-category + overall report,
//       and exits non-zero when a gated metric is below threshold (D5, D7).
// Why:  The regression gate for the AI core — re-run before any prompt change so
//       a regression below the floor surfaces as a non-zero exit (eng-review
//       Pre-Ship Requirement #2). Not a CI step (D6) — non-deterministic + costs
//       ~75 real API calls.
// Does NOT: Run in CI, touch the DB/auth/HTTP route, or import photos.ts for
//           value (keeps the runner's runtime graph Next-server-free, Gotcha a).
//           Uses RELATIVE imports into _lib so tsx resolves them regardless of
//           tsconfig path-alias support (spec import note + Gotcha a).

import {
  callInitialRead,
  RECORD_INITIAL_READ_TOOL_NAME,
} from '../../app/api/triage/_lib/anthropic';
import { resolveSystemPrompt } from '../../app/api/triage/_lib/prompt';
import { parseInitialRead } from '../../app/api/triage/_lib/parse-tool-output';
import type { DatasetEntry } from './types';
import {
  aggregate,
  DEFAULT_THRESHOLDS,
  pathFromContractorTag,
  severityAdjacent,
  severityExact,
  type EntryResult,
  type ScoreReport,
  type Thresholds,
} from './score';
import datasetJson from './dataset.json';

const dataset = datasetJson as DatasetEntry[];

/** Parse a positive float env var, falling back when unset/invalid. */
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a positive int env var, falling back when unset/invalid. */
function envInt(name: string, fallback: number): number {
  const n = envFloat(name, fallback);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Pull the record_initial_read tool_use block's `.input` from an SDK
 *  response, or null when the model returned no such block (refusal). */
function extractToolInput(response: unknown): unknown {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('content' in response)
  ) {
    return null;
  }
  const content = (response as { content: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === RECORD_INITIAL_READ_TOOL_NAME
    ) {
      return (block as { input?: unknown }).input ?? null;
    }
  }
  return null;
}

/** Build the `ok: false` miss EntryResult for an errored entry. */
function errorResult(entry: DatasetEntry, message: string): EntryResult {
  return {
    id: entry.id,
    category: entry.category,
    ok: false,
    label_severity: entry.label_severity,
    pred_severity: null,
    severity_exact: false,
    severity_adjacent: false,
    label_path: entry.label_path,
    pred_path: null,
    path_correct: false,
    label_system_tag: entry.label_system_tag,
    pred_system_tag: null,
    system_tag_correct: false,
    error: message,
  };
}

/** Run one entry through the live seam and score it. Never throws — an API
 *  or parse failure becomes an `ok: false` miss + a console.warn. */
async function scoreEntry(
  entry: DatasetEntry,
  opts: { apiKey: string; model?: string; baseURL?: string; system: string }
): Promise<EntryResult> {
  try {
    const response = await callInitialRead({
      apiKey: opts.apiKey,
      model: opts.model,
      baseURL: opts.baseURL,
      system: opts.system,
      userText: entry.description,
      images: [],
    });

    const input = extractToolInput(response);
    if (input === null) {
      const msg = 'no record_initial_read tool_use block in response';
      console.warn(`[eval] ${entry.id}: ${msg}`);
      return errorResult(entry, msg);
    }

    const parsed = parseInitialRead(input);
    if (!parsed.ok) {
      const msg = `parse error: ${parsed.field} — ${parsed.reason}`;
      console.warn(`[eval] ${entry.id}: ${msg}`);
      return errorResult(entry, msg);
    }

    const predSeverity = parsed.value.severity_provisional;
    const predPath = pathFromContractorTag(
      parsed.value.contractor_tag_proposed
    );
    const predSystemTag = parsed.value.system_tag_proposed;

    return {
      id: entry.id,
      category: entry.category,
      ok: true,
      label_severity: entry.label_severity,
      pred_severity: predSeverity,
      severity_exact: severityExact(predSeverity, entry.label_severity),
      severity_adjacent: severityAdjacent(predSeverity, entry.label_severity),
      label_path: entry.label_path,
      pred_path: predPath,
      path_correct: predPath === entry.label_path,
      label_system_tag: entry.label_system_tag,
      pred_system_tag: predSystemTag,
      system_tag_correct: predSystemTag === entry.label_system_tag,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[eval] ${entry.id}: API error — ${msg}`);
    return errorResult(entry, msg);
  }
}

/** Map entries to results with a bounded worker pool (preserves order). */
async function runPool(
  entries: DatasetEntry[],
  concurrency: number,
  worker: (entry: DatasetEntry) => Promise<EntryResult>
): Promise<EntryResult[]> {
  const results: EntryResult[] = new Array(entries.length);
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(concurrency, entries.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= entries.length) return;
        const entry = entries[i];
        if (entry === undefined) return;
        results[i] = await worker(entry);
      }
    }
  );
  await Promise.all(lanes);
  return results;
}

/** Format a 0..1 rate as a percentage string. */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Print the per-category + overall report and the PASS/FAIL banner. */
function printReport(report: ScoreReport): void {
  console.log('\n=== Triage eval report ===\n');
  console.table(
    report.perCategory.map((c) => ({
      category: c.category,
      n: c.n,
      'sev exact': pct(c.severityExactRate),
      'sev adj': pct(c.severityAdjacentRate),
      path: pct(c.pathAccuracy),
      'sys tag': pct(c.systemTagAccuracy),
    }))
  );

  const o = report.overall;
  console.log('\nOverall:');
  console.log(
    `  entries:           ${o.n} (${o.errors} errored → counted as misses)`
  );
  console.log(
    `  severity exact:    ${pct(o.severityExactRate)}  (gate >= ${pct(report.thresholds.severityExact)})`
  );
  console.log(
    `  severity adjacent: ${pct(o.severityAdjacentRate)}  (reported-only)`
  );
  console.log(
    `  path accuracy:     ${pct(o.pathAccuracy)}  (gate >= ${pct(report.thresholds.path)})`
  );
  console.log(
    `  system tag acc:    ${pct(o.systemTagAccuracy)}  (reported-only)`
  );

  console.log(
    `\n${report.passed ? 'PASS ✅' : 'FAIL ❌'} — gated metrics ${
      report.passed ? 'cleared' : 'below'
    } threshold\n`
  );
}

/** Entry point: guard the API key, resolve options + thresholds, run the
 *  dataset through the live seam with bounded concurrency, print the report,
 *  and exit non-zero on a gated-metric miss. */
async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    console.error('ANTHROPIC_API_KEY is required to run the triage eval');
    process.exit(1);
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || undefined;
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  const concurrency = envInt('EVAL_CONCURRENCY', 4);
  const thresholds: Thresholds = {
    severityExact: envFloat(
      'EVAL_SEVERITY_THRESHOLD',
      DEFAULT_THRESHOLDS.severityExact
    ),
    path: envFloat('EVAL_PATH_THRESHOLD', DEFAULT_THRESHOLDS.path),
  };

  const system = resolveSystemPrompt();

  console.log(
    `Running triage eval over ${dataset.length} entries ` +
      `(model=${model ?? 'default'}, concurrency=${concurrency})...`
  );

  const results = await runPool(dataset, concurrency, (entry) =>
    scoreEntry(entry, { apiKey, model, baseURL, system })
  );

  const report = aggregate(results, thresholds);
  printReport(report);

  process.exit(report.passed ? 0 : 1);
}

void main();
