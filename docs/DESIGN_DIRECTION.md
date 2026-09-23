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

## The five tabs

1. **Map** -- the default tab, as now.
2. **Vouchers** -- what you have claimed.
3. **Character** -- customisation. Every piece of merch, clothing and background
   they have earned or bought lives here, with a large view of the character
   wearing it. Backgrounds are locations: Mtatsminda Park, and others like it.
   All of it produced with Higgsfield later.
4. **Store** -- added 2026-09-23. Backgrounds and gear bought with coins.
5. **Season** -- progress, achievements, when the current season ends and the
   next begins, and the one **XP leaderboard** every player is in automatically.

Five is the ceiling. A sixth tab does not fit a phone and the labels are already
at 10px.

This replaces the current four (map, vouchers, pass, profile): the pass folds
into Season, and profile settings need a home that is not a tab -- likely a
header button on Character or Season.

## The creature: one body, many colours

Decided 2026-09-23, after the Fall Guys style reference: **one character shape
for everyone.** Not a line-up of silhouettes -- one creature, in a choice of
colours, and everything else comes from what it wears and what it stands in
front of.

That decision removes the only expensive thing about this whole design. With one
body:

- **8 colours = 8 pictures** of the creature.
- **Each outfit = 1 picture**, a layer over the same body.
- **Each background = 1 picture.**
- **A season of new content is roughly 20 pictures.**

Nothing multiplies. The shape_bound / anchored split in `0043` stays in the
schema because it costs nothing to keep and answers the question if a second
shape is ever wanted, but with one shape every item costs one render and the
distinction does no work.

**Do not clone Fall Guys.** The bean silhouette with two white oval eyes belongs
to a company with lawyers. Take the register -- soft, toy-like, pastel, eyes and
nothing else -- and make the creature ours.

**Colour is generated, not tinted.** `tintColor` in React Native flattens an
image to one flat colour and throws the shading away, and the shading is exactly
what makes these characters look like toys.

## Seasonal rotation -- how to run it without the art cost running away

The rhythm asked for is Fortnite's: a set of things this season, a different set
next, and a reason to come back. The trap is copying how Fortnite fills it,
which is full outfits, because an outfit has to be drawn once per body shape.

So content is split by whether it touches the body, and this is recorded on
every cosmetic as `shape_bound`:

| | Cost | Examples |
|---|---|---|
| **Anchored** | one render, whatever the shapes | hats, back pieces, trails, auras, pins, stickers, backgrounds, titles, frames |
| **Shape-bound** | one render **per shape** | outfits |

A season is then mostly anchored items with **one or two shape-bound headline
outfits**. `season_art_cost('S2')` gives the number before anybody commissions
it: today season one reads 46 items, 40 anchored, 6 shape-bound, and at three
shapes that would be 58 renders rather than 138.

**Rotation never takes anything away.** Availability windows
(`cosmetics.available_from` / `available_until`, and the store's own
`on_sale_from` / `on_sale_until`) decide what can still be *acquired*. Nothing
ever deletes from `user_cosmetics`. A player who earned season one's hoodie owns
it in season ten -- that is the part Fortnite gets right and the part that makes
people trust the pass.

Vaulted items stay in the locker, greyed, reading "სეზონი დასრულდა". Hiding them
would make a collection look complete when it is not, and the gap is the reason
to be there for the next season.

Turning a season over is one call: `rotate_season_cosmetics('S1', 'S2')`, which
closes the outgoing tag and opens the incoming one.

## Character customisation

The locker becomes the Character tab and grows a proper stage: the character
full-size in its environment, gear around it, and the change visible
immediately.

Slots as they exist today (title, frame, map pin, outfit, sticker, card theme)
plus **background**, which is new and matters most -- a Mtatsminda Park
backdrop is the thing worth showing off.

Sources of gear: the City Pass tracks, achievements, and the store.

**The store takes coins, not money.** Decided 2026-09-23. Most of these players
are minors, and selling them digital goods is a different business with
different law around it -- refund rights, parental consent, and Play's rule that
digital goods inside an Android app go through Play Billing and its cut. The
currency we already have is also the better one: coins come from redeeming
vouchers, 50 a time, so the way to afford the Mtatsminda background is to walk
into a shop. That is exactly the behaviour the venues are paying for.

Six backgrounds seeded at 200 to 1000 coins -- four visits for a common one,
twenty for the Bridge of Peace.

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

1. ~~Visibility modes, end to end~~ -- built, `0040`. Ghost default, the under-16
   lock enforced in both the RPC and a trigger, displacement seeded on player and
   hour (measured at 374 m and 416 m for two accounts, and stable across repeated
   calls), `nearby_players` and `player_card` gated on it, and the picker at the
   top of Settings.
2. ~~The four tabs~~ -- built, `see Done`. Map, Vouchers, Character, Season;
   the pass folded into Season and settings moved to a header button on it.
3. **The character stage.** Full-size creature on its pedestal with the gear
   around it, and a background slot -- a drawn gradient until there is a
   Mtatsminda Park image to put in it.
4. ~~Head boxes on the map~~ -- built. Other players draw as a head box above
   their point, tapping opens their card, and an approximate position says so on
   that card. Still drawn rather than illustrated, and the player's own head box
   is not on the map yet -- their own dot is still the puck.
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
| Four tabs: Map, Vouchers, Character, Season | `2ef9a5f` |
| Visibility modes, head boxes, player cards | `0040`, `84191ec` |
| Coins, the store tab, six backgrounds | `0042` |
| Seasonal rotation, vaulting, art-cost calculator | `0043` |
