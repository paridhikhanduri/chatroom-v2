/* ==========================================================================
   chat-room — scenarios.js
   Random scenario + prompt-pair selection. Deliberately dumb/thin — all
   actual scenario content (Office, Romance, and eventually Friendship)
   lives in ../data/scenarios.json, never in this file. Adding a new
   scenario later means adding a new top-level key to that JSON file —
   nothing here needs to change for that.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.CHATROOM_SCENARIOS_PATH || path.join(__dirname, '..', 'data', 'scenarios.json');

function loadScenarios() {
  const resolvedPath = path.resolve(DATA_PATH);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw);
}

// Loaded once at server startup. If you edit scenarios.json while the
// server is running, restart the server to pick up the changes (no
// persistence/caching layer to worry about — matches the rest of this
// project's "in-memory, restart-is-fine" approach).
const scenarios = loadScenarios();

const scenarioKeys = Object.keys(scenarios);
if (scenarioKeys.length === 0) {
  throw new Error('[scenarios] scenarios.json has no scenarios defined — add at least one.');
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * A prompt pair's "a"/"b" side can be either a plain string (no role
 * label defined yet — e.g. Romance, for now) or a { role, text } object
 * (e.g. Office's "employee"/"supervisor"). This normalizes either shape
 * to { role: string|null, text: string } so callers never need to
 * branch on which format a given scenario happens to use.
 */
function normalizeSide(side) {
  if (typeof side === 'string') {
    return { role: null, text: side };
  }
  return { role: side.role || null, text: side.text || '' };
}

/**
 * Randomly selects one scenario and one prompt pair within it.
 * @returns {{
 *   scenarioKey: string,
 *   displayName: string,
 *   promptPair: {
 *     id: string,
 *     a: { role: string|null, text: string },
 *     b: { role: string|null, text: string }
 *   }
 * }}
 */
function pickScenarioAndPromptPair() {
  const scenarioKey = pickRandom(scenarioKeys);
  const scenario = scenarios[scenarioKey];
  const rawPair = pickRandom(scenario.promptPairs);
  const promptPair = {
    id: rawPair.id,
    a: normalizeSide(rawPair.a),
    b: normalizeSide(rawPair.b),
  };
  return { scenarioKey, displayName: scenario.displayName, promptPair };
}

module.exports = { pickScenarioAndPromptPair };
