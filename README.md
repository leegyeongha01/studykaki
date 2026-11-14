# StudyKaki

StudyKaki opens directly in a virtual library for NTU Singapore students. Enter your name, major, and year, customise your avatar, and choose a room. Click the floor to walk, use WASD or the arrow keys, and click a chair to sit. Study alone or share a live room invitation to see your friends' avatars move in the same room. Open the focus timer and checklist from the study scene.

The **Campus sessions** button opens the campus meetup board. Search by date, study type, module code, or venue, plan a meetup, and export sessions as `.ics` files.

[Open StudyKaki](https://leegyeongha01.github.io/studykaki/)

## Run locally

Open `index.html` in a browser, or serve this folder with any static HTTP server. The site requires no build step.

## Publish on GitHub Pages

1. Push the contents of this folder to the root of a public GitHub repository's `main` branch. Keep `.nojekyll` at the root.
2. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, select `main` and `/(root)`, then save.
3. Once the deployment succeeds, share the URL shown under **Settings → Pages**. The default project URL is `https://OWNER.github.io/REPOSITORY/`. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## How data is stored

Sample sessions illustrate the study board. Your profile, created sessions, saved plans, bookmarks, and focus history are stored in this browser. A session link shares its details, including notes, with anyone who receives the link. Confirm attendance with your host directly. Each library manages space and seat bookings through its own booking channels. [NTU Library study spaces](https://www.ntu.edu.sg/education/libraries/about-ntu-library) · [NTU Library bookings](https://libfaq.ntu.edu.sg/faq/267267)

Online rooms open when a host goes online and shares a live invite. Keep the host tab open. Participants see the room display names, avatar settings, and in-room movement. WebRTC uses [PeerJS Cloud](https://peerjs.com/server/cloud) for signaling. Some networks restrict peer-to-peer connections, so the room and timer can also be used solo. The walkable scene uses [Three.js](https://threejs.org/) and WebGL.

## Feature references

- The avatar and virtual reading room were inspired by [Paper Together](https://paper-together.com/).
- Session search and filters were informed by [Meetup](https://help.meetup.com/hc/en-us/articles/39235072484109-Finding-an-event).
- The timer presets and focus goal were informed by [Focusmate](https://www.focusmate.com/features/).
- The timer, breaks, and checklist were informed by [Pomofocus](https://pomofocus.io/).
- Personal focus history was informed by [StudyStream](https://help.studystream.live/hc/help/articles/1791807619-your-stats-hours-rank-and-badges).

The campus illustration and the virtual reading room were generated with OpenAI ImageGen. The campus image depicts an exterior inspired by The Hive, with tropical planting and warm afternoon light. The room image depicts a timber-lined NTU library with warm light, reading tables, bookshelves, and tropical palms outside.
