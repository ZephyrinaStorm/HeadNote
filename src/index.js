import { Client, Events, GatewayIntentBits, MessageFlags, Routes } from 'discord.js';
import { Connectors, Shoukaku } from 'shoukaku';
import { createActions, invite } from './actions.js';
import { commands } from './catalog.js';
import { settingsFile, UserError } from './core.js';
import { Players } from './player.js';
import { serverFor, statusReader } from './web.js';

const env = process.env;
const token = env.DISCORD_TOKEN?.trim();
const nodeHost = env.LAVALINK_HOST?.trim();
const nodePassword = env.LAVALINK_PASSWORD;
const secure = env.LAVALINK_SECURE?.toLowerCase() === 'true';
const nodeUrl = nodeHost ? URL.parse((secure ? 'https' : 'http') + '://' + nodeHost) : null;
const nodeConfigured = !!(nodePassword && nodeUrl && !nodeUrl.username && !nodeUrl.password &&
  nodeUrl.pathname === '/' && !nodeUrl.search && !nodeUrl.hash);
const nodeOptions = nodeConfigured ? { name: 'personal', url: nodeUrl.host, auth: nodePassword, secure } : null;
const settings = await settingsFile(env.SETTINGS_FILE || './data/settings.json');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  allowedMentions: { parse: [] }, rest: { timeout: 8000, retries: 1 } });
const shoukaku = token && nodeOptions ? new Shoukaku(new Connectors.DiscordJS(client), [nodeOptions], {
  reconnectTries: 10_000, reconnectInterval: 10, restTimeout: 6, voiceConnectionTimeout: 12,
}) : null;
const players = new Players(client, shoukaku, settings);
const getStatus = statusReader({ client, configured: nodeConfigured, discordConfigured: !!token,
  nodeUrl, password: nodePassword, shoukaku, players });
const actions = createActions({ client, players, settings, getStatus,
  publicUrl: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL,
  directHosts: new Set((env.DIRECT_AUDIO_HOSTS ?? '').toLowerCase().split(',').map(host => host.trim()).filter(Boolean)),
});

shoukaku?.on('error', (node, error) => console.warn('Lavalink connection error:', error.name));
shoukaku?.on('close', () => {
  for (const id of players.sessions.keys()) players.event(id, () => players.leave(id));
});
shoukaku?.on('ready', () => console.log('Connected to personal Lavalink.'));
client.on(Events.Error, error => console.warn('Discord client error:', error.name));
client.on(Events.VoiceStateUpdate, (previous, next) => {
  if (next.id !== client.user?.id || previous.channelId === next.channelId || !previous.channelId) return;
  const session = players.sessions.get(next.guild.id);
  if (!session) return;
  players.event(next.guild.id, async () => {
    if (players.sessions.get(next.guild.id) !== session) return;
    if (!next.channelId) await players.leave(next.guild.id);
    else session.channelId = next.channelId;
  });
});
client.on(Events.GuildDelete, guild => players.event(guild.id, () => players.leave(guild.id)));

const byName = new Map(commands.map(command => [command.name, command]));
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.inCachedGuild()) return;
  const command = byName.get(interaction.commandName);
  if (!command) return;
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const description = await actions(command, interaction);
    await interaction.editReply({ embeds: [{ title: '/' + command.name, description: description.slice(0,4000), color: 0xaaff68 }] });
  } catch (error) {
    if (!(error instanceof UserError)) console.warn('Command failed:', command.name, error.name, error.code ?? '');
    if (interaction.deferred) {
      const content = error instanceof UserError ? error.message : 'The command could not finish. Try again in a moment.';
      await interaction.editReply({ content }).catch(() => {});
    }
  }
});

client.once(Events.ClientReady, async ready => {
  console.log('Headnote connected to Discord.');
  const guildId = env.DISCORD_TEST_GUILD_ID?.trim();
  const path = guildId ? Routes.applicationGuildCommands(ready.application.id, guildId)
    : Routes.applicationCommands(ready.application.id);
  const body = commands.map(({ category, ...command }) => guildId ? command : { ...command, contexts: [0], integration_types: [0] });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await ready.rest.put(path, { body });
      console.log('Registered %d %s slash commands.', body.length, guildId ? 'test-server' : 'global');
      break;
    } catch (error) {
      console.error('Slash command registration failed:', error.name, error.code ?? '');
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }
});

const server = serverFor(getStatus, () => {
  const id = client.application?.id || env.DISCORD_APPLICATION_ID;
  return /^\d{17,22}$/.test(id ?? '') ? invite(id) : null;
});
server.listen(Number(env.PORT || 3000), '0.0.0.0', () => {
  console.log('Headnote website listening on port %s.', server.address().port);
});
if (token) {
  client.login(token).catch(error => console.error('Discord login failed:', error.name, error.code ?? ''));
} else {
  console.log('DISCORD_TOKEN is missing. Running the website and status API.');
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  const deadline = setTimeout(() => process.exit(), 7500);
  deadline.unref();
  await Promise.allSettled([...players.sessions.keys()].map(id => players.run(id, () => players.leave(id))));
  if (shoukaku?.nodes.has('personal')) shoukaku.removeNode('personal');
  await client.destroy();
  process.exit();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
