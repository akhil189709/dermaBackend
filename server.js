require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { randomUUID } = require("crypto");
const {
    StandardCheckoutClient,
    Env,
    StandardCheckoutPayRequest,
} = require("pg-sdk-node");

const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json());

// CORS Setup
const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://dermatiqueindia.com";
app.use(cors({
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

// Rate Limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Environment Config
const merchantId = process.env.PG_MERCHANT_ID;
const saltKey = process.env.PG_SALT_KEY;
const saltIndex = process.env.PG_SALT_INDEX;
const envMode = (process.env.PG_ENV || "UAT").toUpperCase();
const redirectBaseUrl = process.env.REDIRECT_BASE_URL || `${allowedOrigin}/payment`;

// Validate essential env vars
if (!merchantId || !saltKey || !saltIndex) {
    console.error("❌ Missing PhonePe environment variables");
    process.exit(1); // Exit for safety
}

// Initialize PhonePe client
const client = StandardCheckoutClient.getInstance(
    merchantId,
    saltKey,
    parseInt(saltIndex, 10),
    envMode === "PROD" ? Env.PROD : Env.SANDBOX
);

// Root endpoint
app.get("/", (req, res) => {
    res.send("✅ PhonePe Payment Gateway is live.");
});

// Create payment
app.post("/pay", async (req, res) => {
    try {
        const { amount } = req.body;
        const amountInRupees = Number(amount);

        if (!amountInRupees || isNaN(amountInRupees) || amountInRupees <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount" });
        }

        const amountInPaise = amountInRupees * 100;
        const merchantOrderId = randomUUID();
        const redirectUrl = `${redirectBaseUrl}/validate/${merchantOrderId}`;

        const request = StandardCheckoutPayRequest.builder()
            .merchantOrderId(merchantOrderId)
            .amount(amountInPaise)
            .redirectUrl(redirectUrl)
            .build();

        const response = await client.pay(request);

        if (response.redirectUrl) {
            return res.json({ success: true, checkoutPageUrl: response.redirectUrl });
        }

        console.error("❌ Payment Initiation Failed:", response);
        return res.status(502).json({ success: false, message: "Payment initiation failed", details: response });
    } catch (err) {
        console.error("❌ Payment Error:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Payment validation
app.get("/payment/validate/:merchantOrderId", async (req, res) => {
    const { merchantOrderId } = req.params;

    try {
        const response = await client.getOrderStatus(merchantOrderId);
        const isSuccess = response.state === "COMPLETED";

        const redirectTo = isSuccess
            ? `${redirectBaseUrl}/success`
            : `${redirectBaseUrl}/failed`;

        console.log(`ℹ️ Payment Status for ${merchantOrderId}: ${response.state}`);
        return res.redirect(redirectTo);
    } catch (err) {
        console.error("❌ Validation Error:", err);
        return res.redirect(`${redirectBaseUrl}/failed`);
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("❌ Uncaught Server Error:", err);
    res.status(500).json({ success: false, error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🚀 Server running in ${envMode} mode at http://localhost:${PORT}`);
});
