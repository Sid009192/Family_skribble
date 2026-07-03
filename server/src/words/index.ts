/**
 * words/index.ts — turns a room's difficulty setting into the right pool of
 * default words. Bands overlap by one tier on purpose (see DECISIONS.md,
 * "Word difficulty levels") so a filtered pool never gets too small/repetitive.
 */

import type { Difficulty } from "@shared/types";
import { EASY_WORDS } from "./easy.js";
import { MEDIUM_WORDS } from "./medium.js";
import { HARD_WORDS } from "./hard.js";

export function poolForDifficulty(difficulty: Difficulty): string[] {
  switch (difficulty) {
    case "easy":
      return [...EASY_WORDS];
    case "medium":
      return [...EASY_WORDS, ...MEDIUM_WORDS];
    case "hard":
      return [...MEDIUM_WORDS, ...HARD_WORDS];
    case "mix":
    default:
      return [...EASY_WORDS, ...MEDIUM_WORDS, ...HARD_WORDS];
  }
}
