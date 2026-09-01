import { AmcClient } from './amc.js';
import { ParseBotSource } from './parsebot.js';
import { log } from './log.js';

/** Both sources expose the same surface, so callers never branch on which one. */
export function createSource(cfg) {
  if (cfg.source === 'amc') {
    log.info('data source: official AMC API');
    return new AmcClient(cfg.amcKey);
  }
  log.info('data source: Parse.bot');
  return new ParseBotSource(cfg.parseBotKey, { scraperId: cfg.parseBotScraperId });
}
