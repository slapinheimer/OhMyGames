# Oh My GAMES! — Architecture & Developer Contract

A self-hosted suite of daily puzzles in three collections. **Oh My WORDS!** has the word games:
**Wordle, Quordle, Waffle, Deluxe Waffle, Stackdown, One Word Search, Tagline, Connections, Strands,
Letter Boxed, The Mini, The Midi, The Crossword, Lettergrams, Revealed, Spelling Bee, Squaredle, Contexto**.
**Oh My NUMBERS!** has the number games: **Twofold, Tally, Sudoku, Ballpark**. **Oh My PATTERNS!** has the
pattern games: **Motif, Crowns, Glow**. Pure static HTML/CSS/ES-module JS
(no build step, no npm), served by `python3 serve.py` from this directory.

## Run

```
python3 serve.py                 # http://localhost:8788 + LAN URL for phones/tablets
python3 tools/build_words.py     # rebuild data/words + data/crossword from sources
python3 tools/build_bee.py       # then rebuild data/words/bee-words.json (Spelling Bee answers)
python3 tools/build_contexto.py  # and data/contexto/ (after a one-time python3 tools/fetch_glove.py)
tools/build_conduit.mjs          # Conduit's winding-board bank, data/conduit/boards.json (JavaScript,
                                 # run with jsc; it shares the game's solver; usage is in the file)
```

## Layout

```
index.html                 home: Oh My GAMES! forks into the three collections (js/home.js)
words.html, numbers.html,  collection hubs: day picker + game cards (js/hub.js, data-collection)
patterns.html
<game>.html                one page per game. Patterns: motif, crowns, glow. Numbers: twofold, tally, sudoku, ballpark. Words: wordle, quordle, waffle, waffle-deluxe, stackdown, oneword, tagline, connections, strands,
                           letterboxed, mini, midi, crossword, lettergrams,
                           revealed, spellingbee, squaredle, contexto
css/base.css               design tokens (light/dark/high-contrast), shell, modals,
                           settings, stats, toasts, splash, buttons
css/<game>.css             game-specific styles (crossword.css shared by mini/midi/crossword)
js/core/                   SHARED — do not modify from a game; ask the architect
  theme-init.js            classic <head> script, applies theme before paint
  rng.js                   seeded RNG, date keys, currentPuzzle(), puzzleNumber()
  storage.js               get/set, loadState/saveState, getStats/recordResult/liveStreak
  settings.js              defineSettings(gameId, schema), getSetting, onSettingsChange,
                           HINTS_SETTING, hintsOn, watchHints
  ui.js                    el(), mountShell, showModal, toast, showSettings, showStats,
                           countdown, formatTime, share, splash, ICONS, iconButton,
                           hintButton, newGameButton, showPlayMore
  words.js                 loadDictionary, loadCommon, loadWordleAnswers/Valid,
                           loadCrosswordWords, loadJSON, loadText
  games.js                 COLLECTIONS, GAMES registry (id, name, page, icon, accent, tagline,
                           collection), gamesIn, collectionOf, playHref, hubHref; word games
  number-games.js          NUMBER_GAMES: the Oh My NUMBERS! entries (merged into GAMES)
  pattern-games.js         PATTERN_GAMES: the Oh My PATTERNS! entries (merged into GAMES)
js/hub.js, js/home.js      collection hub and home page modules
js/games/<game>.js         game entry module (+ optional js/games/<game>/ helpers)
data/words/                dictionary.txt (172k playable words, lowercase, 3+ letters)
                           common.json {word: rank} (~27k common words)
                           wordle-answers.json (~2k), wordle-valid.json (~8.6k)
data/crossword/words.json  {"3":[["ACE",score,["clue",...]],...],...,"15":[...]}
                           ~36k answers with WordNet-derived clues; score 10–100
                           (higher = more common / better fill)
data/<game>/               hand-curated game content (categories, themes, …)
img/<game>.svg             game icons
tools/                     offline build scripts (python3, stdlib only; build_conduit.mjs is JS)
```

## Collections and navigation

- `COLLECTIONS` in `games.js` lists Oh My WORDS! (`words.html`), Oh My NUMBERS! (`numbers.html`) and
  Oh My PATTERNS! (`patterns.html`). Every game has `collection`. Word games are listed in `games.js`,
  number games in `number-games.js`, pattern games in `pattern-games.js`.
- The shell brands each game with its collection: page title `<Game> — Oh My NUMBERS!`, the header
  brand link and splash link go to that collection's hub, and Settings names it.
- ☰ menu: **Words | Numbers | Patterns** tabs switch the game list in place, so a player can jump to the other
  collection from inside any game. "Oh My GAMES!" at the top goes home.
- 📅 Play more lists other games from the same collection, plus "Switch to Oh My …" for the others.
- Hubs have the same collection switch (its own row under the logo on phones) and keep the chosen day. `index.html?date=…` (old word-hub
  links) redirects to `words.html`.
- Storage keys stay `omw:…` for every collection. Don't rename them; saved progress lives there.

## Adding a number game (or a pattern game)

A pattern game follows the same steps with `js/core/pattern-games.js`, `— Oh My PATTERNS!` titles and
share text starting `Oh My PATTERNS! <Name> …`. `motif` is the reference pattern game.

Number games follow every rule below, exactly like word games (daily puzzle, archive, practice,
stats, share, hints, help, settings, 320px phones). Checklist:

1. Add an entry to `js/core/number-games.js`: `{ id, name, page, icon, accent, tagline }`.
   Hub order is array order. Don't edit `games.js` for this.
2. `<id>.html` from the page template, with `data-game="<id>"` and title `<Name> — Oh My NUMBERS!`.
3. `js/games/<id>.js` (+ optional `js/games/<id>/logic.js` for pure, testable logic),
   `css/<id>.css` with a `<id>-` or short class prefix, `img/<id>.svg` (64×64, rounded square,
   2px #121212 outline like the others).
4. Add `--accent-<id>` to the accent block in `css/base.css`.
5. Share text starts `Oh My NUMBERS! <Name> …`.
6. Use `seededRandom(gameId, puzzle.id)` for everything that defines the puzzle. Twofold shows how to
   keep chance events (new tiles) deterministic across reloads: seed each one from
   `"<puzzle id>#<move number>"`.
7. Make an original game: your own name, art and look, even when the mechanics follow a known genre.
8. Mention it in README.md's Numbers table.

`twofold` is the reference number game: score boxes, swipe and arrow-key input, a win you can play past
(`status: "won"` plus `keepGoing`), a hint that suggests a move, and a best score kept with `set()`.

## Page template

```html
<!doctype html>
<html lang="en" data-game="wordle">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Wordle — Oh My WORDS!</title>
  <link rel="icon" href="img/wordle.svg">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/wordle.css">
  <script src="js/core/theme-init.js"></script>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="js/games/wordle.js"></script>
</body>
</html>
```

## Game module lifecycle

```js
import { currentPuzzle, seededRandom } from "../core/rng.js";
import { loadState, saveState, getStats, recordResult, liveStreak } from "../core/storage.js";
import { defineSettings, getSetting, onSettingsChange } from "../core/settings.js";
import { el, mountShell, showModal, toast, showStats, splash, share } from "../core/ui.js";

const puzzle = currentPuzzle();          // { id, date, isDaily, isToday, number, seed? }
defineSettings("wordle", [...]);         // BEFORE mountShell so the gear shows them
const { main } = mountShell({ gameId: "wordle", puzzle, onHelp, onStats });
const rng = seededRandom("wordle", puzzle.id);   // deterministic per puzzle
let state = loadState("wordle", puzzle.id) || freshState();
await splash({ gameId: "wordle", puzzle, playLabel: state.status === "playing" && progress ? "Continue" : "Play" });
```

Rules every game follows:

1. **Determinism.** The daily puzzle is a pure function of `seededRandom(gameId, puzzle.id)`
   plus the data files. Never use `Math.random()` for puzzle construction.
2. **State.** Persist after every move with `saveState(gameId, puzzle.id, state)`.
   `state.status` must be `"playing" | "won" | "lost"` — the hub reads it to show
   "In progress" / "Done". Reloading restores exactly where the player was.
3. **Stats.** On finish call `recordResult(gameId, puzzle, { won, bucket, time })` once,
   then open stats via `showStats(...)` with tiles (Played / Win % / Current Streak /
   Max Streak or game-appropriate) and a distribution. Use `liveStreak(stats, todayKey())`.
4. **Share.** Emoji result text like NYT (`Oh My WORDS! Wordle 294 4/6` + grid), passed
   as `shareText` to `showStats` or via `share(text)`.
5. **Settings.** Game-specific options via `defineSettings`. Dark theme is global and
   appended automatically. Use CSS tokens from base.css so dark mode just works.
6. **Help.** `onHelp` opens a `showModal` "How To Play" with examples, NYT style.
   Auto-open help on the very first visit (`get/set("seen:<game>")`).
7. **Responsive.** Must work from 320px phones to desktops. Size boards with
   `min()`/`clamp()`/container math so nothing scrolls horizontally; on-screen
   keyboards fit the viewport (`100dvh` shell already provided). Support physical
   keyboard on desktop, touch on mobile. No hover-only interactions.
8. **Keyboard handlers** must ignore events while `isModalOpen()` is true and when
   modifier keys (meta/ctrl/alt) are held.
9. **No external JS dependencies.** Fonts come from Google Fonts via base.css.
10. **Hints.** Every game offers a hint and a "Hints" switch in its settings (on by default).
    Add `HINTS_SETTING` to the `defineSettings` schema. A 💡 header button from
    `hintButton(gameId, onClick)` hides itself when hints are off; any other hint control
    uses `watchHints(gameId, fn)` or checks `hintsOn(gameId)` when painting. Hints already
    shown stay visible when the switch goes off. Mention the 💡 button and the switch in How To
    Play, save hints used in `state`, and add `💡n` to the share text when any were used.
11. **Play more.** The shell's 📅 header button and every `showStats` add a "Play more" picker
    (unfinished days of this game, practice, other games for the same day). Don't add your own
    "Play again" button. If practice needs more than `?random=1`, pass `practice: () => …`
    to `mountShell`.

## Visual language (NYT-like)

- Fonts: `--font-display` (Zilla Slab, stands in for Karnak) for titles,
  `--font-sans` (Libre Franklin) for everything else.
- Wordle: correct `--color-correct`, present `--color-present`, absent `--color-absent`,
  keys `--key-bg`. High contrast swaps to orange/blue automatically.
- Connections: tiles `#efefe6` (dark `#3a3a3c`), selected `#5a594e`; groups yellow
  `#f9df6d`, green `#a0c35a`, blue `#b0c4ef`, purple `#ba81c5`.
- Strands: found theme words `#aedfee`, spangram `#f8cd05`, hint ring dashed.
- Letter Boxed: salmon `#fc716b` page background, white box, black letters.
- Crossword family: selected cell `#ffda00`, current word `#a7d8ff`, related clue
  `#dcefff` (dark-mode variants allowed).
- Lettergrams: periwinkle plate `#828bc3`, cream tiles `#fbf3dc`; bonus squares DL `#8fd0f0`,
  TL `#2f7fd1`, DW `#f3a6b6`, TW `#e0475b`; invalid / disconnected tiles get a red ring.
- Revealed: serif article text, charcoal redaction bars, topic words in purple `#6b4fbb`,
  revealed words on yellow `#fff1b8` (just-revealed `#ffd84d`).
- Contexto: rank bars green `#01ba7c` (≤300), yellow `#f2b705` (≤1500), red `#f04a3f`.
- Spelling Bee: center hex `#f7da21`, outer hexes `#e6e6e6` (dark `#3a3a3c`), yellow rank bar.
