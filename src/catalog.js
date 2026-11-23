export const sources = [
  { name: 'YouTube', mark: '▶', color: 'red', note: 'YouTube and YouTube Music video, track and playlist links.', hosts: ['youtube.com','youtu.be'], managers: ['youtube'] },
  { name: 'SoundCloud', mark: '≋', color: 'orange', note: 'Tracks, playlists and artist pages.', hosts: ['soundcloud.com'], managers: ['soundcloud'] },
  { name: 'Bandcamp', mark: '◢', color: 'blue', note: 'Albums and tracks from independent artists.', hosts: ['bandcamp.com'], managers: ['bandcamp'] },
  { name: 'Twitch', mark: '▣', color: 'purple', note: 'Live audio from Twitch streams.', hosts: ['twitch.tv'], managers: ['twitch'] },
  { name: 'Vimeo', mark: 'v', color: 'blue', note: 'Listen to audio from Vimeo videos.', hosts: ['vimeo.com'], managers: ['vimeo'] },
  { name: 'HTTP / Direct', mark: '↗', color: 'mint', note: 'Direct audio links and internet radio from configured hosts.', managers: ['http'] },
  { name: 'Spotify', mark: '☰', color: 'mint', note: 'Resolve tracks and playlists through your node’s configured providers.', hosts: ['spotify.com','spotify.link'], managers: ['spotify'] },
  { name: 'Apple Music', mark: '♫', color: 'red', note: 'Resolve tracks and playlists through your node’s configured providers.', hosts: ['music.apple.com'], managers: ['applemusic','apple music'] },
  { name: 'Deezer', mark: '▥', color: 'purple', note: 'Tracks and playlists via your Deezer source manager.', hosts: ['deezer.com','deezer.page.link'], managers: ['deezer'] },
  { name: 'Amazon Music', mark: 'a', color: 'blue', note: 'Music links handled by your node’s Amazon Music plugin.', hosts: ['music.amazon.com','music.amazon.co.uk','music.amazon.de','music.amazon.fr','music.amazon.ca','music.amazon.co.jp','music.amazon.it','music.amazon.es','music.amazon.com.au','amzn.to'], managers: ['amazon','amazonmusic'] },
  { name: 'Flowery TTS', mark: '✿', color: 'purple', note: 'Read text aloud in voice with /tts.', managers: ['flowerytts','flowery','ftts'] },
  { name: 'Pandora', mark: 'P', color: 'blue', note: 'Station links handled by your node’s Pandora plugin.', hosts: ['pandora.com','pandora.app.link'], managers: ['pandora'] },
];

const option = (type, name, description, required = true, extra = {}) => ({ type, name, description, required, ...extra });
const str = (name, description, required = true, extra = {}) => option(3, name, description, required, extra);
const int = (name, description, min, max, required = true) =>
  option(4, name, description, required, { min_value: min, max_value: max });
const toggle = (name, description) => option(5, name, description);
const pos = (name = 'position', description = 'Upcoming queue position, starting at 1') => int(name, description, 1, 500);
export const searchProviders = { youtube: 'ytsearch', 'youtube-music': 'ytmsearch', soundcloud: 'scsearch', spotify: 'spsearch', 'apple-music': 'amsearch', deezer: 'dzsearch' };
const choice = (name, description, values, required = true) => str(name, description, required, {
  choices: values.map(value => ({ name: value, value }))
});
const query = str('query', 'Track title, artist or supported URL', true, { max_length: 800 });
const provider = choice('source', 'Source for text search', Object.keys(searchProviders), false);
const volume = int('percent', 'Volume percentage', 0, 150);
const number = (name, description, min, max) => option(10, name, description, true, { min_value: min, max_value: max });

export const categories = [
  { name: 'Filters', entries: [
    ['bassboost','Boost the low frequencies'], ['nightcore','Speed up playback and raise the pitch'],
    ['vaporwave','Slow playback and lower the pitch'], ['8d','Rotate audio through the stereo field'],
    ['karaoke','Reduce center-channel vocals'], ['tremolo','Pulse the audio amplitude'],
    ['vibrato','Apply a pitch modulation'], ['lowpass','Soften high frequencies'],
    ['mono','Mix the left and right channels'], ['left-only','Play audio through the left channel'],
    ['right-only','Play audio through the right channel'], ['trebleboost','Boost high frequencies'],
    ['speed','Set a custom playback speed', [number('multiplier','Playback speed',0.5,2)]],
    ['pitch','Set a custom pitch multiplier', [number('multiplier','Pitch multiplier',0.5,2)]],
    ['filter-reset','Clear the active audio filter'],
  ] },
  { name: 'Info', entries: [
    ['help','Show Headnote’s command list'], ['about','Learn what Headnote does'], ['ping','Show Discord gateway latency'],
    ['uptime','Show Headnote’s uptime'], ['status','Check Discord, Lavalink and the status API'],
    ['sources','List the audio sources supported by your setup'], ['node','Show the connected audio node status'],
    ['botinfo','Show the Headnote application and active player counts'],
    ['invite','Get the invite link for Headnote'], ['website','Open the Headnote website'],
  ] },
  { name: 'Music', entries: [
    ['play','Play or enqueue a track or playlist', [query,provider]], ['join','Join your voice channel'],
    ['leave','Disconnect and clear this server’s playback session'], ['pause','Pause the current track'],
    ['resume','Resume the current track'], ['stop','Stop playback while keeping upcoming tracks'],
    ['skip','Play the next track'], ['previous','Play the most recent track from history'],
    ['seek','Jump to an absolute timestamp', [int('seconds','Seconds from the beginning',0,86400)]],
    ['forward','Seek forward in the current track', [int('seconds','Seconds to move forward',1,86400)]],
    ['rewind','Seek backward in the current track', [int('seconds','Seconds to move backward',1,86400)]],
    ['volume','Set the current session volume', [volume]],
    ['loop','Choose what to repeat', [choice('mode','Repeat mode',['off','track','queue'])]],
    ['restart','Restart the current track'],
    ['tts','Read a message aloud using Flowery', [str('text','Text to read',true,{max_length:300})]],
  ] },
  { name: 'Queue', entries: [
    ['queue','Show upcoming tracks', [int('page','Page number',1,50,false)]],
    ['queue-add','Add a track or playlist to the end', [query,provider]],
    ['play-next','Place a track or playlist at the front', [query,provider]],
    ['queue-remove','Remove one upcoming track', [pos()]], ['queue-move','Move an upcoming track', [pos('from','Position to move'),pos('to','New position')]],
    ['queue-swap','Swap two upcoming tracks', [pos('first','First position'),pos('second','Second position')]],
    ['queue-shuffle','Shuffle upcoming tracks'], ['queue-clear','Clear upcoming tracks'],
    ['queue-jump','Play an upcoming track and drop the tracks ahead of it', [pos()]],
    ['queue-dedupe','Remove duplicate upcoming tracks'], ['queue-reverse','Reverse upcoming track order'],
    ['queue-size','Show the number and duration of upcoming tracks'],
    ['queue-history','Show recently played or skipped tracks'],
    ['queue-remove-range','Remove an inclusive range of upcoming tracks', [pos('first','Start position'),pos('last','End position')]],
    ['queue-remove-user','Remove upcoming tracks requested by a member', [option(6,'member','The member who requested the tracks')]],
  ] },
  { name: 'Config', entries: [
    ['config-show','Show this server’s Headnote settings'],
    ['config-volume','Set the default volume for new sessions', [volume]],
    ['config-dj','Limit shared playback controls to a DJ role', [option(8,'role','DJ role to authorize')]],
    ['config-dj-clear','Remove the DJ role restriction'],
    ['config-idle','Set how long Headnote waits while idle', [int('seconds','Idle timeout in seconds',30,1800)]],
    ['config-source','Choose the default source for text searches', [choice('source','Default source',Object.keys(searchProviders))]],
    ['config-announcements','Toggle automatic now-playing messages', [toggle('enabled','Send now-playing messages')]],
    ['config-channel','Choose the now-playing announcement channel', [option(7,'channel','Announcement text channel',true,{channel_types:[0,5]})]],
    ['config-channel-clear','Send announcements to the request channel again'],
    ['config-reset','Restore the default settings for this server'],
  ] },
  { name: 'Song', entries: [
    ['nowplaying','Show the current track and playback position'], ['song-info','Show the current track’s music metadata'],
    ['song-link','Get the public link for the current track'], ['song-requester','Show who requested the current track'],
    ['search','Preview up to five results without queuing them', [query,provider]],
  ] },
];
export const commands = categories.flatMap(({ name: category, entries }) => entries.map(([name,description,options = []]) => ({
  category, name, description, options, ...(category === 'Config' && name !== 'config-show' ? { default_member_permissions: '32' } : {}),
})));
export const catalog = {
  sources: sources.map(({ name, mark, color, note }) => ({ name, mark, color, note })),
  categories: categories.map(({ name }) => ({ name, commands: commands.filter(command => command.category === name).map(({ name, description }) => ({ name, description })) })),
};
