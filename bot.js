const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const config = require("./config.json");

const token = config.TELEGRAM_TOKEN;
let vndUsdt;
let isActive = true;

const bot = new TelegramBot(token, { polling: true });
let binanceFee = 0.2;
let okcoinFee = 0.2;
let bitFlyerFee = 0.2;

// Object to store command states for each chat
const chatCommands = {};

// Function to get or create a chat command state
const getChatCommandState = (chatId) => {
  if (!chatCommands[chatId]) {
    chatCommands[chatId] = {
      currentCommand: null,
      timeoutId: null,
    };
  }
  return chatCommands[chatId];
};

// Function to cancel the current command for a specific chat
const cancelCurrentCommand = (chatId) => {
  const chatState = getChatCommandState(chatId);
  if (chatState.timeoutId) {
    clearTimeout(chatState.timeoutId);
    chatState.timeoutId = null;
    if (chatState.currentCommand) {
      bot.sendMessage(
        chatId,
        `Command ${chatState.currentCommand} has been cancelled.`
      );
    }
    chatState.currentCommand = null;
  }
};

// Function to start a new command for a specific chat
const startCommand = (chatId, command, callback) => {
  cancelCurrentCommand(chatId);
  const chatState = getChatCommandState(chatId);
  chatState.currentCommand = command;
  bot.sendMessage(chatId, `Command ${command} is running!`);
  callback();
};

// Function to get the current buy price
const getCurrentBuyPrice = async () => {
  try {
    const buyResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "BUY",
        page: 1,
        rows: 1,
        payTypes: [],
        publisherType: null,
        merchantCheck: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const price = buyResponse.data.data[0]?.adv?.price;
    return price ? parseFloat(price).toLocaleString("en-US") : "N/A";
  } catch (error) {
    console.error("Error getting current buy price:", error.message);
    return "Error";
  }
};

// Function to get the VND price
const getVNDPrice = async () => {
  try {
    const sellResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "SELL",
        page: 1,
        rows: 3,
        payTypes: [],
        publisherType: null,
        merchantCheck: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const prices = sellResponse.data.data
      .map((ad) => parseFloat(ad.adv.price))
      .filter((price) => !isNaN(price));
    if (prices.length === 0) return "N/A";
    const average =
      prices.reduce((sum, price) => sum + price, 0) / prices.length;
    return average.toFixed(2);
  } catch (error) {
    console.error("Error getting VND price:", error.message);
    return "Error";
  }
};

// Function to get Bitcoin price from Binance
const getBitcoinPriceFromBinance = async () => {
  try {
    const response = await axios.get(
      "https://api.binance.com/api/v3/ticker/price",
      {
        params: {
          symbol: "BTCUSDT",
        },
      }
    );
    const price = parseFloat(response.data.price);
    return isNaN(price) ? "N/A" : price.toFixed(2);
  } catch (error) {
    console.error("Error getting Bitcoin price from Binance:", error.message);
    return "Error";
  }
};

// Function to get price from Binance
const getPriceFromBinance = async () => {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/depth", {
      params: {
        symbol: "BTCJPY",
        limit: 10,
      },
    });
    const asks = response.data.asks
      .map((ask) => parseFloat(ask[0]))
      .filter((ask) => !isNaN(ask));
    return asks.length > 0 ? asks[0].toFixed(2) : "N/A";
  } catch (error) {
    console.error("Error getting price from Binance:", error.message);
    return "Error";
  }
};

// Function to get price from Okcoin
const getPriceFromOkcoin = async () => {
  try {
    const response = await axios.get(
      "https://www.okcoin.jp/api/spot/v3/instruments/BTC-JPY/book",
      {
        params: {
          size: 14,
        },
      }
    );
    const asks = response.data.asks
      .map((ask) => parseFloat(ask[0]))
      .filter((ask) => !isNaN(ask));
    return asks.length > 0 ? asks[0].toFixed(2) : "N/A";
  } catch (error) {
    console.error("Error getting price from Okcoin:", error.message);
    return "Error";
  }
};

// Function to get price from BitFlyer
const getPriceFromBitFlyer = async () => {
  try {
    const response = await axios.get("https://api.bitflyer.com/v1/board", {
      params: {
        product_code: "BTC_JPY",
      },
    });
    const asks = response.data.asks
      .map((ask) => parseFloat(ask.price))
      .filter((ask) => !isNaN(ask));
    return asks.length > 0 ? asks[0].toFixed(2) : "N/A";
  } catch (error) {
    console.error("Error getting price from BitFlyer:", error.message);
    return "Error";
  }
};

// Function to calculate price
const calculatePrice = (usdtToVnd, btcToUsdt, btcToJpy, fee) => {
  return (usdtToVnd * btcToUsdt) / btcToJpy - fee / 100;
};

// Function to format number with commas
const formatNumberWithCommas = (number) => {
  if (isNaN(number)) return number;
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Function to get three digits after decimal
const getThreeDigitsAfterDecimal = (numberString) => {
  const cleanedString = numberString.replace(/,/g, "").replace(".", ".");
  const decimalIndex = cleanedString.indexOf(".");

  if (decimalIndex !== -1) {
    const integerPart = cleanedString.substring(0, decimalIndex);
    const decimalPart = cleanedString.substring(decimalIndex + 1);
    const threeDecimalDigits = decimalPart.slice(0, 3).padEnd(3, "0");
    return `${integerPart}.${threeDecimalDigits}`;
  } else {
    return `${cleanedString}.000`;
  }
};

// Function to get P2P prices
const getP2PPrices = async () => {
  try {
    const buyResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "BUY",
        page: 1,
        rows: 11,
        payTypes: [],
        publisherType: null,
        merchantCheck: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const sellResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "SELL",
        page: 1,
        rows: 11,
        payTypes: [],
        publisherType: null,
        merchantCheck: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const buyAds = buyResponse.data.data;
    const sellAds = sellResponse.data.data;
    const buyPrices = buyAds.slice(1).map((ad) => ad.adv.price);
    const sellPrices = sellAds.slice(1).map((ad) => ad.adv.price);
    let output = "BUY        -       SELL\n";
    for (let i = 0; i < 10; i++) {
      if (i < buyPrices.length && i < sellPrices.length) {
        output += `${parseFloat(
          buyPrices[i]
        ).toLocaleString()}             ${parseFloat(
          sellPrices[i]
        ).toLocaleString()}\n`;
      }
    }
    return output;
  } catch (error) {
    console.error("Error fetching P2P prices:", error.message);
    return "Error fetching P2P prices";
  }
};

// Bot command handlers
bot.onText(/\/start/, (msg) => {
  const firstName = msg.from.first_name || "No name";
  const lastName = msg.from.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Hello ${fullName}. Use the /i command to see how to use the Bot`
  );
});

bot.onText(/\/binance (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  binanceFee = parseFloat(match[1]) / 100;
  bot.sendMessage(chatId, `Binance fee has been updated to ${match[1]}%`);
});

bot.onText(/\/okc (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  okcoinFee = parseFloat(match[1]) / 100;
  bot.sendMessage(chatId, `Okcoin fee has been updated to ${match[1]}%`);
});

bot.onText(/\/bit (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  bitFlyerFee = parseFloat(match[1]) / 100;
  bot.sendMessage(chatId, `BitFlyer fee has been updated to ${match[1]}%`);
});

bot.onText(/\/stop/, (msg) => {
  isActive = false;
  const chatId = msg.chat.id;
  cancelCurrentCommand(chatId);
  console.log("Bot is đang nghỉ ngơi...");
  bot.sendMessage(chatId, "Bot đang nghỉ ngơi...");
});

bot.onText(/\/resume/, (msg) => {
  const chatId = msg.chat.id;
  isActive = true;
  console.log("Bot is running...");
  bot.sendMessage(chatId, "Bot is running...");
});

bot.onText(/\/t (\d+)p/, async (msg, match) => {
  const chatId = msg.chat.id;
  const minutes = parseInt(match[1], 10);
  const interval = minutes * 60 * 1000;

  await bot.sendMessage(chatId, `Command /t ${minutes}p is running`);

  const sendP2PPrices = async () => {
    if (!isActive) return;
    try {
      const prices = await getP2PPrices();
      await bot.sendMessage(chatId, prices);
      const chatState = getChatCommandState(chatId);
      chatState.timeoutId = setTimeout(sendP2PPrices, interval);
    } catch (error) {
      bot.sendMessage(chatId, `Error getting P2P prices: ${error.message}`);
    }
  };

  sendP2PPrices();
});

bot.onText(/\/i/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Các lệnh của bot
2.1. Cập nhật phí giao dịch
/binance <percentage>: Cập nhật phí giao dịch của Binance. Ví dụ: /binance 0.25 để cập nhật phí là 0.25%.
/okc <percentage>: Cập nhật phí giao dịch của Okcoin. Ví dụ: /okc 0.25.
/bit <percentage>: Cập nhật phí giao dịch của BitFlyer. Ví dụ: /bit 0.25.
2.2. Quản lý trạng thái bot
/stop: Dừng hoạt động của bot. Bot sẽ không gửi thông tin giá nữa.
/resume: Tiếp tục hoạt động của bot. Bot sẽ bắt đầu gửi thông tin giá trở lại.
2.3. Xem cách sử dụng
/i: Hiển thị hướng dẫn sử dụng bot.
2.4. Gửi giá theo khoảng thời gian
/a <minutes>p: Bot sẽ gửi thông tin giá theo định kỳ mỗi <minutes> phút. Ví dụ: /a 3p để bot gửi thông tin mỗi 3 phút.
/s <interval>p <vndPrice> <stopAfter>p: Bot sẽ gửi thông tin giá mỗi <interval> phút và sẽ dừng sau <stopAfter> phút. Ví dụ: /s 3p 25345 60p để bot gửi thông tin mỗi 3 phút với giá VND/USDT là 25345 và dừng sau 60 phút.
/t <minutes>p: Bot sẽ gửi thông tin giá P2P theo định kỳ mỗi <minutes> phút. Ví dụ: /t 5p để bot gửi thông tin giá P2P mỗi 5 phút.`
  );
});

bot.onText(/\/t/, async (msg) => {
  const chatId = msg.chat.id;

  const prices = await getP2PPrices();
  bot.sendMessage(chatId, prices);
});

bot.onText(/\/a (\d+)p/, (msg, match) => {
  const chatId = msg.chat.id;
  const minutes = parseInt(match[1], 10);

  startCommand(chatId, `/a ${minutes}p`, () => {
    const interval = minutes * 60 * 1000;
    const fetchAndSendPrices = async () => {
      if (!isActive) return;
      try {
        const startTime = Date.now();
        const [
          vndFromBuy,
          vndPrice,
          btcUsdt,
          binanceData,
          okcoinData,
          bitFlyerData,
        ] = await Promise.all([
          getCurrentBuyPrice(),
          getVNDPrice(),
          getBitcoinPriceFromBinance(),
          getPriceFromBinance(),
          getPriceFromOkcoin(),
          getPriceFromBitFlyer(),
        ]);

        const calculatedBinancePrice = calculatePrice(
          parseFloat(vndPrice),
          parseFloat(btcUsdt),
          parseFloat(binanceData),
          binanceFee
        );
        const calculatedOkcoinPrice = calculatePrice(
          parseFloat(vndPrice),
          parseFloat(btcUsdt),
          parseFloat(okcoinData),
          okcoinFee
        );
        const calculatedBitFlyerPrice = calculatePrice(
          parseFloat(vndPrice),
          parseFloat(btcUsdt),
          parseFloat(bitFlyerData),
          bitFlyerFee
        );

        await bot.sendMessage(
          chatId,
          `Binance: ${formatNumberWithCommas(binanceData)}
Okcoin: ${formatNumberWithCommas(okcoinData)}
Bitflyer: ${formatNumberWithCommas(bitFlyerData)}
---------------------------
VND: ${vndFromBuy} - ${formatNumberWithCommas(vndPrice)}
USDT: ${formatNumberWithCommas(btcUsdt)}
---------------------------
Binance: ${getThreeDigitsAfterDecimal(calculatedBinancePrice.toString())}
Okcoin: ${getThreeDigitsAfterDecimal(calculatedOkcoinPrice.toString())}
Bitflyer: ${getThreeDigitsAfterDecimal(calculatedBitFlyerPrice.toString())}`
        );

        const executionTime = Date.now() - startTime;
        const adjustedInterval = interval - executionTime;
        const chatState = getChatCommandState(chatId);
        if (chatState.currentCommand === `/a ${minutes}p`) {
          chatState.timeoutId = setTimeout(
            fetchAndSendPrices,
            Math.max(0, adjustedInterval)
          );
        }
      } catch (error) {
        bot.sendMessage(chatId, `Error fetching data: ${error.message}`);
      }
    };
    fetchAndSendPrices();
  });
});

bot.onText(/\/s (\d+)p (\d+) (\d+)p/, (msg, match) => {
  const chatId = msg.chat.id;
  const [_, intervalMinutes, vndPrice, stopAfterMinutes] = match.map(Number);

  startCommand(
    chatId,
    `/s ${intervalMinutes}p ${vndPrice} ${stopAfterMinutes}p`,
    () => {
      const interval = intervalMinutes * 60 * 1000;
      const stopAfter = stopAfterMinutes * 60 * 1000;
      const startTime = Date.now();

      const fetchAndSendPrices = async () => {
        if (!isActive) return;
        try {
          const currentTime = Date.now();
          const elapsedTime = currentTime - startTime;

          const [vndFromBuy, btcUsdt, binanceData, okcoinData, bitFlyerData] =
            await Promise.all([
              getCurrentBuyPrice(),
              getBitcoinPriceFromBinance(),
              getPriceFromBinance(),
              getPriceFromOkcoin(),
              getPriceFromBitFlyer(),
            ]);

          const calculatedBinancePrice = calculatePrice(
            parseFloat(vndPrice),
            parseFloat(btcUsdt),
            parseFloat(binanceData),
            binanceFee
          );
          const calculatedOkcoinPrice = calculatePrice(
            parseFloat(vndPrice),
            parseFloat(btcUsdt),
            parseFloat(okcoinData),
            okcoinFee
          );
          const calculatedBitFlyerPrice = calculatePrice(
            parseFloat(vndPrice),
            parseFloat(btcUsdt),
            parseFloat(bitFlyerData),
            bitFlyerFee
          );

          await bot.sendMessage(
            chatId,
            `Binance: ${formatNumberWithCommas(binanceData)}
Okcoin: ${formatNumberWithCommas(okcoinData)}
Bitflyer: ${formatNumberWithCommas(bitFlyerData)}
—----  FIX U -------
VND: ${vndFromBuy} - ${formatNumberWithCommas(vndPrice)}
USDT: ${formatNumberWithCommas(btcUsdt)}
---------------------------
Binance: ${getThreeDigitsAfterDecimal(calculatedBinancePrice.toString())}
Okcoin: ${getThreeDigitsAfterDecimal(calculatedOkcoinPrice.toString())}
Bitflyer: ${getThreeDigitsAfterDecimal(calculatedBitFlyerPrice.toString())}`
          );

          const chatState = getChatCommandState(chatId);
          if (
            elapsedTime < stopAfter &&
            chatState.currentCommand ===
              `/s ${intervalMinutes}p ${vndPrice} ${stopAfterMinutes}p`
          ) {
            chatState.timeoutId = setTimeout(fetchAndSendPrices, interval);
          } else {
            bot.sendMessage(
              chatId,
              `Lệnh /s đã kết thúc sau ${stopAfterMinutes} phút.`
            );
            chatState.currentCommand = null;
          }
        } catch (error) {
          bot.sendMessage(chatId, `Error fetching data: ${error.message}`);
        }
      };
      fetchAndSendPrices();
    }
  );
});

console.log("Bot is running!");
