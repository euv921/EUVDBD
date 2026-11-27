# Number Detective

A self-contained three-digit Bulls and Cows game for 1–5 players. Open `index.html` through a
static server, or play at https://euv921.github.io/EUVDBD/games/number-detective/.

The code contains three distinct digits from 0–9; leading zero is allowed.
Every guess reports digits in the correct position and correct digits in the
wrong position. Each digit contributes to exactly one count. Three right spots
wins. There is no timer; solo has no guess limit. Multiplayer turns are limited
by each player’s points. Duplicate guesses do not use a turn or cost points.

Choose 1 player for solo, or 2–5 players sharing one device. Names are optional.
Everyone guesses the same code and sees all previous clues. One valid new
guess advances the turn in seating order; the person who guesses the full code
wins immediately. Invalid/repeated guesses keep the same turn. Rounds wrap back
to the first player. A reveal ends the game without a winner. Replay keeps the
same players; Change players returns to setup after confirmation if a puzzle
is underway. Player names and count are remembered; hidden seats retain names.

The touch keypad and physical keyboard both work. A confirmed reveal ends the
round. New puzzle and Play another puzzle generate a fresh independent code.

The code is drawn with a cryptographic Fisher–Yates shuffle and rejection
sampling, giving each of the 720 possible codes the same probability. Codes
can repeat between independent games. No role rotation or seeded names are used.

Progress is saved locally under `number-detective-v1`, including the current
answer, guesses, player order, and starting point balances. Current points,
eligible turns, and the winner are reconstructed from the history, so refreshing
does not charge guesses or pay bonuses twice. Older single-player saves continue as solo games. Player
setup preferences are stored separately as `number-detective-players`. If storage is blocked, the current game remains playable.
No accounts, microphone, sound, external assets, or network services are used.
The answer lives in the browser; this is a casual puzzle, not an anti-cheat system.

All game code and styling are original. `game.json` enables the existing library
catalog generator to discover it. Other games and their audio are unchanged.

Run rules tests with `node --test tests/number-detective/engine.test.cjs` from the
repository root. Browser tests use the existing Playwright Python dependency:
`python -m unittest discover -s tests/number-detective -v`.

## Competitive points (2–5 players)

A new competition starts everyone at 5. Each accepted guess costs 1, even if
correct. Solving earns +5 immediately. Players at 0 are skipped for the rest
of the round. A correct guess made with the last point still wins and earns
its +5 reward. If everyone runs out, the round ends without a winner.

At the start of the next round, add +5 to every existing balance. Scores
accumulate; they are not reset. Example: Alice guesses wrong (5 → 4), Bob
solves (5 → 4 → 9); the next round starts Alice at 9 and Bob at 14. A reveal
ends a round without a win bonus; the next-round +5 still applies. Changing
players starts a new competition with 5 each. Solo has no charges or rewards.

Pre-points saved puzzles retain all their clues. Charging begins with their
next guess, with 5 starting points each; earlier guesses are not charged
retroactively. The saved `scoringFrom` offset makes this migration stable.

## Best solve

One record is shared across solo and multiplayer on the current browser/device:
the fewest total accepted guesses in a completed solve, including every
player’s guesses. Only a strictly lower total replaces the record; ties,
reveals, and exhausted rounds do not. The winning player and player count are
shown with the record. New rounds and changes of players keep it.

The record uses localStorage key `number-detective-best-v1`. Current saved
completed puzzles may establish the initial record. With storage blocked,
points and best solve remain available in memory for the current visit.
