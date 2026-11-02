// `npm run groups` — list your WhatsApp groups; ✓ marks the ones config.json watches.
import { bridge } from './bridge-client.mjs';
import { loadConfig } from './config.mjs';

const groups = await bridge('GET', '/groups');
const config = loadConfig();
const watched = new Set(config.groups.map((g) => g.jid).filter(Boolean));
groups.sort((a, b) => a.name.localeCompare(b.name, 'he'));
for (const g of groups) console.log(`${watched.has(g.jid) ? '✓' : ' '} ${g.name}  (${g.size} members)`);
for (const g of config.groups.filter((g) => !g.jid)) console.warn(`\n✗ Not matched: "${g.name}"`);
