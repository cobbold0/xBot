import { migrate } from './migrate';
import { closePool } from './pool';
migrate().then(() => { console.log('migrations applied'); return closePool(); }).catch((e) => { console.error(e.message); process.exit(1); });
