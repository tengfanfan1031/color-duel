# Color Duel

A two-player, head-to-head color perception race for team events.

**Play:** https://tengfanfan1031.github.io/color-duel/

- 20 levels, easy to hard: the grid grows from 3×3 to 8×8. Levels 1–17 ease you in (lightness gap 20% down to about 5%); the last 3 levels are the real challenge (3%, 2.4%, 1.8%).
- Find the one tile with a different shade. Each wrong tap adds 3 seconds.
- Both players get the exact same puzzles. Fastest total time across all 20 levels wins.

## How to play

1. Open the link and enter your name.
2. One player taps **Create room** and shares the 4-character code.
3. The other enters the code and taps **Join**.
4. Both tap **I'm ready** and the countdown begins.

You can also tap **Practice solo** to play alone.

## Show the match on a TV

1. Open the link on the computer connected to the TV.
2. Enter the room code and tap **Watch on TV**.
3. The TV shows both players' boards side by side, live timers, levels, misses, and the winner. When a player finds the odd tile, it is briefly outlined in green so the audience can see the answer.

Several TV views can watch the same room.

## Tech

A single `index.html` with no server or accounts. Multiplayer uses [PeerJS](https://peerjs.com/) (WebRTC) to connect the two browsers directly.
