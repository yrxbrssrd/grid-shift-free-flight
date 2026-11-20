# Grid Shift · Free Flight

A compact, open-world 3D flight game by Team TTT for GitHub Game Off 2026. Recover energy cells above the harbor, switch the drone’s phase to match them, and restore six districts in any order. Docklands needs one cyan and one pink cell. Crosswind needs two cyan cells. Central Core needs one of each and stays locked until both phase-matched rooftop relays are active. Neon Quay, Signal Heights and Afterlight Yard require larger deliveries and rooftop relay runs. The four-cell cargo hold makes Afterlight Yard a multi-trip delivery. Fly into a district’s charging ring to unload the cells it needs and light up its buildings.

The harbor spans 192 by 192 m and has 107 buildings. Its tallest tower reaches 47 m, just below the 52 m flight ceiling. Fly low to see pedestrians sheltering under umbrellas, the fish stalls of Neon Quay, the shops of Signal Heights and freight waiting outside Afterlight Yard. Taxis and delivery vans travel the outer districts as well as the old harbor. An articulated shuttle runs downtown, a train crosses the viaduct, and boats and fishing crews work the canal pontoons. Amber lights mark the flight perimeter.

Rain splashes on roofs, stone paving and patched asphalt. Wet vehicles reflect their local surroundings and nearby shop signs. The courier's headlight casts shadows in front of the ship. At low altitude you can see the silhouette of its wings and twin engines on the road.

The drone's rotors respond to throttle, climbing, boost and braking. At street level you can hear rain and the sound of electric motors and wet tyres as taxis, delivery vans and the shuttle pass. Turn the camera to place passing traffic on the left or right. The sound button mutes the entire mix, and pausing the flight silences it.

## Play

Open the directory through a local web server or upload the playable ZIP to itch.io. The game bundles its code and renderer and runs without external requests. For local play, run `python3 -m http.server 8174` inside this directory and open `http://127.0.0.1:8174/`.

| Control | Action |
| --- | --- |
| W / S, Z / S, or up / down arrows | Fly forward / reverse |
| A / D, Q / D, or left / right arrows | Turn the drone and chase camera |
| R / F | Ascend / descend |
| Shift or Space | Switch between cyan and pink |
| Hold X | Boost while the battery has power |
| Hold C | Brake and counter drift |
| V | Release one cell of your current phase back to its pickup point |
| M | Track another unfinished district |
| T | Enter or leave the harbor time trial |
| P or Escape | Pause / resume |

After restoring all six districts, choose **Keep flying** to explore the powered city or race the time trial. **New mission** resets the campaign.

The chase camera follows the drone’s heading. On touch screens, drag sideways to turn and vertically to fly forward or reverse, hold an altitude button to move vertically, and tap **SHIFT** to change phase. On the minimap an arrow marks the drone, numbered circles mark substations, squares mark relays, and small colored dots mark uncollected cells. Full visual quality requires WebGL. Browsers without WebGL show a basic top-down map.

In the harbor time trial, the clock starts at the first gate. Match each gate’s phase and fly through all 20 across the inner and outer harbor before the 120-second limit. The game saves your fastest time locally when browser storage is available.

## Game Off entry

- The theme is **SHIFT**. Switching the drone’s phase determines which cells it can collect and which moving hazards can damage it.
- `Grid_Shift_Free_Flight.zip` contains the playable entry, with `index.html` at the ZIP root. Select **HTML Game** and mark it as playable in the browser.
- Submit the playable game through the [Game Off 2026 page](https://itch.io/jam/game-off-2026) before **December 1 at 13:37 PST** (**December 2 at 05:37 Hong Kong time**). Provide the link to a public GitHub repository containing the source. [Official rules](https://itch.io/jam/game-off-2026/topic/7290154/frequently-asked-questions-faq)

## Credits and AI disclosure

Team TTT led the game’s creative and art direction. Across successive builds, Yrieix Brissard asked for an open world, a chase camera that turns with the courier, and a longer flight through a denser harbor. TTT shaped the look and sound of that harbor down to the rain hitting the pavement, neon reflected on passing taxis, and the pitch of the courier’s motors as it accelerates.

OpenAI Codex wrote and debugged much of the game code, including the systems that build the 3D city, generate its textures and lighting, and synthesize its audio. Codex also contributed to game design, in-game text and testing. Three.js r158 is bundled under the [MIT license](vendor/THREE-LICENSE.txt).
