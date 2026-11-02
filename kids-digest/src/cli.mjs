// `npm run groups` — list your WhatsApp groups so you can copy JIDs into config.json.
import { bridge } from './bridge-client.mjs';

const groups = await bridge('GET', '/groups');
groups.sort((a, b) => a.name.localeCompare(b.name, 'he'));
for (const g of groups) console.log(`${g.jid}\t${g.name}\t(${g.size} members)`);
