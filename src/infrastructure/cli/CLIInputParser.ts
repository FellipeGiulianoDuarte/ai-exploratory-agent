/**
 * Interface for parsed CLI options.
 */
export interface CLIOptions {
  url?: string;
  objective?: string;
  help?: boolean;
}

/**
 * Handles parsing and validation of command line arguments.
 * Replaces manual argv parsing with a structured approach.
 */
export class CLIInputParser {
  /**
   * Parse command line arguments.
   * @param args - Arguments array (usually process.argv.slice(2))
   */
  static parse(args: string[]): CLIOptions {
    const options: CLIOptions = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--help' || arg === '-h') {
        options.help = true;
        return options;
      }

      if (arg === '--url') {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          options.url = next;
          i++;
        }
      } else if (arg === '--objective') {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          options.objective = next;
          i++;
        }
      } else if (!arg.startsWith('-')) {
        // Positional argument usually interpreted as URL if not already set
        if (!options.url) {
          options.url = arg;
        }
      }
    }

    return options;
  }

  /**
   * Generate help text for the CLI.
   */
  static getHelpText(): string {
    return `
AI Exploratory Agent

Usage:
  npm start -- [options] [url]

Options:
  --url <url>          Target URL to explore (can also be provided as first positional argument)
  --objective <obj>    Specific objective for the exploration
  --help, -h           Show this help message

Examples:
  npm start -- https://example.com
  npm start -- --url https://example.com --objective "Find broken links"
`;
  }
}
