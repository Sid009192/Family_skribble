/**
 * words.ts — the default, family-friendly word list to draw.
 *
 * Kept simple and concrete (easy to draw). The host will be able to add custom
 * family words in a later phase; this is the built-in fallback.
 */

export const DEFAULT_WORDS: string[] = [
  // animals
  "cat", "dog", "elephant", "giraffe", "penguin", "octopus", "butterfly",
  "snake", "dolphin", "rabbit", "monkey", "tiger", "owl", "frog", "bee",
  // food
  "pizza", "banana", "ice cream", "burger", "carrot", "popcorn", "donut",
  "watermelon", "egg", "cake", "apple", "bread", "cheese", "lollipop",
  // things at home
  "chair", "lamp", "clock", "umbrella", "scissors", "toothbrush", "key",
  "ladder", "candle", "balloon", "pillow", "mirror", "spoon", "broom",
  // outdoors / nature
  "tree", "mountain", "rainbow", "sun", "moon", "star", "cloud", "flower",
  "river", "snowman", "volcano", "island", "cactus", "leaf",
  // vehicles
  "car", "train", "rocket", "bicycle", "airplane", "boat", "tractor",
  "helicopter", "submarine", "skateboard",
  // people / body
  "robot", "pirate", "wizard", "clown", "ghost", "king", "queen", "baby",
  // misc fun
  "guitar", "drum", "camera", "kite", "anchor", "crown", "treasure", "magnet",
  "telescope", "fireworks", "castle", "bridge", "lighthouse", "windmill",
];
