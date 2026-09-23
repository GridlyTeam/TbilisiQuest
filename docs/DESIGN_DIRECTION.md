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

## The four tabs

1. **Map** -- the default tab, as now.
2. **Vouchers** -- what you have claimed.
3. **Character** -- customisation. Every piece of merch, clothing and background
   they have earned or bought lives here, with a large view of the character
   wearing it. Backgrounds are locations: Mtatsminda Park, and others like it.
   All of it produced with Higgsfield later.
4. **Season** -- progress, achievements, when the current season ends and the
   next begins, and the **leaderboard ranked on XP** so players compete for
   seasonal prizes.

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
- **XP leaderboard** for seasonal prizes.

Note against the campus leaderboard already built: that one ranks on
redemptions because that is what venues pay for. This one ranks on XP because
that is what players feel. They are different boards answering different
questions and both can exist -- but if only one is shown, say which.

---

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
