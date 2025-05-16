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

// ✅ Middleware
app.use(helmet());
app.use(express.json());

const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://dermatiqueindia.com/cart";
app.use(cors({
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ✅ Config
const merchantId = process.env.PG_MERCHANT_ID;
const saltKey = process.env.PG_SALT_KEY;
const saltIndex = process.env.PG_SALT_INDEX;
const envMode = (process.env.PG_ENV || "UAT").toUpperCase();

console.log("📦 PhonePe Config:");
console.log("🆔 PG_MERCHANT_ID:", merchantId);
console.log("🔑 PG_SALT_KEY length:", saltKey?.length);
console.log("🔢 PG_SALT_INDEX:", saltIndex);
console.log("🌍 PG_ENV:", envMode);

if (!merchantId || !saltKey || !saltIndex) {
    throw new Error("❌ PG_MERCHANT_ID, PG_SALT_KEY, or PG_SALT_INDEX not set in environment variables.");
}

// Initialize PhonePe SDK client properly
const client = StandardCheckoutClient.getInstance(
    merchantId,
    saltKey,
    parseInt(saltIndex, 10),
    envMode === "PROD" ? Env.PROD : Env.SANDBOX
);

const redirectBaseUrl = process.env.REDIRECT_BASE_URL || `${allowedOrigin}/payment`;

// ✅ Routes
app.get("/", (req, res) => {
    res.send("✅ PhonePe Payment Gateway Live");
});

app.post("/pay", async (req, res) => {
    try {
        const amountInRupees = Number(req.body.amount);
        if (isNaN(amountInRupees) || amountInRupees <= 0) {
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
        console.log("📤 PhonePe Pay Response:", response);

        if (response.redirectUrl) {
            return res.json({ success: true, checkoutPageUrl: response.redirectUrl });
        } else {
            return res.status(500).json({ success: false, message: "Failed to initiate payment", details: response });
        }
    } catch (err) {
        console.error("❌ Payment Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/payment/validate/:merchantOrderId", async (req, res) => {
    try {
        const merchantOrderId = req.params.merchantOrderId;
        const response = await client.getOrderStatus(merchantOrderId);
        console.log("📥 Payment Status:", response);

        const redirectTo = response.state === "COMPLETED"
            ? `${redirectBaseUrl}/success`
            : `${redirectBaseUrl}/failed`;

        res.redirect(redirectTo);
    } catch (err) {
        console.error("❌ Validation Error:", err);
        res.redirect(`${redirectBaseUrl}/failed`);
    }
});

// ✅ Error Handling
app.use((err, req, res, next) => {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ success: false, error: err.message });
});

// ✅ Start Server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
