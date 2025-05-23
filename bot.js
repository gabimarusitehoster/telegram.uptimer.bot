const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

const bot = new Telegraf('8102472940:AAEVvK-SV0e56QoSeq8lWlNs-cN6I-BdZMs'); // Replace with your bot token
const CREATOR_ID = 8095961856; // Replace with your Telegram user ID
const MAX_URLS = 3;

const REQUIRED_CHANNELS = [
  '@gabimarutechchannel',
  '@iwilldecidelater'
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

// Telegram Bot

bot.start(async (ctx) => {
  const userId = ctx.from.id;

  // Check required channels
  for (const channel of REQUIRED_CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(channel, userId);
      if (!res || ['left', 'kicked'].includes(res.status)) {
        return ctx.reply(
          `❗ You must join all required channels to use this bot.`,
          {
            reply_markup: {
              inline_keyboard: [
                REQUIRED_CHANNELS.map((ch) => [{ text: `Join ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }]),
                [{ text: '✅ I Have Joined', callback_data: 'check_join_start' }]
              ]
            }
          }
        );
      }
    } catch {
      continue;
    }
  }

  // Check task channels
  for (const channel of TASK_CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(channel, userId);
      if (!res || ['left', 'kicked'].includes(res.status)) {
        return ctx.reply(
          `❗ You must also join the task channels to use this bot.`,
          {
            reply_markup: {
              inline_keyboard: [
                TASK_CHANNELS.map((ch) => [{ text: `Join ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }]),
                [{ text: '✅ I Have Joined Tasks', callback_data: 'check_join_start' }]
              ]
            }
          }
        );
      }
    } catch {
      continue;
    }
  }

  // Init user if new
  if (!users[userId]) {
    users[userId] = { urls: [], points: 0 };
    saveUsers();
  }

  return ctx.reply(
    `👋 Welcome ${ctx.from.first_name}!\n\nUse the bot with these commands:\n\n` +
    `/add <url> - Add a new URL\n` +
    `/list - Show your added URLs\n` +
    `/remove <url> - Remove a URL\n` +
    `/tasks - Do tasks to earn extra slots\n` +
    `/start - Restart & see help\n\n` +
    `You can add up to ${MAX_URLS + users[userId].points} URLs.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: 'Join Support Channel', url: 'https://t.me/gabimarutechchannel' }]]
      }
    }
  );
});

bot.action('check_join_start', (ctx) => {
  ctx.answerCbQuery();
  return ctx.reply('✅ Re-run your command now.');
});

bot.command('add', async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.split(' ')[1];
  if (!url || !url.startsWith('http')) return ctx.reply('❌ Please provide a valid URL.');

  if (!users[userId]) users[userId] = { urls: [], points: 0 };

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

bot.command('remove', (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.split(' ')[1];
  if (!url) return ctx.reply('❌ Provide a URL to remove.');

  const userUrls = users[userId]?.urls || [];
  if (!userUrls.includes(url)) return ctx.reply('❌ URL not found in your list.');

  users[userId].urls = userUrls.filter(u => u !== url);
  saveUsers();
  return ctx.reply('✅ URL removed.');
});

bot.command('tasks', (ctx) => {
  return ctx.reply(
    'Complete these tasks to earn more slots:',
    {
      reply_markup: {
        inline_keyboard: [
          TASK_CHANNELS.map((ch) => [{ text: `Join ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }]),
          [{ text: '✅ I Joined', callback_data: 'task_done' }]
        ]
      }
    }
  );
});

bot.action('task_done', (ctx) => {
  const userId = ctx.from.id;
  if (!users[userId]) users[userId] = { urls: [], points: 0 };

  users[userId].points += 1;
  saveUsers();
  ctx.answerCbQuery('✅ You earned +1 URL slot!');
  return ctx.reply(`🎉 Great! You now have ${MAX_URLS + users[userId].points} URL slots.`);
});

// Keep pinging user URLs
setInterval(() => {
  Object.values(users).forEach(({ urls }) => {
    urls.forEach(url => {
      axios.get(url).catch(() => {});
    });
  });
}, 5 * 60 * 1000);

bot.launch();
