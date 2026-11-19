/**
 * Turns a dictated sentence into individual grocery items:
 *   "add milk, eggs and a loaf of bread"  ->  ["milk", "eggs", "loaf of bread"]
 *
 * Deliberately simple and local (no network). Known limit: items that contain
 * a joining word ("mac and cheese") are split; the user can fix that by tapping
 * the item's ✕ and typing it. A server-side LLM parse could replace this later.
 */

const SPLIT = /\s*(?:[,;.]|\b(?:and|then|also|plus|next)\b)\s*/i;
const LEADING_COMMAND =
  /^(?:(?:please|also|and|then|plus|um|uh)\s+)*(?:(?:add|put|get|buy|grab|pick up|we need|i need|need|we're out of|we are out of|out of)(?:\s+|$))?/i;
const LEADING_ARTICLE = /^(?:(?:a|an|the|some|more)\s+)+/i;
const TRAILING = /\s+(?:please|(?:to|on|onto)\s+(?:the|my|our)\s+(?:grocery\s+|shopping\s+)?list)$/i;

export function parseItems(transcript: string, maxLength = 80): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of transcript.split(SPLIT)) {
    const name = part
      .trim()
      .replace(TRAILING, "")
      .replace(LEADING_COMMAND, "")
      .replace(LEADING_ARTICLE, "")
      .replace(TRAILING, "")
      .trim()
      .slice(0, maxLength);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      items.push(name);
    }
  }
  return items;
}
