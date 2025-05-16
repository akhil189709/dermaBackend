require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { randomUUID } = require("crypto");

const { PgSdk } = require("pg-sdk-node");

const app = express();

// ✅ Middleware
app.use(helmet());
app.use(express.json());

const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://dermatiqueindia.com";
app.use(cors({
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ✅ Environment Variables & Config
const merchantId = process.env.PG_MERCHANT_ID;
const saltKey = process.env.PG_SALT_KEY;
const saltIndex = process.env.PG_SALT_INDEX;
const env = process.env.PG_ENV || "UAT"; // or "PROD"
const redirectBaseUrl = process.env.REDIRECT_BASE_URL || `${allowedOrigin}/payment`;

if (!merchantId || !saltKey || !saltIndex) {
    throw new Error("❌ PG_MERCHANT_ID, PG_SALT_KEY, or PG_SALT_INDEX not set in environment variables.");
}

// ✅ Logging for Debug (don't log secrets in prod)
if (process.env.NODE_ENV !== "production") {
    console.log("📦 PhonePe Config:");
    console.log("🆔 PG_MERCHANT_ID:", merchantId);
    console.log("🔑 PG_SALT_KEY length:", saltKey.length);
    console.log("🔢 PG_SALT_INDEX:", saltIndex);
    console.log("🌍 PG_ENV:", env);
}

// ✅ Initialize SDK
const phonePe = new PgSdk({
    merchantId,
    saltKey,
    saltIndex,
    env,
});

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
        const merchantTransactionId = randomUUID();
        const redirectUrl = `${redirectBaseUrl}/validate/${merchantTransactionId}`;

        const payload = {
            amount: amountInPaise,
            merchantTransactionId,
            merchantUserId: "user-001", // You can dynamically assign userId
            redirectUrl,
            redirectMode: "POST",
            paymentInstrument: {
                type: "PAY_PAGE",
            },
        };

        const response = await phonePe.createPaymentLink(payload);
        console.log("📤 PhonePe Create Payment Response:", response);

        if (response.success && response.data?.instrumentResponse?.redirectInfo?.url) {
            return res.json({
                success: true,
                checkoutPageUrl: response.data.instrumentResponse.redirectInfo.url,
            });
        } else {
            return res.status(500).json({ success: false, message: "Failed to create payment link", details: response });
        }
    } catch (err) {
        console.error("❌ Payment Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post("/payment/validate/:merchantTransactionId", async (req, res) => {
    try {
        const { merchantTransactionId } = req.params;

        const response = await phonePe.getPaymentStatus(merchantTransactionId);
        console.log("📥 Payment Status Response:", response);

        const redirectTo = response.success && response.data?.state === "COMPLETED"
            ? `${redirectBaseUrl}/success`
            : `${redirectBaseUrl}/failed`;

        res.redirect(redirectTo);
    } catch (err) {
        console.error("❌ Validation Error:", err);
        res.redirect(`${redirectBaseUrl}/failed`);
    }
});

// ✅ Error Handler
app.use((err, req, res, next) => {
    console.error("🔥 Unhandled Server Error:", err);
    res.status(500).json({ success: false, error: err.message });
});

// ✅ Start Server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
