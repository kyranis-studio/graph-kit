import { Colors, color } from './colors.ts';

export async function loadEnv(path = '.env'): Promise<void> {
  try {
    const content = await Deno.readTextFile(path);
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;

      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      Deno.env.set(key, value);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.warn(color(`Warning: ${path} file not found`, Colors.gold));
    } else {
      throw error;
    }
  }
}
