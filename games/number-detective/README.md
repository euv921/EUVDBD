# Number Detective

A self-contained three-digit Bulls and Cows game. Open `index.html` through a
static server, or play at https://euv921.github.io/EUVDBD/games/number-detective/.

The code contains three distinct digits from 0–9; leading zero is allowed.
Every guess reports digits in the correct position and correct digits in the
wrong position. Each digit contributes to exactly one count. Three right spots
wins; there is no timer or guess limit. Duplicate guesses do not use a turn.
The touch keypad and physical keyboard both work. A confirmed reveal ends the
round. New puzzle and Play another puzzle generate a fresh independent code.

The code is drawn with a cryptographic Fisher–Yates shuffle and rejection
sampling, giving each of the 720 possible codes the same probability. Codes
can repeat between independent games. No role rotation or seeded names are used.

Progress is saved locally under `number-detective-v1`, including the current
answer and guesses. If storage is blocked, the current game remains playable.
No accounts, microphone, sound, external assets, or network services are used.
The answer lives in the browser; this is a casual puzzle, not an anti-cheat system.

All game code and styling are original. `game.json` enables the existing library
catalog generator to discover it. Other games and their audio are unchanged.

Run rules tests with `node --test tests/number-detective/engine.test.cjs` from the
repository root. Browser tests use the existing Playwright Python dependency:
`python -m unittest discover -s tests/number-detective -v`.
