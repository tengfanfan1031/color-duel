# Color Duel

A color perception race for team events. Everyone plays on their phone at the same time, and the TV shows a live ranking.

**Play:** https://tengfanfan1031.github.io/color-duel/

- 20 levels, easy to hard: the grid grows from 3×3 to 8×8. Levels 1–17 ease you in (lightness gap 20% down to about 5%); the last 3 levels are the real challenge (3%, 2.4%, 1.8%).
- Find the one tile with a different shade. Each wrong tap adds 3 seconds.
- Everyone gets the exact same puzzles. Fastest total time wins.

## Running the event

1. On the computer connected to the TV, open the link and tap **Host on TV**. The TV shows a QR code and a 4-character room code.
2. Players scan the QR code (or open the link and type the code), enter their name and tap **Join the game**. Their names appear on the TV.
3. When everyone is in, tap **Start** on the TV. Everyone gets a 3-2-1 countdown and plays at once.
4. The TV shows a live ranking of all players: finished players by total time, everyone else by level reached.
5. When everyone has finished, the TV shows the podium and the final ranking. Tap **End round** to stop early.
6. Tap **New round** to play again with the same room. Players stay connected.

Up to 80 players per room. Keep the TV computer awake and on this page for the whole event: it hosts the room.

You can also tap **Practice solo** on a phone to play alone.

## Tech

A single `index.html` with no server or accounts. Multiplayer uses [PeerJS](https://peerjs.com/) (WebRTC): each phone connects directly to the TV computer, which keeps the ranking.
