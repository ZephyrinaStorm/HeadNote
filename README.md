# Headnote

Headnote connects Discord to your personal Lavalink node. It serves its website and status API from the same Node.js process.

## 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications). Select **New Application** and name it **Headnote**.
2. Open **Bot** and generate a bot token. Copy it directly to the Render `DISCORD_TOKEN` field during setup. Keep your bot token and Lavalink password out of GitHub.
3. Under **Installation**, enable **Guild Install** and use the **Discord Provided Link**. Add the `bot` and `applications.commands` scopes. Select **View Channels**, **Send Messages**, **Embed Links**, **Connect**, and **Speak**.
4. Copy the installation link and add the application to your Discord server. Headnote uses the Guilds and Guild Voice States intents and needs no privileged gateway intents. Leave the Interactions Endpoint URL empty.
5. Optionally copy the Application ID from **General Information**. Set `DISCORD_APPLICATION_ID` on Render to show the website’s invite button before the bot connects.

## 2. Upload to GitHub

Extract the ZIP, then upload the files and folders inside it to the root of a new GitHub repository. Make sure `package.json`, `package-lock.json`, and `render.yaml` are at the root and the `src` and `public` folders retain their structure. GitHub’s web uploader can omit hidden files. If you create a local `.env`, keep it out of any browser upload.

Using Git is also supported. Create an empty GitHub repo, then run these commands from the extracted folder after replacing `YOUR-REPO-URL`.

```sh
git init -b main
git add .
git commit -m "Add Headnote"
git remote add origin YOUR-REPO-URL
git push -u origin main
```

## 3. Deploy to Render

Use **New → Blueprint**, select your GitHub repo, and supply the required environment variables. Or create a **Node Web Service** with build command `npm ci --omit=dev`, start command `npm start`, and health check path `/healthz`.

| Environment variable | Value |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `LAVALINK_HOST` | Your personal node in `hostname:port` format |
| `LAVALINK_PASSWORD` | Your Lavalink authorization password |
| `LAVALINK_SECURE` | `true` for HTTPS/WSS or `false` for HTTP/WS. Update the Blueprint value before syncing if your node uses TLS. |
| `DIRECT_AUDIO_HOSTS` | Optional. Comma-separated exact public audio hosts, including non-default ports as applicable |
| `DISCORD_APPLICATION_ID` | Optional. Application ID for the website invite link |
| `DISCORD_TEST_GUILD_ID` | Optional. Register the commands on just this server to smoke-test. Remove the variable for global registration. Test-guild registrations remain until removed from Discord. |
| `PUBLIC_URL` | Optional. Public address for `/website`. Defaults to the Render URL. |
| `SETTINGS_FILE` | Optional. Path for server settings, such as `/var/data/settings.json` with a persistent disk. |

Use **Lavalink 4.2.0 or newer in the v4 series** for Discord's DAVE voice support. The node must be reachable from Render and have the required plugins and provider credentials configured. Headnote sends the node the search query or provider link. Spotify and Apple Music links use your node’s configured mirror providers. Amazon Music and Pandora links require the corresponding source managers or plugins on your node. Flowery uses the `ftts://` resolver via `/tts`.

Provider links are accepted for the supported standard domains. Add trusted custom streaming hosts and direct radio hosts to `DIRECT_AUDIO_HOSTS`. The setting is empty by default. Keep private network destinations blocked on the Lavalink server, which performs the media fetches, and configure TLS for connections across untrusted networks when available.

The included **free** plan can sleep when idle. Use a paid instance for continuous Discord availability. To retain server settings after restarts and deploys on Render, attach a persistent disk to a paid web service and set `SETTINGS_FILE` to a file on that disk. Run one instance. Active voice sessions and queues are held in memory and reset on restart.

## 4. Verify the deployment

1. Check Render logs for `Headnote connected to Discord`, `Connected to personal Lavalink`, and `Registered 70 global slash commands` (or test-server commands).
2. Open the Render URL and the **Status** section. The status API at `/api/status` reports the Discord connection, Lavalink REST reachability, Lavalink WebSocket, and source managers reported by the node. Actual playback also depends on the source, link, and provider configuration. `/healthz` checks the web process.
3. In Discord, join a standard voice channel and run `/play`. Test `/pause`, `/resume`, `/skip`, and `/nightcore`. Use `/help` to view all 70 commands. Applying a filter replaces the current preset. Use `/filter-reset` to clear it.

## Local development

Use Node.js 24. Copy `.env.example` to `.env`, fill in your own credentials, and run `npm ci`, then `npm start`. Visit `http://localhost:3000`. Without credentials, the website and API run in unconfigured mode. Run `npm test` for local tests.

| Category | Commands |
| --- | ---: |
| Filters | 15 |
| Info | 10 |
| Music | 15 |
| Queue management | 15 |
| Config | 10 |
| Song | 5 |
