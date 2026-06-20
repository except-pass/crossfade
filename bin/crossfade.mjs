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
  node add seed <band|album|theme> "<name>"   add a seed inspiration
  node add vibe "<name>"                       add a vibe (affect/color)
  node add mutator "<name>"                    add a mutator (operation applied last)
  node ls                                       list all nodes by role
  sample                                        draw a combo from the graph (no generation)
  burst <n> [--plan]                            generate n songs        (not yet)
  ask "<what-if>"                               directed combo via DJ   (not yet)
  chat "<message>"                              steer the DJ            (not yet)
  rate <song> up|down [--note "..."]            rate a song             (not yet)
  lineage <song|node>                           show inspiration lineage (not yet)
`;

const NOT_YET = new Set(["burst", "ask", "chat", "rate", "lineage"]);

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
    const hasSubtype = role === "seed";
    const type = hasSubtype ? args[2] : role;
    const name = args.slice(hasSubtype ? 3 : 2).join(" ").trim();
    if (hasSubtype && !type) {
      console.error('seed needs a sub-type: node add seed <band|album|theme> "<name>"');
      return 1;
    }
    if (!name) {
      console.error("a name is required");
      return 1;
    }
    try {
      const node = store.addNode(role, type, name);
      console.log(`+ ${fmtNode(node).trim()}`);
      return 0;
    } catch (e) {
      console.error(e.message);
      return 1;
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
