const { Telegraf, Scenes, session, Markup } = require('telegraf');
const fs = require('fs');
const axios = require('axios');

// Constants
const USER_DATA_FILE = 'user_data.json';
const DEFAULT_ETH = 10000;
const PRICE_CHECK_INTERVAL = 10000; // Check price every 10 seconds

// Bot initialization
require('dotenv').config();


const bot = new Telegraf(process.env.BOT_TOKEN);

// const bot = new Telegraf(process.env.BOT_TOKEN || '7995534686:AAGU1WUObXeRlk0b8RqVoqj9Ty_H8ZXQJuI');

// Enable logging
bot.use((ctx, next) => {
  const start = new Date();
  console.log(`[${start.toISOString()}] Processing update ${ctx.update.update_id}`);
  return next().then(() => {
    const ms = new Date() - start;
    console.log(`[${start.toISOString()}] Response time ${ms}ms`);
  });
});

// Load user data
function loadUserData() {
  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      const data = fs.readFileSync(USER_DATA_FILE);
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
  return {};
}

// Save user data
function saveUserData(data) {
  try {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Get current ETH price
async function getEthPrice() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    return response.data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return 2500; // Fallback price if API fails
  }
}

// Utility to format numbers
function formatNumber(num, decimals = 2) {
  return parseFloat(num).toFixed(decimals);
}

// Create buy scene
const buyScene = new Scenes.BaseScene('buy');

buyScene.enter(async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    ctx.reply('Please use /start to initialize your account.');
    return ctx.scene.leave();
  }
  
  const ethPrice = await getEthPrice();
  const usdBalance = userData[userId].usd_balance;
  
  ctx.reply(
    `Current ETH Price: $${ethPrice}\n` +
    `Your USD Balance: $${formatNumber(usdBalance)}\n\n` +
    `How much USD do you want to spend on ETH? Enter the USD amount:`
  );
});

buyScene.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  try {
    const usdAmount = parseFloat(ctx.message.text);
    if (isNaN(usdAmount) || usdAmount <= 0) {
      return ctx.reply('Please enter a positive number.');
    }
    
    const usdBalance = userData[userId].usd_balance;
    
    if (usdAmount > usdBalance) {
      ctx.reply(`You don't have enough USD. Your balance is $${formatNumber(usdBalance)}.`);
      return ctx.scene.leave();
    }
    
    const ethPrice = await getEthPrice();
    const ethAmount = usdAmount / ethPrice;
    
    // Update balances
    userData[userId].usd_balance -= usdAmount;
    userData[userId].eth_balance += ethAmount;
    
    // Record transaction
    userData[userId].transactions.push({
      type: 'BUY',
      amount: ethAmount,
      price: ethPrice,
      usd_amount: usdAmount,
      date: new Date().toISOString()
    });
    
    saveUserData(userData);
    
    ctx.reply(
      `Transaction Successful!\n\n` +
      `Bought: ${formatNumber(ethAmount, 4)} ETH\n` +
      `Price: $${ethPrice}\n` +
      `Total: $${formatNumber(usdAmount)}\n\n` +
      `New ETH Balance: ${formatNumber(userData[userId].eth_balance, 4)} ETH\n` +
      `New USD Balance: $${formatNumber(userData[userId].usd_balance)}`
    );
    
    ctx.scene.leave();
  } catch (error) {
    console.error('Error processing buy:', error);
    ctx.reply('An error occurred. Please try again.');
    ctx.scene.leave();
  }
});

// Create sell scene
const sellScene = new Scenes.BaseScene('sell');

sellScene.enter(async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    ctx.reply('Please use /start to initialize your account.');
    return ctx.scene.leave();
  }
  
  const ethPrice = await getEthPrice();
  const ethBalance = userData[userId].eth_balance;
  
  ctx.reply(
    `Current ETH Price: $${ethPrice}\n` +
    `Your ETH Balance: ${formatNumber(ethBalance, 4)} ETH\n\n` +
    `How much ETH do you want to sell? Enter the ETH amount:`
  );
});

sellScene.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  try {
    const ethAmount = parseFloat(ctx.message.text);
    if (isNaN(ethAmount) || ethAmount <= 0) {
      return ctx.reply('Please enter a positive number.');
    }
    
    const ethBalance = userData[userId].eth_balance;
    
    if (ethAmount > ethBalance) {
      ctx.reply(`You don't have enough ETH. Your balance is ${formatNumber(ethBalance, 4)} ETH.`);
      return ctx.scene.leave();
    }
    
    const ethPrice = await getEthPrice();
    const usdAmount = ethAmount * ethPrice;
    
    // Update balances
    userData[userId].eth_balance -= ethAmount;
    userData[userId].usd_balance += usdAmount;
    
    // Record transaction
    userData[userId].transactions.push({
      type: 'SELL',
      amount: ethAmount,
      price: ethPrice,
      usd_amount: usdAmount,
      date: new Date().toISOString()
    });
    
    saveUserData(userData);
    
    ctx.reply(
      `Transaction Successful!\n\n` +
      `Sold: ${formatNumber(ethAmount, 4)} ETH\n` +
      `Price: $${ethPrice}\n` +
      `Total: $${formatNumber(usdAmount)}\n\n` +
      `New ETH Balance: ${formatNumber(userData[userId].eth_balance, 4)} ETH\n` +
      `New USD Balance: $${formatNumber(userData[userId].usd_balance)}`
    );
    
    ctx.scene.leave();
  } catch (error) {
    console.error('Error processing sell:', error);
    ctx.reply('An error occurred. Please try again.');
    ctx.scene.leave();
  }
});

// Set up scene management
const stage = new Scenes.Stage([buyScene, sellScene]);
bot.use(session());
bot.use(stage.middleware());

// Command handlers
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    userData[userId] = {
      eth_balance: DEFAULT_ETH,
      usd_balance: 0,
      transactions: []
    };
    saveUserData(userData);
  }
  
  ctx.reply(
    `Welcome to ETH Trading Simulator Bot!\n\n` +
    `You have been credited with ${DEFAULT_ETH} ETH to start trading.\n\n` +
    
    `Use /balance to check your balance\n` +
    `Use /buy to buy ETH with USD\n` +
    `Use /sell to sell ETH for USD\n` +
    `Use /price to check current ETH price\n` +
    `Use /history to view your transaction history\n` +
    `Use /autotrade to set up automated trading`
  );
});

bot.command('balance', async (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    return ctx.reply('Please use /start to initialize your account.');
  }
  
  const ethBalance = userData[userId].eth_balance;
  const usdBalance = userData[userId].usd_balance;
  const ethPrice = await getEthPrice();
  
  const totalValueUsd = ethBalance * ethPrice + usdBalance;
  
  ctx.reply(
    `📊 Your Balance:\n\n` +
    `ETH: ${formatNumber(ethBalance, 4)} ETH\n` +
    `USD: $${formatNumber(usdBalance)}\n\n` +
    `Current ETH Price: $${ethPrice}\n` +
    `Total Portfolio Value: $${formatNumber(totalValueUsd)}`
  );
});

bot.command('price', async (ctx) => {
  const ethPrice = await getEthPrice();
  ctx.reply(`Current ETH Price: $${ethPrice}`);
});

bot.command('history', (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId] || userData[userId].transactions.length === 0) {
    return ctx.reply('You have no transaction history yet.');
  }
  
  const transactions = userData[userId].transactions.slice(-10); // Get last 10 transactions
  
  let historyText = '📜 Your Last 10 Transactions:\n\n';
  transactions.forEach(tx => {
    const date = new Date(tx.date).toLocaleString();
    historyText += `${date} - ${tx.type}: ${formatNumber(tx.amount, 4)} ETH at $${tx.price} ($${formatNumber(tx.usd_amount)})\n\n`;
  });
  
  ctx.reply(historyText);
});

bot.command('buy', (ctx) => ctx.scene.enter('buy'));
bot.command('sell', (ctx) => ctx.scene.enter('sell'));

bot.command('donate', (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    return ctx.reply('Please use /start to initialize your account.');
  }
  
  ctx.reply(
    'What would you like to add to your account?',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('1000 ETH', 'donate_eth_1000'),
        Markup.button.callback('5000 ETH', 'donate_eth_5000')
      ],
      [
        Markup.button.callback('$10,000 USD', 'donate_usd_10000'),
        Markup.button.callback('$50,000 USD', 'donate_usd_50000')
      ]
    ])
  );
});

// Handle callback queries for donations
bot.action(/donate_eth_(\d+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    return ctx.reply('Please use /start to initialize your account.');
  }
  
  const amount = parseInt(ctx.match[1]);
  userData[userId].eth_balance += amount;
  saveUserData(userData);
  
  ctx.editMessageText(`Added ${amount} ETH to your account! Use /balance to check your new balance.`);
});

bot.action(/donate_usd_(\d+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    return ctx.reply('Please use /start to initialize your account.');
  }
  
  const amount = parseInt(ctx.match[1]);
  userData[userId].usd_balance += amount;
  saveUserData(userData);
  
  ctx.editMessageText(`Added $${amount} to your account! Use /balance to check your new balance.`);
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred while processing your request.');
});

// Auto-Trading System
// Store users' auto-trading configurations
const autoTradingConfigs = {};

// Function to process auto trades for a user
async function processAutoTrades(userId, userData, currentPrice) {
  const config = autoTradingConfigs[userId];
  if (!config || !config.enabled) return;

  const { buyAt, sellAt, tradeAmount, chatId } = config;
  let madeTransaction = false;

  // Process buy orders
  if (buyAt && currentPrice <= buyAt && userData.usd_balance >= tradeAmount) {
    const ethAmount = tradeAmount / currentPrice;
    
    // Update balances
    userData.usd_balance -= tradeAmount;
    userData.eth_balance += ethAmount;
    
    // Record transaction
    userData.transactions.push({
      type: 'AUTO_BUY',
      amount: ethAmount,
      price: currentPrice,
      usd_amount: tradeAmount,
      date: new Date().toISOString()
    });
    
    madeTransaction = true;
    
    // Notify user
    bot.telegram.sendMessage(
      chatId,
      `🤖 Auto-Trade Executed!\n\n` +
      `Bought: ${formatNumber(ethAmount, 4)} ETH\n` +
      `Price: ${currentPrice}\n` +
      `Total: ${formatNumber(tradeAmount)}\n\n` +
      `New ETH Balance: ${formatNumber(userData.eth_balance, 4)} ETH\n` +
      `New USD Balance: ${formatNumber(userData.usd_balance)}`
    );
  }
  
  // Process sell orders
  if (sellAt && currentPrice >= sellAt && userData.eth_balance >= config.ethAmount) {
    const usdAmount = config.ethAmount * currentPrice;
    
    // Update balances
    userData.eth_balance -= config.ethAmount;
    userData.usd_balance += usdAmount;
    
    // Record transaction
    userData.transactions.push({
      type: 'AUTO_SELL',
      amount: config.ethAmount,
      price: currentPrice,
      usd_amount: usdAmount,
      date: new Date().toISOString()
    });
    
    madeTransaction = true;
    
    // Notify user
    bot.telegram.sendMessage(
      chatId,
      `🤖 Auto-Trade Executed!\n\n` +
      `Sold: ${formatNumber(config.ethAmount, 4)} ETH\n` +
      `Price: ${currentPrice}\n` +
      `Total: ${formatNumber(usdAmount)}\n\n` + 
      `New ETH Balance: ${formatNumber(userData.eth_balance, 4)} ETH\n` +
      `New USD Balance: ${formatNumber(userData.usd_balance)}`
    );
  }

  if (madeTransaction) {
    return true;
  }
  return false;
}

// Function to check prices and execute auto trades
async function checkPricesAndTrade() {
  try {
    // Only proceed if there are active auto-trading configurations
    if (Object.keys(autoTradingConfigs).length === 0) {
      return;
    }
    
    console.log('Checking prices for auto-trading...');
    const currentPrice = await getEthPrice();
    const userData = loadUserData();
    let dataChanged = false;
    
    // Process auto-trades for each user with active configuration
    for (const userId in autoTradingConfigs) {
      if (autoTradingConfigs[userId].enabled && userData[userId]) {
        const didTrade = await processAutoTrades(userId, userData[userId], currentPrice);
        if (didTrade) dataChanged = true;
      }
    }
    
    // Save user data if any trades were executed
    if (dataChanged) {
      saveUserData(userData);
    }
  } catch (error) {
    console.error('Error in auto-trading:', error);
  }
}

// Setup auto-trading commands
bot.command('autotrade', (ctx) => {
  const userId = ctx.from.id.toString();
  const userData = loadUserData();
  
  if (!userData[userId]) {
    return ctx.reply('Please use /start to initialize your account.');
  }
  
  ctx.reply(
    '⚙️ Auto-Trading Configuration\n\n' +
    'Please select an option:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Setup Auto-Trade', 'autotrade_setup')],
      [Markup.button.callback('Show Current Configuration', 'autotrade_show')],
      [Markup.button.callback('Enable Auto-Trading', 'autotrade_enable')],
      [Markup.button.callback('Disable Auto-Trading', 'autotrade_disable')]
    ])
  );
});

// Setup auto-trading scene
const autoTradeSetupScene = new Scenes.WizardScene(
  'autoTradeSetup',
  // Step 1: Ask for buy price
  (ctx) => {
    ctx.reply('Enter the price at which you want to automatically BUY ETH (e.g., 1830):');
    return ctx.wizard.next();
  },
  // Step 2: Ask for sell price
  (ctx) => {
    ctx.wizard.state.buyAt = parseFloat(ctx.message.text);
    if (isNaN(ctx.wizard.state.buyAt)) {
      ctx.reply('Invalid price. Please enter a valid number:');
      return;
    }
    ctx.reply('Enter the price at which you want to automatically SELL ETH (e.g., 1832):');
    return ctx.wizard.next();
  },
  // Step 3: Ask for USD amount for buying
  (ctx) => {
    ctx.wizard.state.sellAt = parseFloat(ctx.message.text);
    if (isNaN(ctx.wizard.state.sellAt)) {
      ctx.reply('Invalid price. Please enter a valid number:');
      return;
    }
    
    if (ctx.wizard.state.sellAt <= ctx.wizard.state.buyAt) {
      ctx.reply('Sell price must be higher than buy price. Please enter a higher sell price:');
      return;
    }
    
    ctx.reply('Enter the USD amount you want to spend on each auto-buy (e.g., 500):');
    return ctx.wizard.next();
  },
  // Step 4: Ask for ETH amount for selling
  (ctx) => {
    ctx.wizard.state.tradeAmount = parseFloat(ctx.message.text);
    if (isNaN(ctx.wizard.state.tradeAmount) || ctx.wizard.state.tradeAmount <= 0) {
      ctx.reply('Invalid amount. Please enter a positive number:');
      return;
    }
    
    ctx.reply('Enter the ETH amount you want to sell on each auto-sell (e.g., 1):');
    return ctx.wizard.next();
  },
  // Step 5: Save configuration
  (ctx) => {
    const ethAmount = parseFloat(ctx.message.text);
    if (isNaN(ethAmount) || ethAmount <= 0) {
      ctx.reply('Invalid amount. Please enter a positive number:');
      return;
    }
    
    const userId = ctx.from.id.toString();
    
    autoTradingConfigs[userId] = {
      buyAt: ctx.wizard.state.buyAt,
      sellAt: ctx.wizard.state.sellAt,
      tradeAmount: ctx.wizard.state.tradeAmount,
      ethAmount: ethAmount,
      enabled: true,
      chatId: ctx.chat.id
    };
    
    ctx.reply(
      '✅ Auto-Trading Configuration Saved!\n\n' +
      `Buy at: ${ctx.wizard.state.buyAt}\n` +
      `Sell at: ${ctx.wizard.state.sellAt}\n` +
      `USD per buy: ${ctx.wizard.state.tradeAmount}\n` +
      `ETH per sell: ${ethAmount}\n\n` +
      `Auto-trading is now ENABLED. The system will check prices every ${PRICE_CHECK_INTERVAL/1000} seconds.`
    );
    
    return ctx.scene.leave();
  }
);

stage.register(autoTradeSetupScene);

// Handle auto-trading buttons
bot.action('autotrade_setup', (ctx) => {
  ctx.scene.enter('autoTradeSetup');
  ctx.answerCbQuery();
});

bot.action('autotrade_show', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (!autoTradingConfigs[userId]) {
    ctx.editMessageText('You have not set up auto-trading yet. Use the Setup option to configure.');
    return;
  }
  
  const config = autoTradingConfigs[userId];
  
  ctx.editMessageText(
    '📊 Your Auto-Trading Configuration\n\n' +
    `Buy at: ${config.buyAt}\n` +
    `Sell at: ${config.sellAt}\n` +
    `USD per buy: ${config.tradeAmount}\n` +
    `ETH per sell: ${config.ethAmount}\n\n` +
    `Status: ${config.enabled ? 'ENABLED' : 'DISABLED'}`
  );
});

bot.action('autotrade_enable', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (!autoTradingConfigs[userId]) {
    ctx.editMessageText('You have not set up auto-trading yet. Use the Setup option first.');
    return;
  }
  
  autoTradingConfigs[userId].enabled = true;
  autoTradingConfigs[userId].chatId = ctx.chat.id;
  
  ctx.editMessageText('✅ Auto-trading has been ENABLED.');
});

bot.action('autotrade_disable', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (!autoTradingConfigs[userId]) {
    ctx.editMessageText('You have not set up auto-trading yet.');
    return;
  }
  
  autoTradingConfigs[userId].enabled = false;
  
  ctx.editMessageText('❌ Auto-trading has been DISABLED.');
});

// Start the auto-trading price checker
let priceCheckInterval;

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully!');
    // Start price checking interval for auto-trading
    priceCheckInterval = setInterval(checkPricesAndTrade, PRICE_CHECK_INTERVAL);
    console.log(`Auto-trading price checker started (checking every ${PRICE_CHECK_INTERVAL/1000} seconds)`);
  })
  .catch(err => console.error('Failed to start bot:', err));

// Enable graceful stop
process.once('SIGINT', () => {
  clearInterval(priceCheckInterval);
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  clearInterval(priceCheckInterval);
  bot.stop('SIGTERM');
});