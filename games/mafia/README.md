# Mafia · The Night Host

Open `https://euv921.github.io/EUVDBD/games/mafia/` on a tablet and share it around a table.
Use 3–8 players: one Mafia, one Doctor, and the remaining players as Villagers.
Names are optional. Duplicate names receive a seat number.

Each player privately reveals their own role, then hides it before passing the tablet.
Place the tablet in the center and tap **Begin the first night**. For four players,
one player button appears in each corner around the host instructions.

The host speaks using the browser's built-in text-to-speech. Optional quiet night
sounds use Web Audio; no microphone, account, server, or downloaded audio is needed.
Tap **Test voice** and adjust volume before playing. Browser voice availability and
sound output depend on the device; every spoken instruction is also written on screen.

The Mafia chooses one other living player to attack. The Doctor chooses any living
player to save, including themselves. Night selections are never highlighted,
spoken, or retained in the morning screen. If a role does not act before its timer
expires, it takes no action. A deceased Doctor still gets a timed, inactive turn to
avoid revealing that role. The morning announces only the death or that nobody died.

**Three-player mode:** exactly one Mafia, one Doctor, and one Villager play a
single night. If anyone dies, the Mafia wins. If nobody dies (including a missed
Mafia attack), the Villager wins. The result is announced immediately, all roles
are revealed, and there is no voting or second night.

**With 4–8 players:** during the day, discuss together and choose one player to vote out (group agreement,
not individual secret ballots). Confirm the decision or skip the vote. The town wins
when the Mafia is out. The Mafia wins at parity: one Mafia and at most one other
living player. All roles are revealed when the game ends.

**Pause night** stops the countdown, narration, and ambient sounds. Returning from a
hidden browser tab requires resuming; the current phase restarts with a full timer.
Starting a new game requires confirmation. Games stay in memory only: reloading
ends the game. This is an honor-system shared device game; only the named role may
look at the screen or touch a night-choice button. It cannot prevent peeking.

Files are self-contained within this folder. `game.json` lets the existing library
workflow discover the game without editing the homepage or hardcoding a catalog.

## Replay and random roles

At the end, **Play again · same settings** immediately deals fresh secret roles
using the same player count, names, turn time, UI language, game language, spoken-host setting, and
sound setting. **Change settings** returns to the setup form.

Every deal uses a Fisher–Yates shuffle driven by `crypto.getRandomValues`, mixed
with the current timestamp, high-resolution time, and a per-deal counter. Each
draw has a changing mask, so even a stuck browser random source can vary deals.
Rejection sampling avoids modulo bias. Deals are independent: the same person
can receive the same role several times. For three players, each role has a
1-in-3 chance at each seat on every deal. The game does not force role rotation.

## Language

**UI language** controls all interface text, buttons, dialogs, and written host
instructions. **Game language** independently controls the spoken host and the
voice used by **Test voice**. Each supports English and Simplified Chinese.
You can use an English interface with Chinese narration, or the other way around.

Private role cards always show both the English and Chinese role name and both
sets of role instructions: **Mafia / 杀手**, **Doctor / 医生**, **Villager / 平民**.
The Chinese interface and spoken host use these same terms consistently.
Player names remain exactly as entered.

Both preferences are remembered on the device when storage is available and kept
on same-settings replay. Existing combined-language preferences migrate to both
settings until each is changed separately. Chinese narration requests `zh-CN`
and prefers an installed Mainland/Singapore Mandarin voice. Install a Mandarin
voice in device settings if necessary. Written instructions remain available.
