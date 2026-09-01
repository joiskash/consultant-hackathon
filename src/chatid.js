/**
 * Prints the chat id(s) your bot can message.
 * Requires TELEGRAM_BOT_TOKEN and that you have already sent the bot a message
 * (a bot cannot open a conversation with you first).
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN first:  TELEGRAM_BOT_TOKEN=... npm run chatid');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = await res.json();

if (!body.ok) {
  console.error(`Telegram rejected the token: ${body.description ?? res.status}`);
  process.exit(1);
}
if (!body.result?.length) {
  console.error('No messages yet. Open Telegram, send your bot any message, then re-run this.');
  process.exit(1);
}

const chats = new Map();
for (const u of body.result) {
  const c = u.message?.chat ?? u.channel_post?.chat;
  if (c) chats.set(c.id, [c.title, c.username, c.first_name].filter(Boolean).join(' ') || c.type);
}
console.log('\nTELEGRAM_CHAT_ID candidates:\n');
for (const [id, who] of chats) console.log(`  ${id}   (${who})`);
console.log('');
