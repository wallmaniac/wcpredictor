/* eslint-disable no-undef, no-unused-vars */
const matchData = require('./src/utils/matchData.js');
// Wait, matchData.js is ES module, so we can't require it directly. Let's just import it or parse it.
// Actually, we can read the file as text and execute it, or write check_groups.js as type module!
