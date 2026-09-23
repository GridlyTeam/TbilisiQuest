# Design direction and future work

The running notebook for how Tbilisi Quest should look and behave, written so
that work can be picked up later without asking the same questions again.

Everything here is **the decided intent**, not a suggestion. When something is
built, it moves to [Done](#done) with the commit that did it. When a decision is
reversed, the old line stays with a strikethrough and a reason -- knowing why we
stopped doing something is worth more than a tidy list.

Two things this file is not: it is not the architecture (see
[ARCHITECTURE.md](ARCHITECTURE.md)) and it is not the safety rules (see
[SAFETY.md](SAFETY.md)). If a design idea here collides with either, those win
and the collision gets written down.

---

## Blocked on Higgsfield credits

The account is on the free plan with 0 credits. The moment it has a
subscription, this is the work to execute without asking again.

**Character art.** Use the character-sheet workflow, not separate prompts per
item. One base character, one pose, one lighting setup, then every outfit as a
variation on that sheet. Six outfits prompted separately arrive on six
different bodies and the locker looks broken.

The slots already exist in the database and in `apps/mobile/src/components/Avatar.tsx`.
Generated art drops in behind that component; nothing else moves. The
`style_key` on each cosmetic is the filename to reach for:

| Slot | style_key values |
|---|---|
| outfit | `hoodie_fab`, `track_sab`, `denim_vake`, `coat_rust`, `jacket_dry`, `wind_marj` |
| frame | `copper`, `cyan`, `emerald`, `gold`, `midnight`, `violet` |
| marker | `pin_neon`, `pin_grape`, `pin_flame`, `pin_ghost`, `pin_gold` |
| sticker | `khachapuri`, `funicular`, `river`, `boba`, `grape`, `metro`, `sulfur`, `balcony` |
| card theme | `dusk`, `grape`, `mono`, `neon`, `sunrise` |

### Which models, and how not to spend a fortune

Checked against the Higgsfield catalogue on 2026-09-23.

**Images, not video.** Video per character does not scale: colours x outfits x
backgrounds is hundreds of clips, each one a file the phone has to download.
Kling 3.0 Turbo is the budget image-to-video model and Seedance 2.5 the default
one, but both are billed per clip, and the combinations multiply against you.

**Layer the assets, do not combine them.** Generate the creature body once per
colour and each outfit once as a transparent layer over the same pose. Six
colours plus six outfits is twelve assets; six colours times six outfits is
thirty-six. The app composes them.

**Animation is done in the app, not bought.** Reanimated is already in the
project and already drives the map puck. A breathing bob, a slow sway, a blink
swapped between two eye frames, a shadow that scales with the bob -- that reads
as alive, costs nothing per player, works offline and adds no download. This is
what "little animations so the environment feels alive" should be built from.

**Where video is actually worth paying for:** one or two marketing clips for the
landing page and the Play Store listing. A one-off cost, not a per-character
one.

**On the subscription:** several image models carry `supports_unlim` -- Soul
2.0, Nano Banana Pro, and Kling v3.0 among them -- meaning a plan with
unlimited generations covers them. If a tier includes unlim on Soul 2.0 or Nano
Banana Pro, that is the one to buy: the whole character set is images, and
images would then be effectively free. Buying video credits for idle animation
would be paying for the expensive version of something Reanimated does better.

---

## Registration and first run

Ordinary sign-up first: email and password, nothing unusual, no character
screen in the way of getting an account. Birth date is asked straight after, as
it is today -- it gates squad play and, from this walkthrough on, it also gates
who may be seen on the map.

Then the part that sets the tone. The new player lands in a **small 3D-looking
scene**: a pedestal, a soft environment, and a **fluffy, non-gendered creature**
standing on it. This is their character. It is deliberately not a human avatar
-- a creature is read as a mascot rather than as a person, which is both
friendlier and safer for an app with minors in it.

Two choices, and only two:

1. **Nickname.**
2. **Colour** -- red, blue, orange, green and a few more. One tap each.

That is the whole of onboarding. Everything else is earned later.

The same scene is reused as the "view a character" screen, so the environment
built here is not single-use.

### How the 3D is actually produced

The character is **generated with Higgsfield**, and the app does not need a 3D
engine to show it. A turnaround of pre-rendered images -- one per colour, one
per outfit, one per background -- looks identical at phone size and costs
nothing in build weight or battery. React Three Fiber stays a last resort; it
would add native dependencies, slow the app's start-up and buy an interactive
camera nobody asked for.

Recorded as a decision because it is the sort of thing that gets rebuilt the
expensive way by default.

## The map

The player's own position stays the **pulsing dot** it already is. Above the dot
sits a **small box holding a crop of their character's head** -- whatever it
looks like after customisation, in whatever colour they picked.

**Other players appear the same way**: a head box above a dot. Tapping one opens
that player's **full character** on the same pedestal scene from registration,
with their background and gear on show. That is the flex: you see somebody
across Rustaveli and you can look at what they are wearing.

No chat anywhere on that screen. A player's card carries a nickname, their
character and a report button, and nothing that lets two strangers start a
conversation.

### Visibility modes -- the safety rule that governs all of the above

Three modes. **Ghost is the default** and stays the default for everyone.

**Under 16, ghost is not a default but a lock.** A player whose birth date puts
them under sixteen cannot leave ghost mode at all -- the control is shown
disabled with the reason, not hidden. Decided 2026-09-23. A thirteen year old
cannot meaningfully weigh "let strangers see roughly where I am", so the app
does not ask them to. The under-16s who want to be seen are seen by their squad,
which is who they actually care about -- squad mode stays available at the age
squad play already opens at.

| Mode | Who sees you |
|---|---|
| **Ghost** | Nobody. You are on the map for yourself only. |
| **Squad** | Only your squad members. |
| **Public** | Everybody nearby -- but never your real position. |

Public mode never transmits a true coordinate. The position other people see is
**displaced by 300-500 m** and jumps around inside that ring.

Two engineering requirements that make this real rather than decorative, both
of which have to be in the implementation or the feature is worse than not
having it:

- **The displacement must be stable, not re-rolled.** If the offset is
  re-randomised on every update, an observer who takes twenty samples averages
  them and lands on the true position. The offset is derived from a seed that
  changes slowly -- per player, per hour -- so repeated observation reveals
  nothing more than one observation does.
- **The fuzzing happens on the server.** The app never sends a true coordinate
  that another client could read. What leaves the database for another player
  is already displaced; the exact position exists only for the player
  themselves and for the geofence check on their own claims.

Consequence to accept: in public mode the head boxes of other players are
approximate by design. A player cannot use the map to walk up to a specific
person, which is the entire point.

Because of that, **another player's head box must be labelled approximate** --
on the card, in words. An icon that hops 400 m while somebody watches it, with
nothing explaining why, is read as a broken map and reported as a bug.

## The four tabs

1. **Map** -- the default tab, as now.
2. **Vouchers** -- what you have claimed.
3. **Character** -- customisation. Every piece of merch, clothing and background
   they have earned or bought lives here, with a large view of the character
   wearing it. Backgrounds are locations: Mtatsminda Park, and others like it.
   All of it produced with Higgsfield later.
4. **Season** -- progress, achievements, when the current season ends and the
   next begins, and the one **XP leaderboard** every player is in automatically.

This replaces the current four (map, vouchers, pass, profile): the pass folds
into Season, and profile settings need a home that is not a tab -- likely a
header button on Character or Season.

## Character customisation

The locker becomes the Character tab and grows a proper stage: the character
full-size in its environment, gear around it, and the change visible
immediately.

Slots as they exist today (title, frame, map pin, outfit, sticker, card theme)
plus **background**, which is new and matters most -- a Mtatsminda Park
backdrop is the thing worth showing off.

Sources of gear: the City Pass tracks, achievements, and **a store**. The store
is new; nothing about payments is decided yet.

## Season

Everything seasonal in one place:

- Progress through the pass.
- Achievements earned.
- Countdown to the end of the season, and when the next one starts.
- **One leaderboard, ranked on season XP.** Nobody joins it: XP comes from
  claiming and using vouchers, so every active player is already in it, and the
  leaders take the prizes when the season ends.

**The campus rivalry is gone.** Decided 2026-09-23, a day after it was built and
before anybody used it: it asked a player to pick a university before they could
compete, and a player who skipped that choice competed in nothing. Two boards
also forced a question nobody wanted -- which one am I supposed to care about.
The schema is dropped, not dormant; `git show 0034` has it if it is ever wanted
back.

---

## What can be built before any art exists

None of this waits on Higgsfield. The drawn placeholder creature in
`components/Avatar.tsx` stands in, and generated art replaces it inside that one
component.

1. **Visibility modes, end to end.** Column on `users`, ghost as default, the
   under-16 lock, the seeded server-side displacement, and the RPC that returns
   other players already fuzzed. Pure backend plus one settings screen. Everything
   on the map depends on it, so it goes first.
2. ~~The four tabs~~ -- built, `see Done`. Map, Vouchers, Character, Season;
   the pass folded into Season and settings moved to a header button on it.
3. **The character stage.** Full-size creature on its pedestal with the gear
   around it, and a background slot -- a drawn gradient until there is a
   Mtatsminda Park image to put in it.
4. **Head boxes on the map.** Own dot first, then other players through the
   visibility rules, with the approximate label.
5. **Nickname and colour at sign-up.** The colour is real data from day one; only
   the picture it tints changes later.
6. ~~XP leaderboard~~ -- built, `0039`. Still to move onto the Season tab.

## Standing rules

These come from decisions already made and apply to everything above.

- **Georgian first.** Georgian is the default and gets the same care as
  English -- no letter-spacing on Georgian text, no words broken mid-syllable,
  no English units left in a Georgian sentence.
- **No chat, ever.** Player-to-player messaging is out. It was rejected on
  safety grounds and that is not reopened.
- **No exact positions, ever.** Superseded the earlier "no other players on the
  map at all" rule on 2026-09-23: players may be visible, but only through the
  three visibility modes above, with ghost as the default and public positions
  displaced by 300-500 m on the server. A true coordinate never leaves the
  database for anyone but its owner.
- **Short hyphens, not em dashes,** in user-facing copy.
- **Operators own the map.** Venue pins and voucher allowances are set by
  operators only; a merchant can never move their own pin.
- **Nothing is promised that a venue has not agreed to.** No physical reward
  appears on any track until the deal behind it is signed.

---

## Done

| What | Commit |
|---|---|
| City Pass tab, 50 levels, two tracks | `2ee9e5e` |
| Locker, campus table, merchant beacon button | `d9fdae2` |
| Drawn avatar the gear sits on | `b067696` |
| One XP leaderboard, campuses removed | `8ac4446` |
| Four tabs: Map, Vouchers, Character, Season | `see below` |
