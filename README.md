# 色感對決 Color Duel

A color perception race for team events. Everyone plays on their phone at the same time, and the TV shows a live ranking.

**Play:** https://tengfanfan1031.github.io/color-duel/

- 20 levels, easy to hard: the grid grows from 3×3 to 8×8. Levels 1–18 ease you in (lightness gap 20% down to 5%); only levels 19 and 20 are hard (2.6%, 1.8%).
- Bilingual interface: Traditional Chinese and English.
- Find the one tile with a different shade. Each wrong tap adds 3 seconds.
- Everyone gets the exact same puzzles. Fastest total time wins.

## Running the event

1. On the computer connected to the TV, open the link and tap **Host on TV**. The TV shows a QR code and a 4-character room code.
2. Players scan the QR code (or open the link and type the code), enter their name and tap **Join the game**. Their names appear on the TV.
3. Each player taps **I'm ready**. Their name turns green on the TV, which shows how many are ready (e.g. 32 / 40 ready).
4. When everyone is ready, tap **Start** on the TV. Nobody starts before that: everyone gets the same 3-2-1 countdown and plays at once. (You can also tap **Start anyway** if a few people never tap ready.)
5. The TV shows a live ranking of all players: finished players by total time, everyone else by level reached.
6. When everyone has finished, the TV shows the podium and the final ranking. Tap **End round** to stop early.
7. Tap **New round** to play again with the same room. Players stay connected.

Up to 80 players per room. Keep the TV computer awake and on this page for the whole event: it hosts the room.

You can also tap **Practice solo** on a phone to play alone.

## Tech

`index.html` (layout) and `game.js` (game logic), with no server or accounts. Multiplayer uses [PeerJS](https://peerjs.com/) (WebRTC): each phone connects directly to the TV computer, which keeps the ranking.
