import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// Initialise once; marked-terminal handles ANSI colouring
marked.setOptions({
  renderer: new TerminalRenderer() as unknown as Parameters<
    typeof marked.setOptions
  >[0]["renderer"],
});

/**
 * Render markdown text to an ANSI-escaped string suitable for Ink's <Text>.
 * Falls back to raw text on any error.
 */
export function renderMarkdown(text: string): string {
  try {
    const result = marked(text);
    // marked() returns string | Promise<string> depending on version; handle both
    if (typeof result === "string") {
      return result.trimEnd();
    }
    return text;
  } catch {
    return text;
  }
}
