const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

const bot = new Telegraf('8102472940:AAEVvK-SV0e56QoSeq8lWlNs-cN6I-BdZMs'); // Replace with your bot token
const CREATOR_ID = 8095961856; // Replace with your Telegram user ID
const MAX_URLS = 3;
const REQUIRED_CHANNELS = [
  '@gabimarutechchannel',
  '@tgsclservice',
  '@gtechchanel',
  '@iwilldecidelater',
  '@iwilldecidelater'
];

let users = {};
const dataFile = 'users.json';

if (fs.existsSync(dataFile)) {
  users = JSON.parse(fs.readFileSync(dataFile));
}

// Helper to save users
const saveUsers = () => fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));

// Middleware to check if user is subscribed to all channels
const checkSubscriptions = async (ctx, next) => {
  for (const channel of REQUIRED_CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(channel, ctx.from.id);
      if (['left', 'kicked'].includes(res.status)) {
        return ctx.reply(
          `❗ You must join all required channels to use this bot.`,
          {
            reply_markup: {
              inline_keyboard: [
                REQUIRED_CHANNELS.map((ch) => [{ text: `Join ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }]),
                [{ text: '✅ I Have Joined', callback_data: 'check_join' }]
              ]
            }
          }
        );
      }
    } catch {
      continue;
    }
  }
  return next();
};

// Set up express server to keep bot alive
const app = express();
app.get("/", (_, res) => res.send("Bot is alive."));
app.listen(process.env.PORT || 3000, () => console.log("Express server ready."));

bot.start(checkSubscriptions, async (ctx) => {
  const userId = ctx.from.id;
  if (!users[userId]) {
    users[userId] = { urls: [], points: 0 };
    saveUsers();
  }
  return ctx.reply(`Welcome ${ctx.from.first_name}! Use /add <url> to start.`);
});

bot.action('check_join', (ctx) => {
  ctx.answerCbQuery();
  return ctx.reply('✅ Re-run your command now.');
});

// Add URL
bot.command('add', checkSubscriptions, (ctx) => {
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

// List URLs
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

// Remove URL
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

// Task menu
bot.command('tasks', (ctx) => {
  return ctx.reply(
    'Complete these tasks to earn more slots:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Join @taskchannel1', url: 'https://t.me/taskchannel1' },
            { text: 'Join @taskchannel2', url: 'https://t.me/taskchannel2' }
          ],
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

// Ping URLs every 5 minutes
setInterval(() => {
  Object.values(users).forEach(({ urls }) => {
    urls.forEach(url => {
      axios.get(url).catch(() => {});
    });
  });
}, 5 * 60 * 1000);

bot.launch();
