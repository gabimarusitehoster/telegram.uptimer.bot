const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

const bot = new Telegraf('7404042012:AAG6UkZeQQXNN00ZnzYAkicU37vxwP9_jZQ'); // Replace with your bot token
const CREATOR_ID = 8095961856; // Replace with your Telegram user ID
const MAX_URLS = 3;
const DATA_FILE = 'users.json';

const REQUIRED_CHANNELS = ['@gabimarutechchannel', '@backuptelegramgabimaru'];
const TASK_CHANNELS = ['@tgsclservice', '@gtechchanel'];

let users = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : {};

const saveUsers = () => fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));

// Express Server to keep bot alive on Render
const app = express();
app.get("/", (_, res) => res.send("Bot is running."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Self-ping to prevent Render from sleeping
setInterval(() => {
  axios.get("https://YOUR_RENDER_DOMAIN_HERE").catch(() => {});
}, 270000); // 4.5 minutes

// Check if user is in all channels
async function hasJoinedAllChannels(ctx, userId, channels) {
  for (const channel of channels) {
    try {
      const res = await ctx.telegram.getChatMember(channel, userId);
      if (!res || ['left', 'kicked'].includes(res.status)) return false;
    } catch {
      continue;
    }
  }
  return true;
}

bot.start(async (ctx) => {
  const userId = ctx.from.id;

  if (!(await hasJoinedAllChannels(ctx, userId, REQUIRED_CHANNELS))) {
    return ctx.reply(
      `❗ You must join all required channels to use this bot:\n\n${REQUIRED_CHANNELS.map(c => `- ${c}`).join('\n')}`
    );
  }

  if (!(await hasJoinedAllChannels(ctx, userId, TASK_CHANNELS))) {
    return ctx.reply(
      `❗ You must join the task channels as well:\n\n${TASK_CHANNELS.map(c => `- ${c}`).join('\n')}`
    );
  }

  if (!users[userId]) {
    users[userId] = { urls: [], points: 0, lastDaily: 0 };
    saveUsers();
  }

  return ctx.reply(
    `👋 Welcome ${ctx.from.first_name}!\n\nUse the bot with these commands:\n\n` +
    `/add <url> - Add a new URL\n` +
    `/list - Show your added URLs\n` +
    `/remove <url> - Remove a URL\n` +
    `/tasks - Join channels to earn more slots\n` +
    `/daily - Claim a daily +1 slot\n` +
    `/broadcast <text> - (Admin only)\n\n` +
    `You can add up to ${MAX_URLS + users[userId].points} URLs.`
  );
});

bot.command('add', (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.split(' ')[1];

  if (!url || !url.startsWith('http')) return ctx.reply('❌ Please provide a valid URL.');
  if (!users[userId]) users[userId] = { urls: [], points: 0 };

  const user = users[userId];
  const limit = MAX_URLS + user.points;

  if (user.urls.length >= limit) return ctx.reply('❌ You have reached your URL limit. Do tasks to earn more slots.');
  if (user.urls.includes(url)) return ctx.reply('❗ This URL is already added.');

  user.urls.push(url);
  saveUsers();
  return ctx.reply(`✅ URL added. You now have ${user.urls.length}/${limit} URLs.`);
});

bot.command('list', (ctx) => {
  const userId = ctx.from.id;

  if (userId === CREATOR_ID) {
    const all = Object.entries(users).flatMap(([uid, u]) => u.urls.map(url => `User ${uid}: ${url}`));
    return ctx.reply(all.length ? all.join('\n') : 'No URLs found.');
  }

  const userUrls = users[userId]?.urls || [];
  return ctx.reply(userUrls.length ? `Your URLs:\n${userUrls.join('\n')}` : '❌ You have no URLs.');
});

bot.command('remove', (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.split(' ')[1];
  const user = users[userId];

  if (!url || !user?.urls.includes(url)) return ctx.reply('❌ URL not found.');
  user.urls = user.urls.filter(u => u !== url);
  saveUsers();
  return ctx.reply('✅ URL removed.');
});

bot.command('tasks', (ctx) => {
  return ctx.reply(
    `Complete these tasks to earn +1 slot:\n\n${TASK_CHANNELS.map(c => `- Join ${c}`).join('\n')}\n\nThen use /taskdone`
  );
});

bot.command('taskdone', async (ctx) => {
  const userId = ctx.from.id;

  if (!(await hasJoinedAllChannels(ctx, userId, TASK_CHANNELS))) {
    return ctx.reply('❌ You haven’t joined all task channels. Please join them first.');
  }

  if (!users[userId]) users[userId] = { urls: [], points: 0, lastDaily: 0 };
  users[userId].points += 1;
  saveUsers();
  return ctx.reply(`✅ Task completed! You now have ${MAX_URLS + users[userId].points} URL slots.`);
});

bot.command('daily', (ctx) => {
  const userId = ctx.from.id;
  const now = Date.now();
  const user = users[userId] || (users[userId] = { urls: [], points: 0, lastDaily: 0 });

  if (now - user.lastDaily < 24 * 60 * 60 * 1000) {
    const remaining = 24 * 60 * 60 * 1000 - (now - user.lastDaily);
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return ctx.reply(`⏳ You can claim again in ${hours}h ${minutes}m.`);
  }

  user.points += 1;
  user.lastDaily = now;
  saveUsers();
  return ctx.reply(`✅ You claimed your daily reward! Total slots: ${MAX_URLS + user.points}`);
});

bot.command('broadcast', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.replace('/broadcast', '').trim();

  if (userId !== CREATOR_ID) return ctx.reply('❌ You are not authorized.');
  if (!text) return ctx.reply('❗ Please provide a message to broadcast.');

  Object.keys(users).forEach((id) => {
    bot.telegram.sendMessage(id, `📢 Broadcast:\n\n${text}`).catch(() => {});
  });

  return ctx.reply('✅ Broadcast sent.');
});

// Ping each user's URL every 5 minutes
setInterval(() => {
  Object.values(users).forEach(({ urls }) => {
    urls.forEach(url => {
      axios.get(url).catch(() => {});
    });
  });
}, 5 * 60 * 1000);

bot.launch();
