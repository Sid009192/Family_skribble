/**
 * profanity.ts — a small, editable profanity censor for a family game.
 *
 * We CENSOR (replace with asterisks) rather than block, so play keeps flowing:
 *   "fuckface"  ->  "f*******"
 *
 * This runs on the SERVER, so it can't be bypassed by editing the browser.
 * The same `censorProfanity` is reused for chat/guesses in a later phase.
 *
 * Tradeoff to know about: we match these words even *inside* longer words, so
 * creative spellings ("shitty", "fucker") are caught — but very rarely an
 * innocent word that *contains* one of these could be partly starred. To keep
 * false positives low we avoid super-short roots (e.g. we list "dickhead",
 * not bare "dick", so the name "Dickens" is left alone). Tune the list freely.
 */

const BAD_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "bastard",
  "dickhead",
  "motherfucker",
  "bullshit",
  "piss",
  "slut",
  "whore",
  "douche",
  "prick",
  "wanker",
  "bollocks",
  "twat",
  // slurs — kept censored for a family setting
  "nigger",
  "faggot",
  "retard",
];

// Escape any regex-special characters, then match any listed word, anywhere,
// case-insensitively.
const escaped = BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const PATTERN = new RegExp(escaped.join("|"), "gi");

/** Replace each bad word with its first letter followed by asterisks. */
export function censorProfanity(text: string): string {
  return text.replace(PATTERN, (match) => match[0] + "*".repeat(Math.max(1, match.length - 1)));
}

/** True if the text contains any listed bad word (used by later features). */
export function containsProfanity(text: string): boolean {
  PATTERN.lastIndex = 0; // reset because the regex is global/stateful
  return PATTERN.test(text);
}
