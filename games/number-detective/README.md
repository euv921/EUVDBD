# Number & Word Detective

One browser game at https://euv921.github.io/EUVDBD/games/number-detective/.
The first screen has an All games link back to the EUVDBD library and a
Number & Word Detective title above three variant buttons:
Numbers, Chinese pinyin, and English words. Each opens a separate Set up your game screen at
`play.html?variant=...`. Start game then opens the game screen
(`screen=game`). The game has a prominent, sticky Back to setup button;
the setup screen has a Variant menu link to return to the first screen.
Returning to setup or switching variants ends the current competition.

## Variants

- **Numbers:** the original three distinct digits, including leading zero.
  The existing numeric rules module is preserved.
- **Chinese pinyin:** one tone-free syllable, such as `mian`. Choose 2–6 letters
  or Any length; Any length is the default for new games. Answers are a curated bank of standard
  syllables without tone marks/numbers. Syllables requiring explicit ü/v are
  omitted. At round end, show one matching Chinese character and meaning;
  this is an example homophone, not every possible meaning.
- **English words:** curated common words of 3–8 letters, including `dinosaur`.
  Choose a length or Any length; Any length is the default for new games. No answer exceeds 8 letters.

The letter count is shown before guessing. Letter guesses accept uppercase,
normalize to lowercase, allow repeated letters, and must match the exact length.
They can be any A–Z string, not necessarily a dictionary word. Each occurrence
is counted once: exact positions first, then matching remaining letters.
For example, `mian` / `main` gives 2 right and 2 misplaced; `dinosaur` /
`diansour` gives 5 right and 3 misplaced. Digits still may not repeat.

The numeric code uses a cryptographic Fisher–Yates shuffle with rejection
sampling. Letter answers are drawn uniformly from the selected bank/length,
using crypto.getRandomValues with rejection sampling. Banks are bundled in
`pinyin.js` and `words.js`; there is no external dictionary or runtime service.

## Players and points

Choose solo or 2–5 players sharing one device. Names are optional. Each valid
new guess advances to the next eligible player, and everyone sees all clues.
In multiplayer a new competition starts at 5 points each. Every accepted guess
costs 1, including a winning guess. Solving earns +5 immediately. Zero-point
players sit out for the rest of the round. A solve made using the last point
still wins and earns its reward. If everyone runs out, nobody wins.

Starting the next round adds +5 to every remaining balance. Scores accumulate,
not reset: Alice makes a wrong guess (5 → 4), Bob solves (5 → 4 → 9), then the
next round begins at Alice 9 / Bob 14. A reveal ends without a win bonus.
Starting a new game from the setup screen starts a new competition. Solo has no point limit or cost.
Invalid/already-tried guesses neither advance the turn nor cost points.

## Preferences and records

Rounds are kept only in memory. Reloading, reopening, or returning to setup
clears the current puzzle and points. There is no resume option. Play again
keeps accumulated points during the current session. Old saved round snapshots
are removed without affecting preferences or best records.

Best records persist locally per variant using `number-detective-best-v1`,
`pinyin-detective-best-v1`, and `word-detective-best-v1`. Records compare the
fewest total accepted guesses across all players, shared across solo/multiplayer
and supported lengths within that variant. Only a strict improvement replaces
the record. Reveals and exhausted rounds do not. The record shows the winner
and player count. Names/count use `number-detective-players`; new letter games
default to Any length. Blocked storage falls back to memory.
The answer is local to the browser: this is a casual puzzle, not anti-cheat.

No audio, microphone, accounts, external assets, or server is required. All
code and banks are original. The existing library generator lists this as
one game; no extra pinyin or English game folders/cards are added.

## Tests

```sh
node tests/number-detective/engine.test.cjs
node tests/letter-detective/engine.test.cjs
python -m unittest discover -s tests/number-detective -v
python -m unittest discover -s tests/letter-detective -v
```

GitHub Actions runs both suites in Chromium and WebKit. The numeric suite
covers every valid three-digit answer/guess pair; the letter suite checks
multiset scoring exhaustively over a small alphabet, both banks and length
filters, points, mode switching, removal of saved rounds, retained preferences/records, and responsive layouts.

## Three-screen navigation

The variant chooser, game setup, and gameplay are distinct views. The
setup screen never displays the board/history. The game never displays the
player-count/name form or the old Change players link. Back to setup is
a prominent button in the sticky game header, so it remains available after
scrolling down to results. It returns immediately and discards the current
competition. Starting again from setup begins with 5 points each. Browser
Back/Forward cannot resume a discarded round. New letter competitions default
to Any length; Play again retains the current session's chosen length.
