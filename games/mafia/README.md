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

**Simple mode** (on by default for three players, optional for 4–8 players): play a
single night. If anyone dies, the Mafia wins. If nobody dies (including a missed
Mafia attack), the Villager wins. The result is announced immediately, all roles
are revealed, and there is no voting or second night.

**With Simple mode off:** during the day, discuss together and choose one player to vote out (group agreement,
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
using the same player count, names, turn time, game language, spoken-host setting, and
sound setting. **Change settings** returns to the setup form.

Every deal uses a Fisher–Yates shuffle driven by `crypto.getRandomValues`, mixed
with the current timestamp, high-resolution time, and a per-deal counter. Each
draw has a changing mask, so even a stuck browser random source can vary deals.
Rejection sampling avoids modulo bias. Deals are independent: the same person
can receive the same role several times. For three players, each role has a
1-in-3 chance at each seat on every deal. The game does not force role rotation.

## Game language

The UI is always English. There is no UI-language selector, and any older
UI-language preference is ignored.

**Game language** offers **English**, **简体中文**, and **Bilingual (English → 简体中文)**.
It controls the private role card (name and instructions), written night prompts,
night countdown, winner heading, and the spoken
host, including Test voice, night phases, morning results, and victory messages.
Role names in the final reveal also follow this setting. Chinese roles are
**杀手**, **医生**, and **平民**.

Bilingual cards show English first, then Simplified Chinese. Bilingual night narration pairs each English sentence with its Simplified
Chinese translation before moving to the next sentence, with the appropriate
voice for each. Written night prompts use the same sentence order. Prompt time is extended in bilingual mode, and
automatic transitions wait for pending narration to finish (with a timeout if
speech events are unavailable). Pause, replay, or a new stage cancels old speech.

The game-language preference is saved when browser storage is available and
kept on same-settings replay. Existing English/Chinese game-language choices
continue to work. Chinese narration requests `zh-CN` and prefers an installed
Mainland/Singapore Mandarin voice. Install a Mandarin voice in device settings
if needed. Written UI instructions remain available if speech cannot play.

Night narration omits the repeated “everyone else, keep your eyes closed” reminder.
The opening night instruction and each role’s close-eyes instruction remain.

Night screens show only the phase symbol, large instruction, and countdown;
small explanatory notes are omitted. The bilingual opening is one complete
English phrase, “It is night. Everyone, close your eyes.”, followed by
“天黑请闭眼。” Other night instructions remain paired by sentence. Chinese role
calls have no comma after the role name, such as “医生请睁眼。”

The ready screen (“Let the town fall asleep”), morning screen, death/survival
result, and winner heading follow Game language. Bilingual morning narration
pairs each announcement: English open-eyes instruction then Chinese, English
death/survival result then Chinese, English winner then Chinese. Default player
labels are localized; custom names remain as entered. Buttons stay English.

## Night music

**Night music** offers **Ghosts in the Attic**, **Witch’s Cackle**,
**Bubbling Cauldron**, **Witch’s Forest**, and **Midnight Coven**. Attic is unchanged.
Witch’s Cackle uses a real CC0 voice recording; the others have no laugh intro.
Audio is generated locally and the recording is bundled, with no runtime streaming.
See [CREDITS.md](CREDITS.md) for the recording source and license.

Choose **Track**, adjust **Night volume**, and tap **Test music** to start a preview and tap **Stop music** to stop it. The track choice is remembered on this device when storage is available.
Same-settings replay keeps the track and volume. Music fades out during daytime,
pause, mute, or reset, and remains separate from **Spoken host**. Stage chimes
remain available. If audio is silent, check device media volume, the output
device, and Safari/iOS sound or silent-mode settings.

### iPhone Silent Mode

Before creating/resuming audio and when music playback is requested, the game
sets `navigator.audioSession.type = 'playback'` when supported. WebKit documents
this as the iOS 17+ solution for Web Audio that would otherwise obey the
Ring/Silent switch: https://bugs.webkit.org/show_bug.cgi?id=237322#c6

The setting does not change device media volume, autoplay permission, the music
checkbox, or the game's volume control. Older browsers without this API keep
ordinary playback and may still require Silent Mode to be turned off. No
microphone permission or silent looping media workaround is used. Actual
hardware-switch behavior needs a check on an iPhone; automated desktop tests
verify the playback request and unsupported-browser fallback.

## Preview buttons

**Test music** toggles to **Stop music** and loops until tapped again. **Test voice**
toggles to **Stop voice** while the sample is playing; tap again to cancel all
queued speech, including the Chinese part of a bilingual sample. When the voice
sample ends naturally, the button resets. The two previews are independent.

Starting a game phase, pausing, or resetting cancels previews and resets their
buttons. Muting the corresponding checkbox also resets its preview button.
During an active night, pause before testing so preview controls do not
interrupt the game host. A second music tap also cancels a pending audio-unlock
request, preventing delayed playback after stopping.

## Defaults and remembered names

Night volume uses five levels: **1 = 10%**, **2 = 20%**, **3 = 30%**,
**4 = 50%**, **5 = 100%**. Level 4 (50%) is the default on page load. Use the
Night music checkbox to mute. The selected level stays on same-settings replay.

Game language defaults to English only if no valid previous choice is saved;
otherwise the prior English, Simplified Chinese, or bilingual choice is restored.

Player names are saved by seat in browser localStorage (`mafia-player-names`),
not cookies, and restored on later visits. Increasing/decreasing the player
count preserves every seat's name, including seats temporarily hidden. Clearing
a name explicitly saves it as blank. Only names and preferences are stored,
not secret roles or an active game. If storage is blocked, names still survive
player-count changes during the current visit.

How to play and the end-of-game replay explanation also follow Game language;
bilingual help shows English first, then Simplified Chinese. Action button
labels remain English so the help can refer to the same visible controls.

## Simple mode and opening pace

Simple mode is a setup checkbox. Switching to 3 players defaults it on; switching
to 4–8 defaults it off. You can manually turn it on or off at any player count.
On means one night only: any death gives Mafia the win; no deaths gives the
Villagers the win. No discussion, voting, or second night is offered. Off keeps
the classic rules. Same-settings replay preserves the mode choice.

After the opening narration finishes, the game waits about five seconds before
waking the Mafia. It no longer adds a fixed 9/18-second opening countdown.
Native speech state also detects an idle queue if Safari misses end callbacks.

### Three-player classic voting

With Simple mode off, a three-player game offers daytime discussion/voting after
a night death as long as at least one town player remains. The morning parity
check is deferred so survivors can vote. Eliminating Mafia gives the town a win;
eliminating the last town player gives Mafia a win. Parity is checked normally
after a daytime vote. If no town player remains at dawn, Mafia wins immediately.
Simple mode and classic games with 4–8 players keep their existing win rules.

## Witch-themed soundtrack selection

The disliked Haunted Laughter and Midnight Cackle tracks are removed; saved
selections for either migrate to Ghosts in the Attic. Only Witch’s Cackle has a
laugh (a real voice effect, not the previous synthetic laughs). Its intro plays
once at the start of a preview/new night, then the ghost ambience loops.

Other choices are laugh-free: cauldron bubbling, forest wind/creaks/owl-like
calls, and low ritual-like humming. Ghosts in the Attic is sample-for-sample
unchanged. The opening remains five seconds and the default volume Level 4.

The opening post-narration pause is now five seconds. Night volume defaults
to Level 4 (50%); the five-level mapping is unchanged.
