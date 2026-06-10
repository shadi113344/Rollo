# Rollo

Personal media library — browse photos and videos from your LAN or Tailscale network.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3847` (or the LAN/Tailscale URL printed in the terminal).

Default port is **3847** (avoids common dev ports like 3000). Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

On Windows, double-click **`start-rollo.bat`** (sets `PORT=3847`).

To rename the project folder from `video-page` to `Rollo`, close Cursor, run **`rename-folder-to-Rollo.bat`**, then reopen `c:\Storage\Rollo`.

## Environment

| Variable | Purpose |
|----------|---------|
| `VIDEO_SECRET` | HMAC secret for group unlock tokens. Set this in production so tokens cannot be forged. |

Example:

```bash
VIDEO_SECRET=your-long-random-string npm start
```

## Libraries

- Media files live in `videos/{LibraryName}/`
- Tags and favorites in `data/metadata.json`
- Display names and passwords in `data/groups.json`

Locked libraries require a password; unlock tokens are stored in the browser and sent via the `X-Unlocked` header.

## Tests

```bash
npm test
```
