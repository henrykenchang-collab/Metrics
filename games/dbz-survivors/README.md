# Z Fighters: Survivor

A single-file, self-contained browser game — a *Vampire Survivors*-style bullet-heaven
roguelike, reskinned with an original Dragon-Ball-Z-inspired cast. Unofficial fan
project, not affiliated with Toei Animation, Bird Studio, or Shueisha.

Open `index.html` directly in a browser — no build step, no server, no dependencies.

## Loop

Move with WASD/arrow keys (or touch-drag). Attacks are automatic. Survive waves of
enemies, collect XP orbs, and pick one of three random power-ups on level-up. Bosses
arrive at fixed intervals; defeating one (or an elite "Dragon Ball Carrier") drops a
Dragon Ball. Collect seven in a run and Shenron grants a bonus.

## Meta-progression / gacha

Zeni (earned only by playing — kills, survival time, bosses, Dragon Balls) is spent
in the **Summon** screen to pull for new playable fighters across five rarity tiers,
with a slot-machine-style reel animation, a visible odds table, and a pity system
(guaranteed Super Rare+ within 10 pulls, guaranteed Legendary within 50). Duplicate
pulls convert to bonus Zeni instead of being wasted. There is no real-money purchase
path anywhere in the game — every currency and reward is earned by playing.

Progress (Zeni + unlocked roster + pity counters) is saved to the browser's
`localStorage`, keyed under `zf_survivor_save_v1`.
