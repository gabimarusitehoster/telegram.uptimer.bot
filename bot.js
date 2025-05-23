const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

const bot = new Telegraf('7569185358:AAFx78AbFVPOSwSumNOugeDuCycCg2mdXB0'); // Replace with your bot token
const CREATOR_ID = 8095961856; // Replace with your Telegram user ID
const MAX_URLS = 3;

const REQUIRED_CHANNELS = [
  '@gabimarutechchannel',
  '@backuptelegramgabimaru'
];

const TASK_CHANNELS = ['@tgsclservice', '@gtechchanel'];

let users = {};
const dataFile = 'users.json';

if (fs.existsSync(dataFile)) {
  users = JSON.parse(fs.readFileSync(dataFile));
}

const saveUsers = () => fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));

// Express setup
const app = express();
app.get("/", (_, res) => res.send("Bot is alive."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Express server ready."));

// Self ping every 4.5 minutes
setInterval(() => {
  axios.get(`https://telegram-uptimer-bot.onrender.com`).catch(() => {});
}, 270000);

// Helper: Check if user joined all required channels
async function checkJoinedChannels(ctx, channels) {
  const userId = ctx.from.id;
  for (const channel of channels) {
    try {
      const res = await ctx.telegram.getChatMember(channel, userId);
      if (!res || ['left', 'kicked'].includes(res.status)) {
        return false;
      }
    } catch {
      // Ignore errors and continue
      return false;
    }
  }
  return true;
}

// /start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;

  // Check required channels
  const joinedRequired = await checkJoinedChannels(ctx, REQUIRED_CHANNELS);
  if (!joinedRequired) {
    return ctx.reply(
      `❗ You must join all required channels to use this bot:\n` +
      REQUIRED_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
      `\n\nAfter joining, please restart the bot with /start`
    );
  }

  // Check task channels
  const joinedTasks = await checkJoinedChannels(ctx, TASK_CHANNELS);
  if (!joinedTasks) {
    return ctx.reply(
      `❗ You must join all task channels to use this bot:\n` +
      TASK_CHANNELS.map(ch => `• ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
      `\n\nAfter joining, please restart the bot with /start`
    );
  }

  // Init user if new
  if (!users[userId]) {
    users[userId] = { urls: [], points: 0, lastDaily: 0 };
    saveUsers();
  }

  return ctx.reply(
    `👋 Welcome ${ctx.from.first_name}!\n\nUse the bot with these commands:\n\n` +
    `/add <url> - Add a new URL\n` +
    `/list - Show your added URLs\n` +
    `/remove <url> - Remove a URL\n` +
    `/tasks - Get tasks to earn extra slots\n` +
    `/taskdone - Confirm you joined tasks and earn slot\n` +
    `/daily - Claim daily bonus\n` +
    `/broadcast <msg> - (Creator only) Broadcast message\n` +
    `/start - Restart & see help\n\n` +
    `You can add up to ${MAX_URLS + users[userId].points} URLs.`
  );
});

// /add command
bot.command('add', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ Please provide a valid URL.');
  const url = args[1];

  if (!url.startsWith('http')) return ctx.reply('❌ Please provide a valid URL.');

  if (!users[userId]) users[userId] = { urls: [], points: 0, lastDaily: 0 };

  const userUrls = users[userId].urls;
  const urlLimit = MAX_URLS + users[userId].points;

  if (userUrls.length >= urlLimit) {
    return ctx.reply(`❌ You have reached your URL limit. Do tasks to earn more slots.`);
  }

  if (userUrls.includes(url)) return ctx.reply('❗ This URL is already added.');

  users[userId].urls.push(url);
  saveUsers();
  return ctx.reply(`✅ URL added. You now have ${userUrls.length}/${urlLimit} URLs.`);
});

// /list command
bot.command('list', (ctx) => {
  const userId = ctx.from.id;
  if (userId === CREATOR_ID) {
    const all = Object.entries(users).flatMap(([uid, { urls }]) =>
      urls.map((u) => `User ${uid}: ${u}`)
    );
    return ctx.reply(all.length ? all.join('\n') : 'No URLs found.');
  }

  const userUrls = users[userId]?.urls || [];
  if (!userUrls.length) return ctx.reply('❌ You have no URLs.');
  return ctx.reply(`Your URLs:\n${userUrls.join('\n')}`);
});

// /remove command
bot.command('remove', (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ Provide a URL to remove.');
  const url = args[1];

  const userUrls = users[userId]?.urls || [];
  if (!userUrls.includes(url)) return ctx.reply('❌ URL not found in your list.');

  users[userId].urls = userUrls.filter(u => u !== url);
  saveUsers();
  return ctx.reply('✅ URL removed.');
});

// /tasks command without buttons
bot.command('tasks', (ctx) => {
  const tasksText = `Complete these tasks to earn 1 extra URL slot:\n\n` +
    TASK_CHANNELS.map(ch => `• Join ${ch}: https://t.me/${ch.slice(1)}`).join('\n') +
    `\n\nAfter joining, send /taskdone to claim your slot.`;

  ctx.reply(tasksText);
});

// /taskdone command to claim slot
bot.command('taskdone', (ctx) => {
  const userId = ctx.from.id;
  if (!users[userId]) users[userId] = { urls: [], points: 0, lastDaily: 0 };

  users[userId].points += 1;
  saveUsers();
  ctx.reply(`🎉 Slot added! You now have ${MAX_URLS + users[userId].points} slots.`);
});

// /daily command with 24-hour cooldown
bot.command('daily', (ctx) => {
  const userId = ctx.from.id;
  const now = Date.now();

  if (!users[userId]) users[userId] = { urls: [], points: 0, lastDaily: 0 };

  const lastDaily = users[userId].lastDaily || 0;
  if (now - lastDaily < 24 * 60 * 60 * 1000) {
    const diff = 24 * 60 * 60 * 1000 - (now - lastDaily);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return ctx.reply(`⏳ You already claimed your daily bonus. Try again in ${hours}h ${minutes}m.`);
  }

  users[userId].points += 1;
  users[userId].lastDaily = now;
  saveUsers();
  return ctx.reply(`🎉 Daily bonus claimed! You now have ${MAX_URLS + users[userId].points} slots.`);
});

// /broadcast command (creator only)
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== CREATOR_ID) return ctx.reply('❌ You are not authorized to use this command.');

  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply('❌ Please provide a message to broadcast.');

  let count = 0;
  for (const userId of Object.keys(users)) {
    try {
      await ctx.telegram.sendMessage(userId, `📢 Broadcast:\n\n${text}`);
      count++;
    } catch {
      // Ignore errors
    }
  }
  ctx.reply(`✅ Broadcast sent to ${count} users.`);
});

// Self ping user URLs every 5 minutes to keep alive
setInterval(() => {
  Object.values(users).forEach(({ urls }) => {
    urls.forEach(url => {
      axios.get(url).catch(() => {});
    });
  });
}, 5 * 60 * 1000);

bot.launch();
