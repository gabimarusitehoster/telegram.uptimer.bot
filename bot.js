const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

// ==== CONFIG ====
const BOT_TOKEN = '7569185358:AAFx78AbFVPOSwSumNOugeDuCycCg2mdXB0'; // Your Bot Token
const CREATOR_ID = 8095961856; // Your Telegram ID
const MAX_URLS = 3;

const REQUIRED_CHANNELS = ['@gabimarutechchannel', '@backuptelegramgabimaru'];
const TASK_CHANNELS = ['@tgsclservice', '@gtechchanel'];

const DATA_FILE = 'users.json';
let users = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : {};

const saveUsers = () => fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));

const bot = new Telegraf(BOT_TOKEN);

// ==== EXPRESS KEEP-ALIVE ====
const app = express();
app.get('/', (_, res) => res.send('Bot is running.'));
app.listen(process.env.PORT || 3000);

// Self-ping to keep bot alive (every 4.5 minutes)
setInterval(() => {
  axios.get('https://telegram-uptimer-bot.onrender.com').catch(() => {});
}, 270000);

// ==== HELPERS ====

async function checkJoinedChannels(ctx, channels) {
  for (const ch of channels) {
    try {
      const res = await ctx.telegram.getChatMember(ch, ctx.from.id);
      if (!res || ['left', 'kicked'].includes(res.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function getUser(id) {
  if (!users[id]) {
    users[id] = { urls: [], points: 0, lastDaily: 0 };
    saveUsers();
  }
  return users[id];
}

// ==== COMMANDS ====

bot.start(async (ctx) => {
  const id = ctx.from.id;

  const joinedRequired = await checkJoinedChannels(ctx, REQUIRED_CHANNELS);
  if (!joinedRequired) {
    return ctx.reply(
      `❗ *You must join all required channels:*\n\n` +
      REQUIRED_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
      `\n\nAfter joining, send /start`,
      { parse_mode: 'Markdown' }
    );
  }

  const joinedTasks = await checkJoinedChannels(ctx, TASK_CHANNELS);
  if (!joinedTasks) {
    return ctx.reply(
      `❗ *You must also join task channels:*\n\n` +
      TASK_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
      `\n\nAfter joining, send /start`,
      { parse_mode: 'Markdown' }
    );
  }

  getUser(id); // Ensure user is initialized

  ctx.reply(
    `👋 Welcome *${ctx.from.first_name}*!\n\n` +
    `Use the bot with the commands below:\n\n` +
    `• /add <url> – Add a new URL\n` +
    `• /list – Show your URLs\n` +
    `• /remove <url> – Delete a URL\n` +
    `• /tasks – Join channels to earn slots\n` +
    `• /taskdone – Claim extra slot after joining\n` +
    `• /daily – Get daily bonus slot\n` +
    `• /broadcast <msg> – Admin broadcast\n\n` +
    `You can add up to *${MAX_URLS + users[id].points}* URLs.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('add', (ctx) => {
  const args = ctx.message.text.split(' ');
  const url = args[1];
  const user = getUser(ctx.from.id);

  if (!url || !url.startsWith('http')) return ctx.reply('❌ Please provide a valid URL.');

  const limit = MAX_URLS + user.points;
  if (user.urls.length >= limit) return ctx.reply(`❌ Limit reached. Do /tasks to earn more slots.`);
  if (user.urls.includes(url)) return ctx.reply('⚠️ This URL is already added.');

  user.urls.push(url);
  saveUsers();
  ctx.reply(`✅ URL added. You now have ${user.urls.length}/${limit} URLs.`);
});

bot.command('list', (ctx) => {
  const id = ctx.from.id;
  const user = getUser(id);

  if (id === CREATOR_ID) {
    let all = Object.entries(users).flatMap(([uid, u]) => u.urls.map(url => `User ${uid}: ${url}`));
    return ctx.reply(all.length ? all.join('\n') : 'No URLs in system.');
  }

  if (!user.urls.length) return ctx.reply('❌ You have no URLs.');
  ctx.reply(`Your URLs:\n${user.urls.join('\n')}`);
});

bot.command('remove', (ctx) => {
  const args = ctx.message.text.split(' ');
  const url = args[1];
  const user = getUser(ctx.from.id);

  if (!url || !user.urls.includes(url)) return ctx.reply('❌ URL not found.');

  user.urls = user.urls.filter(u => u !== url);
  saveUsers();
  ctx.reply('✅ URL removed.');
});

bot.command('tasks', (ctx) => {
  ctx.reply(
    `📋 *Join these task channels to earn 1 extra slot:*\n\n` +
    TASK_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
    `\n\nThen send /taskdone to claim.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('taskdone', async (ctx) => {
  const id = ctx.from.id;
  const user = getUser(id);

  const joined = await checkJoinedChannels(ctx, TASK_CHANNELS);
  if (!joined) {
    return ctx.reply(
      `❌ You haven’t joined all task channels yet.\n\nJoin first:\n` +
      TASK_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n'),
      { parse_mode: 'Markdown' }
    );
  }

  user.points += 1;
  saveUsers();

  ctx.reply(`🎉 Verified! Extra slot awarded. You now have ${MAX_URLS + user.points} total slots.`);
});

bot.command('daily', (ctx) => {
  const user = getUser(ctx.from.id);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (now - user.lastDaily < oneDay) {
    const timeLeft = oneDay - (now - user.lastDaily);
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    return ctx.reply(`⏳ Try again in ${hours}h ${minutes}m.`);
  }

  user.points += 1;
  user.lastDaily = now;
  saveUsers();

  ctx.reply(`✅ Daily bonus claimed! You now have ${MAX_URLS + user.points} total slots.`);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== CREATOR_ID) return ctx.reply('❌ You are not allowed.');

  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply('❌ Provide message text.');

  let sent = 0;
  for (const uid of Object.keys(users)) {
    try {
      await ctx.telegram.sendMessage(uid, `📢 *Broadcast:*\n\n${text}`, { parse_mode: 'Markdown' });
      sent++;
    } catch { }
  }

  ctx.reply(`✅ Broadcast sent to ${sent} users.`);
});

// ==== PING LOGIC ====
setInterval(() => {
  Object.values(users).forEach(({ urls }) => {
    urls.forEach(url => {
      axios.get(url).catch(() => {});
    });
  });
}, 5 * 60 * 1000); // 5 mins

bot.launch();
