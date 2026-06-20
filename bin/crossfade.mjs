#!/usr/bin/env node
// crossfade CLI entrypoint (R17).
//
// Implemented: node add / node ls (seed the graph), sample (draw a combo, no
// generation). burst / ask / chat / rate / lineage are wired in later units.

import { config } from "../src/config.mjs";
import { openStore, ROLES } from "../src/store.mjs";
import { sampleCombo } from "../src/sampler.mjs";

const HELP = `crossfade — a personal Suno radio station

Usage: crossfade <command> [args]

Commands:
  node add seed <band|album|theme> "<name>"...  add seed(s) — quote each name
  node add vibe "<name>"...                      add vibe(s) — affect/color
  node add mutator "<name>"...                   add mutator(s) — operation applied last
       (adds are idempotent: names already in the graph are skipped, not duplicated)
  node rm <id>                                  remove a node by id
  node ls                                       list all nodes by role
  sample                                        draw a combo from the graph (no generation)
  burst <n> [--plan]                            generate n songs        (not yet)
  ask "<what-if>"                               directed combo via DJ   (not yet)
  chat "<message>"                              steer the DJ            (not yet)
  rate <song> up|down [--note "..."]            rate a song             (not yet)
  lineage <song|node>                           show inspiration lineage (not yet)
`;

const NOT_YET = new Set(["burst", "ask", "chat", "rate", "lineage"]);
const SEED_TYPES = ["band", "album", "theme"];

function fmtNode(n) {
  const sub = n.role === n.type ? n.role : `${n.role}:${n.type}`;
  return `  [${n.id}] ${sub.padEnd(12)} ${n.name}`;
}

function cmdNode(args, store) {
  const sub = args[0];
  if (sub === "add") {
    const role = args[1];
    if (!ROLES.includes(role)) {
      console.error(`role must be one of ${ROLES.join("|")}`);
      return 1;
    }
    // seeds carry a sub-type (band|album|theme); vibe/mutator default sub-type to the role.
    // Every remaining argument is a separate node name — quote multi-word names.
    const hasSubtype = role === "seed";
    const type = hasSubtype ? args[2] : role;
    const names = args.slice(hasSubtype ? 3 : 2).filter((n) => n && n.trim());
    if (hasSubtype && !type) {
      console.error('seed needs a sub-type: node add seed <band|album|theme> "<name>" ["<name>" ...]');
      return 1;
    }
    // Validate the seed sub-type — a typo here creates a node the sampler can never
    // draw (it only knows band/album anchors and theme), so reject it early.
    if (hasSubtype && !SEED_TYPES.includes(type)) {
      console.error(`seed sub-type must be one of ${SEED_TYPES.join("|")}, got: "${type}"`);
      return 1;
    }
    if (!names.length) {
      console.error('at least one name is required (quote multi-word names)');
      return 1;
    }
    let added = 0;
    let existed = 0;
    let bad = 0;
    for (const name of names) {
      try {
        const existing = store.findNode(role, type, name);
        if (existing) {
          console.log(`=  ${fmtNode(existing).trim()}   (already in graph)`);
          existed++;
          continue;
        }
        console.log(`+  ${fmtNode(store.addNode(role, type, name)).trim()}`);
        added++;
      } catch (e) {
        console.error(`!  ${name}: ${e.message}`);
        bad++;
      }
    }
    if (names.length > 1) {
      console.log(`\n${added} added, ${existed} already present${bad ? `, ${bad} rejected` : ""}`);
    }
    return bad && !added ? 1 : 0;
  }
  if (sub === "rm" || sub === "remove") {
    const rest = args.slice(1);
    const force = rest.includes("--force") || rest.includes("-f");
    const id = Number(rest.find((a) => a && !a.startsWith("-")));
    if (!Number.isInteger(id)) {
      console.error("usage: node rm <id> [--force]   (see ids with `node ls`)");
      return 1;
    }
    try {
      const removed = store.removeNode(id, { force });
      if (!removed) {
        console.error(`no node #${id}`);
        return 1;
      }
      console.log(`-  removed ${fmtNode(removed).trim()}`);
      return 0;
    } catch (e) {
      if (e.code === "NODE_REFERENCED") {
        console.error(`${e.message}.\n   Re-run with --force to delete it and drop those lineage edges.`);
        return 1;
      }
      throw e;
    }
  }
  if (sub === "ls" || sub === undefined) {
    const nodes = store.listNodes();
    if (!nodes.length) {
      console.log("(no nodes yet — add some with `crossfade node add ...`)");
      return 0;
    }
    for (const role of ROLES) {
      const group = nodes.filter((n) => n.role === role);
      if (!group.length) continue;
      console.log(`${role}:`);
      for (const n of group) console.log(fmtNode(n));
    }
    return 0;
  }
  console.error(`unknown node subcommand: ${sub}`);
  return 1;
}

function cmdSample(store) {
  try {
    const c = sampleCombo(store);
    console.log("drew a combo:");
    console.log("  bands   :", c.seeds.map((n) => `${n.name} (${n.type})`).join(", "));
    console.log("  theme   :", c.themes.map((n) => n.name).join(", ") || "(none)");
    console.log("  vibes   :", c.vibes.map((n) => n.name).join(", ") || "(none)");
    console.log("  mutators:", c.mutators.map((n) => n.name).join(", ") || "(none)");
    console.log("  signature:", c.signature);
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return 0;
  }
  if (NOT_YET.has(cmd)) {
    console.error(`'${cmd}' is recognized but not yet implemented.`);
    return 2;
  }
  if (cmd !== "node" && cmd !== "sample") {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    return 1;
  }

  const store = openStore(config.dbPath);
  try {
    return cmd === "node" ? cmdNode(rest, store) : cmdSample(store);
  } finally {
    store.close();
  }
}

process.exit(main(process.argv.slice(2)));
