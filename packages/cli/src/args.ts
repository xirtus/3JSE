// Tiny arg parser — `3jse <command> [--flag value] [--bool]`. No dependency.

export interface ParsedArgs {
  command: string | undefined;
  flags: Record<string, string>;
  bools: Set<string>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        bools.add(key);
      }
    } else {
      positional.push(a);
    }
  }
  return { command, flags, bools, positional };
}
