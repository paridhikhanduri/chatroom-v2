/* ==========================================================================
   chat-room — mediation.js
   Real local AI mediation via Ollama.

   Design intent (per project brief, deliberately unusual): this is NOT
   trying to hide that a message was AI-mediated. The whole point of the
   installation is to surface what happens when everyday human chat
   passes through an LLM — so the style rules below deliberately lean
   INTO a couple of recognizable AI-writing patterns (drawn from
   Wikipedia's "Signs of AI writing" essay), while separate, stricter
   rules make sure the model only ever EDITS the sender's actual message
   — never answers it, continues the conversation, or invents content
   that wasn't there.

   NOTE ON STYLE SCOPE (v11): earlier drafts included structural style
   instructions (rule-of-three groupings, "it's not just X, it's Y"
   constructions, summarizing flourishes, formal transitions). Those
   were removed here because they were observed to actively cause
   content invention on short/question-form messages — satisfying "group
   things in three" or "add a closing flourish" on a one-line message
   effectively requires fabricating material that was never there. Only
   the two style instructions below (em dashes, vocabulary) are
   surface-level substitutions that don't require adding new content, so
   they're the ones kept.
   ========================================================================== */

'use strict';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 15000;

// Per-scenario tone direction — kept separate from the universal rules
// below so this can be edited or extended (e.g. once Friendship exists)
// without touching the core prompt logic at all.
const SCENARIO_STYLES = {
  office:
    'Lean professional and measured — workplace-appropriate, respectful, composed.',
  romance:
    "Lean warm and a little playful. Amplify whatever warmth or interest is " +
    "already present in what they wrote — do not invent affection, " +
    "compliments, or interest that wasn't there.",
};

function buildSystemPrompt(scenario) {
  const core =
    'You are a silent text editor embedded inside a live two-person chat. You ' +
    'are NOT a participant in this conversation and must never act like one. ' +
    'You will be given ONE message that a real person is about to send to ' +
    'another real person. Your only job is to edit that exact message — ' +
    'improving tone, emotion, grammar, and clarity as best as you can — while keeping it ' +
    'recognizably the same message from the same speaker.';

  // Behavioral guardrails — kept strict and unambiguous on purpose. These
  // exist because of specific observed failures: the model answering
  // questions instead of editing them, and inventing new topics/content
  // that were never part of the original message.
  const rules =
    '- Do NOT reply to the message or answer it on your behalf as an agent — ' +
    'even if it is phrased as a question. A question stays a question; you ' +
    'may improve its wording, tone, structuring, but never supply an answer to it.\n' +
    '- Do NOT add new ideas or opinions the sender did ' +
    'not already express. "Clearer" means rephrasing what is already there — ' +
    'it never means filling in ideas the sender ' +
    'left unsaid.\n' +
    '- Do NOT expand a short message into multiple sentences or a longer ' +
    'structure just to sound more polished. If the original is one short ' +
    'sentence, the edited version should still be about one short sentence.';

  // Style rules — deliberately leaning INTO a couple of recognizable
  // AI-writing patterns (see file header), trimmed down to ONLY
  // surface-level substitutions that don't require inventing new
  // content (unlike rule-of-three groupings, negation-pivot
  // constructions, or summarizing flourishes, which were removed).
  const style =
    'WRITING STYLE:\n' +
    '- Where it fits naturally, use an em dash — for emphasis or to connect ' +
    'a closely related clause — as a polished, AI-typical alternative to a ' +
    'comma.\n' +
    '- Where a more elevated, polished word choice fits naturally in place ' +
    'of a plainer one, prefer it (for example: delve, pivotal, tapestry, ' +
    'underscore, landscape, foster, testament, enhance, crucial, intricate). ' +
    'Only substitute words that are already implied by the original message ' +
    '— do not use this as a reason to add new clauses or ideas.';

  const outputInstruction =
    'Output ONLY the edited version of the message — no quotation marks, no ' +
    'preamble, no explanation, nothing else.';

  const parts = [core, rules, style];

  if (scenario && SCENARIO_STYLES[scenario]) {
    parts.push(`SCENARIO TONE: ${SCENARIO_STYLES[scenario]}`);
  }

  parts.push(outputInstruction);

  return parts.join('\n\n');
}

/**
 * @param {string} text - the sender's original message, already trimmed
 * @param {{
 *   scenario: string|null,
 *   roomId: string,
 *   senderPromptText: string|null,
 *   receiverPromptText: string|null,
 *   history: Array<{ sender: string, text: string, timestamp: number }>
 * }} context
 * @returns {Promise<string>} the rewritten text, or the original text
 *   unchanged if Ollama is unreachable, times out, or returns something
 *   unusable — mediation should never cause a message to be lost. This
 *   is the ONLY fallback case; there is deliberately no length-based
 *   fallback — every message that successfully reaches the model gets
 *   delivered as mediated, even if it runs longer than requested.
 */
async function mediateMessage(text, context) {
  const wordCount = text.trim().split(/\s+/).length;
  const maxWords = wordCount + 25;

  const systemPrompt =
    buildSystemPrompt(context.scenario) +
    `\n\nLENGTH LIMIT: The original message is ${wordCount} word(s) long. Your ` +
    `edited version must be no more than ${maxWords} words — shorter, or the ` +
    `same length, is preferred. Do not pad the message out to reach this limit.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        stream: false,
        // Critical for hybrid reasoning models (gemma4, qwen3.5, etc.) —
        // without this, they generate a lengthy internal "thinking"
        // trace before ever producing the actual answer, which is what
        // was blowing through the timeout on every message. Harmless
        // no-op for non-reasoning models (e.g. llama3.2), so safe to
        // leave on regardless of which model is configured.
        think: false,
        options: {
          // Kept low to curb topical/content invention — the style
          // rules above are now surface-level substitutions only, so
          // low temperature no longer works against them the way it
          // might have against the removed structural instructions.
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const rewritten =
      data && data.message && typeof data.message.content === 'string'
        ? data.message.content.trim()
        : null;

    const elapsedMs = Date.now() - startTime;
    console.log(`[mediation] completed in ${elapsedMs}ms (model: ${OLLAMA_MODEL})`);

    return rewritten || text; // unexpected/empty response shape -> fall back
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    console.log(`[mediation] FAILED after ${elapsedMs}ms (model: ${OLLAMA_MODEL}): ${err.message}`);
    throw err; // chat.js's own try/catch handles the fallback-to-original-text
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { mediateMessage };