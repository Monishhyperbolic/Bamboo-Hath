const express = require("express");
const { ethers } = require("ethers");
const cors = require("cors");
const cron = require("node-cron");
const axios = require("axios");
const { SimpleLinearRegression } = require("ml-regression-simple");
const lowdb = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const Compound = require("compound-js");
const NotificationAPI = require("@notificationapi/core");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
const adapter = new FileSync("db.json");
const db = lowdb(adapter);
db.defaults({ users: [], notifications: [] }).write();

// Blockchain setup (Sepolia)
const provider = new ethers.providers.JsonRpcProvider("https://sepolia.infura.io/v3/YOUR_INFURA_KEY");
const compound = new Compound(provider, { network: "sepolia" });

// NotificationAPI setup
const notificationAPI = new NotificationAPI({
  clientId: process.env.NOTIFICATIONAPI_CLIENT_ID,
  clientSecret: process.env.NOTIFICATIONAPI_CLIENT_SECRET
});

// Save user settings
app.post("/save-settings", (req, res) => {
  const { address, threshold, email, phone } = req.body;
  db.get("users")
    .push({ address, threshold, email, phone, history: [] })
    .write();
  res.sendStatus(200);
});

// Get notification history
app.get("/notifications/:address", (req, res) => {
  const notifications = db.get("notifications")
    .filter({ address: req.params.address })
    .value();
  res.json(notifications);
});

// Calculate volatility
function calculateVolatility(prices) {
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
  return Math.sqrt(variance) / mean;
}

// Send notifications via NotificationAPI
async function sendNotification(user, healthFactor, volatility) {
  const collateralNeeded = (1.5 - healthFactor) * user.borrowValue || 0;
  const message = `⚠️ Health Factor: ${healthFactor.toFixed(2)}. Add $${collateralNeeded.toFixed(2)} collateral to avoid liquidation due to high volatility (${(volatility * 100).toFixed(2)}%).`;

  // Store notification
  db.get("notifications")
    .push({ address: user.address, message, timestamp: Date.now() })
    .write();

  // Send notification via NotificationAPI
  const notificationPayload = {
    notificationId: "compound_health_alert",
    user: {
      id: user.address,
      email: user.email || undefined,
      number: user.phone || undefined
    },
    params: {
      title: "Compound Liquidation Risk Alert",
      body: message
    }
  };

  try {
    await notificationAPI.send(notificationPayload);
  } catch (error) {
    console.error(`Error sending notification to ${user.address}:`, error);
  }
}

// Monitor health
cron.schedule("*/5 * * * *", async () => {
  const users = db.get("users").value();
  const { data } = await axios.get("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=1");
  const prices = data.prices.map(([_, price]) => price);
  const volatility = calculateVolatility(prices);

  // Simple regression model (optional)
  const historicalHealth = users.map(u => u.history || []).flat();
  if (historicalHealth.length > 5) {
    const x = historicalHealth.map((_, i) => i);
    const y = historicalHealth.map(h => h.healthFactor);
    const regression = new SimpleLinearRegression(x, y);
    const predictedHealth = regression.predict(historicalHealth.length);
  }

  for (const user of users) {
    try {
      const liquidityData = await compound.comptroller.getAccountLiquidity(user.address);
      const healthFactor = liquidityData.liquidity > 0 
        ? Number((liquidityData.liquidity / (liquidityData.liquidity + liquidityData.shortfall)).toFixed(2)) 
        : 0;

      // Fetch borrow value for advice
      const assetsIn = await compound.comptroller.getAssetsIn(user.address);
      let borrowValue = 0;
      for (const cTokenAddress of assetsIn) {
        const borrowBalance = await compound.cToken.borrowBalanceCurrent(user.address, cTokenAddress);
        borrowValue += Number(ethers.utils.formatUnits(borrowBalance, 18));
      }
      db.get("users")
        .find({ address: user.address })
        .assign({ borrowValue, history: [...(user.history || []), { healthFactor, timestamp: Date.now() }].slice(-10) })
        .write();

      // Check for alert condition
      if (healthFactor < user.threshold && volatility > 0.05) {
        await sendNotification({ ...user, borrowValue }, healthFactor, volatility);
      }
    } catch (error) {
      console.error(`Error monitoring ${user.address}:`, error);
    }
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));