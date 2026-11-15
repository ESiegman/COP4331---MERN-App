import { notImplemented } from '../lib/errors.js';

// AI API from the use case diagram.

/**
 * Asks a language model for a starter list of things to rank, for example
 * suggestItemNames('fast food chains', 10) -> ['McDonald's', 'Wendy's', ...].
 *
 * TODO: choose a provider and call it with fetch() or its SDK. Ask for JSON output, then
 * trim, de-duplicate and cap the names at `count` before returning them. Treat the topic as
 * untrusted text: it goes into the prompt as data, never as instructions.
 */
export async function suggestItemNames(topic, count) {
  throw notImplemented('integrations/ai.suggestItemNames');
}
