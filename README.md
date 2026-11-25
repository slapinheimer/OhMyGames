# Oh My GAMES!

A home-hosted collection of daily puzzles in three collections. The home page lets you pick one;
the ☰ menu in any game and the switch at the top of each hub jump between them.

## Oh My WORDS!

Daily word puzzles in the style of NYT Games (`words.html`):

| Game | What it is |
|---|---|
| **Wordle** | Guess the 5-letter word in 6 tries |
| **Quordle** | Four words at once, nine shared guesses. New game starts another round any time |
| **Waffle** | Swap letters into six crossing words. Fifteen swaps, five stars at ten. New game any time |
| **Deluxe Waffle** | Swap letters into eight crossing words. Twenty-five swaps, five stars at twenty. New game any time |
| **Stackdown** | Thirty stacked tiles spell six words. Take free tiles to spell each 5-letter word in turn. Hints cost stars |
| **One Word Search** | Find one hidden 5-letter word, ten times. The clock starts on the first word. Five stars in a minute. New game any time |
| **Tagline** | Three phrases from the same seven letters. No hints is three stars. New game any time |
| **Connections** | Sort 16 words into 4 groups of 4 |
| **Strands** | Find themed words hidden in a 6×8 letter grid |
| **Letter Boxed** | Chain words using letters around a square |
| **The Mini** | 5×5 crossword |
| **The Midi** | 9×9 crossword |
| **The Crossword** | 15×15 daily crossword |
| **Lettergrams** | Place all 12 rack tiles on a 5×5 board as connected words, scoring points with bonus squares. New game any time |
| **Revealed** | Guess the topic of a blacked-out article. Reveal words one at a time; every two reveals earn a letter hint |
| **Spelling Bee** | Make words from seven letters, always using the center one. Climb the ranks to Genius and Queen Bee |
| **Squaredle** | Trace every word through a 4×4 letter grid, diagonals included. Rarer words count as bonus |
| **Contexto** | Find the secret word. Each guess is ranked by how close it is in meaning, computed in the browser from word vectors |

## Oh My NUMBERS!

Number puzzles (`numbers.html`). More are on the way; see "Adding a number game" in ARCHITECTURE.md.

| Game | What it is |
|---|---|
| **Twofold** | Slide a 4×4 board so matching tiles merge into their sum. Reach 2048, then keep going for a higher score. Everyone gets the same tiles each day |
| **Tally** | Cross out numbers until every row and column adds up to its target. Pick a 4×4, 5×5, 7×7 or 9×9 grid. Each size has its own daily grid, progress and stats, and every grid has exactly one answer. Optional running sums |
| **Sudoku** | Fill the grid so each row, column, and 3×3 box holds 1–9 once. Today's puzzle is Medium. Three mistakes ends the round. New game any time, from Easy through Extreme |
| **Ballpark** | Guess how many of a small thing match a big one, by length or by weight. Five questions, one slider each, and a round never uses the same thing twice. Sizes are shown in imperial units, with metric beside them. Inside 30% of the range scores, and closer is worth more. New set any time |
| **Cross Sums** | Fill the white squares with 1–9 so each run adds up to the clue before it, with no digit repeated in a run. **Small** (3×3–5×5), **Medium** (6×6–8×8) and **Large** (9×9, 10×10, 9×11) in **Easy, Moderate and Hard**; the size within a group changes daily. Notes, a combinations helper, a timer and per size-and-level stats. Boards come from a bank (`data/sums/boards.json`, built by `tools/build_sums.mjs`), each with one answer |

## Oh My PATTERNS!

Pattern puzzles (`patterns.html`): no words or numbers. Add one with the same steps as a number game, but register it in `js/core/pattern-games.js`.

| Game | What it is |
|---|---|
| **Motif** | Clear a 5×6 board of layered tiles (field, frame, emblem, trim). Pick a tile, then one that shares a layer with it: shared layers vanish from both, and the second tile stays picked so the chain can go on. Every board can be cleared; your score is your longest chain |
| **Crowns** | Place one crown in every row, column and colored region; crowns can't touch, even diagonally. Pick 6×6, 8×8 or 10×10 and a level: **Easy, Medium, Hard, Expert**. Levels are graded by a logic solver (Expert boards need look-ahead). Every board has exactly one answer; each size and level has its own daily board, progress, timer and stats. Optional Auto ✕ |
| **Glow** | Each press steps a light and its neighbors; turn every light off. Pick 5×5, 6×6 or 7×7 and a level: Easy/Medium are on/off, **Hard** lights cycle off → amber → red, **Expert** adds diagonal neighbors. Par is the fewest presses; the hint shows a press on the shortest way from where you are |
| **Shade** | Picture logic. Each row and column lists its shaded runs, in order. Shade cells, or mark ✕ for a known gap, until a picture appears. 5×5, 10×10 and 15×15 each have their own daily picture, timer and stats. Every picture has one answer you can reach from the clues alone |
| **Conduit** | Draw a pipe between each pair of fittings so the pipes fill the board. Pipes can't cross or branch. 5×5, 7×7 and 9×9 in **Easy, Medium, Hard and Expert**, each with its own daily board, timer and stats; every board has one answer. Medium to Expert come from a bank of winding boards (`data/conduit/boards.json`, built by `tools/build_conduit.mjs`) where the shortest route is usually wrong |
| **Trail** | Draw one line through every square, passing the numbered stops in order and ending on the last one. Walls block the line. 6×6, 7×7 and 8×8 in **Easy, Medium, Hard and Expert** (fewer numbers as it gets harder; Expert has no walls), each with its own daily board, timer and stats; every board has one answer. **Climb** is an endless run that gets harder with every board solved (fewer numbers, then a bigger grid, up to 8×8 with no walls) |
| **Reversi** | You (dark) against the computer (light) on 8×8: trap a line of light discs to turn them over, most discs at the end wins. **Easy, Medium, Hard and Expert** computers, each with a daily game and its own stats, plus **Climb**: six stages where every win brings a stronger computer |
| **Flipper** | Memory match with pictures. Turn two cards: a pair stays up, and a miss stays up for 4 seconds before both turn down. Grids are 4×4, 4×6 and 6×6. Easy pictures are all different, Medium repeats a shape in three colors, and Hard lookalikes differ in one small place. Each grid and difficulty has its own daily deck, timer and stats |

## Play

```sh
python3 serve.py
```

Then open **http://localhost:8788/**. The server also prints a LAN address
(for example `http://192.168.1.20:8788/`) that phones and tablets on the same Wi-Fi can open.
On iPhone/iPad, use Share → *Add to Home Screen* for an app-like icon.

To keep it running in the background and start it at login:

```sh
tools/autostart.sh install     # tools/autostart.sh uninstall to remove
```

## Hosting on the Mac mini (Tailscale HTTPS)

The game is published at **https://omw.shetland-shiner.ts.net/** (Tailscale Service `svc:omw`), reachable from any device
on your tailnet. The Mac mini's own address (`rons-mac-mini.shetland-shiner.ts.net`) was retired for the game on 2026-11-10.

Install or update: on this MacBook run `tools/bundle.sh` (with `python3 serve.py` running). Then in Terminal **on the Mac mini**:

```sh
cd ~ && curl -fsSLO http://rons-macbook-pro.shetland-shiner.ts.net:8788/dist/install-host.sh
zsh install-host.sh http://rons-macbook-pro.shetland-shiner.ts.net:8788/dist/OhMyWords.tar.gz
```

`install-host.sh` puts the game in `~/OhMyWords`, keeps it running across reboots (launchd, port 8788)
and runs `tailscale serve` to publish it as `svc:omw`. It's safe to re-run. If you can't download from the MacBook, copy
`dist/OhMyWords.tar.gz` and `dist/install-host.sh` over (AirDrop works) and run `zsh install-host.sh ~/Downloads/OhMyWords.tar.gz`.

## Sharing with a Windows user

On this MacBook run `zsh tools/bundle-windows.sh`. It builds `dist/OhMyWords-windows.zip` (installer files live in
`tools/windows/`). Send the zip. On the PC: unzip it, then double-click **Install on Windows.bat**. It finds or installs
Python 3, copies the game to `%LOCALAPPDATA%\OhMyWords`, starts it at every sign-in on port 8788, adds an
**Oh My GAMES!** desktop shortcut and opens http://localhost:8788/. Re-run it from a newer zip to update. To remove it,
double-click **Uninstall Oh My GAMES.bat** in that folder.

## Daily puzzles, archive & practice

- Every game gets a new puzzle at local midnight, and it's the same for every device that uses this server.
- The collection hubs and the menu (☰) inside any game let you play any game for today, any day since January 1, 2026, or a practice round.
- `?date=2026-03-14` on a game page plays that day's puzzle. `?random=1` starts a practice puzzle that doesn't count toward streaks. The splash screen has the same date picker.
- Progress, stats and settings are saved in each browser (localStorage).
- Inside any game, the 📅 button (and every results screen) offers **Play more**: an unfinished day of that game, a practice puzzle, or another game for the same day.
- Every game has a hint (usually the 💡 button). Each game's Settings has a **Hints** switch to turn them off.

## Word library

`python3 tools/build_words.py` rebuilds `data/words/` and `data/crossword/words.json` from:

- **ENABLE**: public-domain word list (172k words), used to check guesses
- **FrequencyWords** (OpenSubtitles): how common each word is, used to pick answers
- **Princeton WordNet 3.1**: definitions and synonyms, used as crossword clues

`python3 tools/build_bee.py` then writes `data/words/bee-words.json`, the Spelling Bee answer list: common, defined
words (or forms of them) with no S, so names and interjections stay out.

`python3 tools/build_contexto.py` writes `data/contexto/` (about 1.8 MB, ~15,800 words): GloVe word vectors for
Contexto, trimmed to our common words. First run `python3 tools/fetch_glove.py` once: it downloads only the ~52 MB slice
of GloVe it needs (not the full 822 MB zip) into `tools/.sources/`, resuming if interrupted. That folder is never bundled
or served. The full zip, if ever wanted, is https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip (mirror of
https://nlp.stanford.edu/data/glove.6B.zip); saved as `tools/.sources/glove.6B.zip`, `build_contexto.py` reads it when
the slice file is absent.

Hand-curated content lives in `data/connections/`, `data/strands/` and `data/revealed/` (original topic write-ups).
See `ARCHITECTURE.md` for how the code is organized.
