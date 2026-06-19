#!/usr/bin/env node
// crossfade CLI entrypoint.
//
// This is the v1 command surface (R17). Subcommands are wired up incrementally
// by later implementation units (nodes in U3/U9, burst in U8, ask/chat in U9,
// rate/lineage in U9). For now the skeleton recognizes each verb, prints help,
// and exits with a distinct code for "not yet implemented" so the surface is
// testable before the engine lands.

const COMMANDS = {
  node: 'node add <band|style|theme> <name> | node ls   — manage inspiration nodes',
  burst: 'burst <n> [--plan]                              — generate n songs (budget-gated)',
  ask: 'ask "<what-if prompt>"                           — directed combo via the DJ',
  chat: 'chat "<message>"                                — steer the DJ in conversation',
  rate: 'rate <song> up|down [--note "..."]              — rate a song',
  lineage: 'lineage <song|node>                            — show inspiration lineage',
};

function help() {
  console.log('crossfade — a personal Suno radio station\n');
  console.log('Usage: crossfade <command> [args]\n');
  console.log('Commands:');
  for (const line of Object.values(COMMANDS)) console.log('  ' + line);
}

function main(argv) {
  const [cmd] = argv;

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    help();
    return 0;
  }

  if (!Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
    console.error(`Unknown command: ${cmd}\n`);
    help();
    return 1;
  }

  // Recognized verb, but the engine for it ships in a later unit.
  console.error(`'${cmd}' is recognized but not yet implemented.`);
  return 2;
}

process.exit(main(process.argv.slice(2)));
