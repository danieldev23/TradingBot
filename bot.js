const puppeteer = require("puppeteer");
const config = require("./config.json");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const token = config.TELEGRAM_TOKEN;
let vndUsdt;
let isActive = true;
let timeoutIds = [];

const bot = new TelegramBot(token, { polling: true });
let binanceFee = 0.2; // Default 0.2%
let okcoinFee = 0.2; // Default 0.2%
let bitFlyerFee = 0.2;

bot.onText(/\/start/, (msg) => {
  const firstName = msg.from.first_name || "Không có tên";
  const lastName = msg.from.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const chatId = msg.chat.id;
  bot.sendAnimation(
    chatId,
    `Xin chào ${fullName}. Sử dụng lệnh /i để xem cách sử dụng Bot`
  );
});

bot.onText(/\/binance (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  binanceFee = parseFloat(match[1]) / 100; // Convert percentage to decimal
  bot.sendMessage(chatId, `Phí Binance đã được cập nhật thành ${match[1]}%`);
});

bot.onText(/\/okc (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  okcoinFee = parseFloat(match[1]) / 100; // Convert percentage to decimal
  bot.sendMessage(chatId, `Phí Okcoin đã được cập nhật thành ${match[1]}%`);
});

bot.onText(/\/bit (\d+\.\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  bitFlyerFee = parseFloat(match[1]) / 100; // Convert percentage to decimal
  bot.sendMessage(chatId, `Phí BitFlyer đã được cập nhật thành ${match[1]}%`);
});

bot.onText(/\/stop/, (msg) => {
  isActive = false;
  const chatId = msg.chat.id;
  timeoutIds.forEach((id) => clearTimeout(id));
  timeoutIds = [];
  console.log("Bot tạm thời nghỉ ngơi nhé...");
  bot.sendMessage(chatId, "Bot tạm thời nghỉ ngơi nhé...");
});

bot.onText(/\/resume/, (msg) => {
  const chatId = msg.chat.id;
  isActive = true;
  console.log("Bot is running...");
  bot.sendMessage(chatId, "Bot đang hoạt động...");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  const firstName = msg.from.first_name || "Không có tên";
  const lastName = msg.from.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();

  if (isActive && userMessage) {
    if (userMessage === "/start") {
      bot.sendMessage(
        chatId,
        `Xin chào ${fullName}
Sử dụng lệnh /i để xem cách sử dụng Bot`
      );
    }
    if (userMessage === "/t") {
      const prices = await getP2PPrices();
      bot.sendMessage(chatId, prices);
    }
    if (userMessage === "/i") {
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

/s <interval>p <vndPrice> <stopAfter>p: Bot sẽ gửi thông tin giá mỗi <interval> phút và sẽ dừng sau <stopAfter> phút. Ví dụ: /s 3p 25345 60p để bot gửi thông tin mỗi 3 phút với giá VND/USDT là 25345 và dừng sau 60 phút.`
      );
    }

    const match = userMessage.match(/^\/a (\d+)p$/);
    if (match) {
      bot.sendMessage(chatId, `Lệnh ${userMessage} đang được chạy!`);
      if (!isActive) return;
      const minutes = parseInt(match[1], 10);
      const interval = minutes * 60 * 1000;
      const fetchAndSendPrices = async () => {
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
            vndPrice,
            btcUsdt,
            binanceData[0],
            binanceFee
          );
          const calculatedOkcoinPrice = calculatePrice(
            vndPrice,
            btcUsdt,
            okcoinData[0]?.toString().replace(/,/g, ""),
            okcoinFee
          );
          const calculatedBitFlyerPrice = calculatePrice(
            vndPrice,
            btcUsdt,
            bitFlyerData.price,
            bitFlyerFee
          );

          await bot.sendMessage(
            chatId,
            `Binance: ${Number(binanceData[0]).toLocaleString("en-US")}
Okcoin:  ${okcoinData[0]}
Bitflyer:  ${Number(bitFlyerData.price).toLocaleString("en-US")}
---------------------------
VND: ${vndFromBuy} - ${Number(vndPrice).toLocaleString("en-US")}
BTCUSDT: ${btcUsdt.toLocaleString("en-US")}
---------------------------
Binance: ${getThreeDigitsAfterDecimal(calculatedBinancePrice.toString())}
Okcoin:  ${getThreeDigitsAfterDecimal(calculatedOkcoinPrice.toString())}
Bitflyer:  ${getThreeDigitsAfterDecimal(calculatedBitFlyerPrice.toString())}`
          );

          const executionTime = Date.now() - startTime;
          const adjustedInterval = interval - executionTime;
          const timeoutId = setTimeout(fetchAndSendPrices, adjustedInterval);
          timeoutIds.push(timeoutId);
          // if (adjustedInterval > 0) {
          //   setTimeout(fetchAndSendPrices, adjustedInterval);
          // } else {
          //   setImmediate(fetchAndSendPrices);
          // }
        } catch (error) {
          bot.sendMessage(chatId, `Lỗi khi lấy dữ liệu: ${error.message}`);
        }
      };
      fetchAndSendPrices();
    }

    const match2 = userMessage.match(/^\/s (\d+)p (\d+) (\d+)p$/);
    if (match2) {
      bot.sendMessage(chatId, `Lệnh ${userMessage} đang được chạy!`);

      const [_, intervalMinutes, vndPrice, stopAfterMinutes] =
        match2.map(Number);
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
            vndPrice,
            btcUsdt,
            binanceData[0],
            binanceFee
          );
          const calculatedOkcoinPrice = calculatePrice(
            vndPrice,
            btcUsdt,
            okcoinData[0].toString().replace(/,/g, ""),
            okcoinFee
          );
          const calculatedBitFlyerPrice = calculatePrice(
            vndPrice,
            btcUsdt,
            bitFlyerData.price,
            bitFlyerFee
          );

          const formattedBinancePrice = formatNumberWithCommas(binanceData[0]);
          const formattedOkcoinPrice = formatNumberWithCommas(okcoinData[0]);
          const formattedBitFlyerPrice = formatNumberWithCommas(
            bitFlyerData.price
          );
          const formattedVNDPrice = formatNumberWithCommas(vndPrice);
          const formattedBTCUSDT = formatNumberWithCommas(btcUsdt);

          await bot.sendMessage(
            chatId,
            `
Binance: ${formattedBinancePrice}
Okcoin:  ${formattedOkcoinPrice}
Bitflyer:  ${formattedBitFlyerPrice}
—----  FIX U -------
VND: ${vndFromBuy} - ${formattedVNDPrice}
BTCUSDT: ${formattedBTCUSDT}
------------------------
Binance: ${calculatedBinancePrice.toLocaleString("en-US")}
Okcoin:  ${calculatedOkcoinPrice.toLocaleString("en-US")}
Bitflyer:  ${calculatedBitFlyerPrice.toLocaleString("en-US")}
`
          );

          if (elapsedTime < stopAfter) {
            const timeoutId = setTimeout(fetchAndSendPrices, interval);
            timeoutIds.push(timeoutId);
          }
        } catch (error) {
          bot.sendMessage(chatId, `Lỗi khi lấy dữ liệu: ${error.message}`);
        }
      };
      fetchAndSendPrices();
    }
  }
});

const getPriceFromBinance = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.binance.com/en-JP/trade/BTC_JPY?type=spot", {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector("div.progress-container");
  const lastProgressContainer = await page.evaluate(() => {
    const containers = Array.from(
      document.querySelectorAll("div.progress-container")
    );
    const lastContainer = containers[containers.length - 1];
    const values = Array.from(
      lastContainer.querySelectorAll("div.row-content > div")
    ).map((div) => div.textContent.trim());
    return values;
  });
  await browser.close();
  return lastProgressContainer;
};

const getPriceFromOkcoin = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.okcoin.jp/spot/trade", {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector("li.sell-item");
  const lastSellItem = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("li.sell-item"));
    const lastItem = items[items.length - 1];
    const values = Array.from(lastItem.querySelectorAll("span")).map((span) =>
      span.textContent.trim()
    );
    return values;
  });
  await browser.close();
  return lastSellItem;
};

const getPriceFromBitFlyer = async () => {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("https://lightning.bitflyer.com/trade", {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector("a.raised.clickable.filled");
    await page.click("a.raised.clickable.filled");
    await page.waitForSelector(".offer__inner li", { timeout: 20000 });
    const lastItemDetails = await page.evaluate(() => {
      const listItems = document.querySelectorAll(".offer__inner li");
      if (listItems.length === 0) {
        return "No items found";
      }
      const lastItem = listItems[listItems.length - 1];
      return {
        price: lastItem.getAttribute("data-item-price"),
        ltpFlag: lastItem.getAttribute("data-ltp-flag"),
        size: lastItem.querySelector(".orderbook__size")
          ? lastItem.querySelector(".orderbook__size").textContent.trim()
          : "N/A",
        priceText: lastItem.querySelector(".orderbook__price")
          ? lastItem.querySelector(".orderbook__price").textContent.trim()
          : "N/A",
      };
    });
    return lastItemDetails;
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

const getVNDPrice = async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
      "https://p2p.binance.com/en-JP/trade/sell/USDT?fiat=VND&payment=all-payments",
      { waitUntil: "networkidle2" }
    );
    await page.waitForSelector("div.headline5.mr-4xs.text-primaryText");
    const prices = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        "div.headline5.mr-4xs.text-primaryText"
      );
      return Array.from(elements)
        .slice(0, 3)
        .map((element) => {
          const text = element.textContent.trim().replace(/,/g, "");
          return parseFloat(text);
        });
    });

    await browser.close();
    vndUsdt = prices[0];
    const total = prices.reduce((sum, price) => sum + price, 0);
    const average = (total / prices.length).toString().slice(0, 5);
    return average;
  } catch (error) {
    throw new Error(error.message);
  }
};

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
    const price = response.data.price.toString().slice(0, 5);
    return parseInt(price);
  } catch (error) {
    console.error("Lỗi khi lấy giá Bitcoin từ Binance:", error.message);
  }
};

const calculatePrice = (usdtToVnd, btcToUsdt, btcToJpy, fee) => {
  return (usdtToVnd * btcToUsdt) / btcToJpy - fee / 100;
};

const formatNumberWithCommas = (number) => {
  if (isNaN(number)) return number;
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

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

const getCurrentBuyPrice = async () => {
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
  return buyResponse.data.data
    .map((ad) => ad.adv.price)[0]
    .toLocaleString("en-US");
};
const getP2PPrices = async () => {
  try {
    // Fetch BUY prices
    const buyResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "BUY",
        page: 1,
        rows: 10,
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

    // Fetch SELL prices
    const sellResponse = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        asset: "USDT",
        fiat: "VND",
        tradeType: "SELL",
        page: 1,
        rows: 10,
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

    // Parsing the response to extract the prices
    const buyAds = buyResponse.data.data;
    const sellAds = sellResponse.data.data;

    const buyPrices = buyAds.map((ad) => ad.adv.price);
    const sellPrices = sellAds.map((ad) => ad.adv.price);

    let output = "MUA        -       BÁN\n";
    for (let i = 0; i < Math.min(buyPrices.length, sellPrices.length); i++) {
      output += `${parseFloat(
        buyPrices[i]
      ).toLocaleString()}             ${parseFloat(
        sellPrices[i]
      ).toLocaleString()}\n`;
    }

    return output;
  } catch (error) {
    console.error("Error fetching P2P prices:", error.message);
  }
};
