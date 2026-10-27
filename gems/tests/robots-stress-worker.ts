import {robotsAllows} from '../packages/marketplace/catalog';
const rules='User-agent: *\nDisallow: /vehicles/'+'*a'.repeat(28)+'b$';
const allowed=robotsAllows(rules,'https://www.gta5-mods.com/vehicles/'+'a'.repeat(60)+'c');
console.log('bounded-match:'+String(!allowed));
