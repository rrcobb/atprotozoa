// Bundled for the browser by build/bundle.mjs -> public/vendor/pkmn.js.
// The battle engine (@pkmn/sim), the random-team generator (@pkmn/randoms),
// and sprite URL lookup (@pkmn/img) have no fs/node dependencies in their
// core paths, so they run fine client-side with no server round-trip per turn.
import { Teams, Battle } from "@pkmn/sim";
import { TeamGenerators } from "@pkmn/randoms";
import { Sprites, Icons } from "@pkmn/img";

window.PKMN = { Teams, Battle, TeamGenerators, Sprites, Icons };
