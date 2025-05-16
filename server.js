// index.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
    StandardCheckoutClient,
    Env,
    StandardCheckoutPayRequest,
    CreateSdkOrderRequest
} from 'pg-sdk-node';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Load ENV vars
const {
    PHONEPE_CLIENT_ID,
    PHONEPE_CLIENT_SECRET,
    FRONTEND_ORIGIN,
    REDIRECT_BASE_URL,
    CALLBACK_USERNAME,
    CALLBACK_PASSWORD,
} = process.env;

const clientVersion = 1;
const env = Env.PRODUCTION; // For production
const client = StandardCheckoutClient.getInstance(
    PHONEPE_CLIENT_ID,
    PHONEPE_CLIENT_SECRET,
    clientVersion,
    env
);

// Middlewares
app.use(bodyParser.json());
app.use(cors({
    origin: FRONTEND_ORIGIN,
    methods: ['POST', 'GET'],
}));

// Create Order (redirect checkout)
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const merchantOrderId = randomUUID();
        const redirectUrl = `${REDIRECT_BASE_URL}?orderId=${merchantOrderId}`;

        const request = StandardCheckoutPayRequest.builder()
            .merchantOrderId(merchantOrderId)
            .amount(amount)
            .redirectUrl(redirectUrl)
            .build();

        const response = await client.pay(request);

        res.status(200).json({
            success: true,
            redirectUrl: response.redirectUrl,
            merchantOrderId,
        });
    } catch (err) {
        console.error('Create Order Error:', err);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// Create SDK Order
app.post('/api/create-sdk-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const merchantOrderId = randomUUID();
        const redirectUrl = `${REDIRECT_BASE_URL}?orderId=${merchantOrderId}`;

        const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
            .merchantOrderId(merchantOrderId)
            .amount(amount)
            .redirectUrl(redirectUrl)
            .build();

        const response = await client.createSdkOrder(request);

        res.status(200).json({
            success: true,
            token: response.token,
            merchantOrderId,
        });
    } catch (err) {
        console.error('SDK Order Error:', err);
        res.status(500).json({ error: 'SDK order creation failed' });
    }
});

// Order Status Check
app.get('/api/order-status/:orderId', async (req, res) => {
    try {
        const response = await client.getOrderStatus(req.params.orderId);
        res.status(200).json({
            orderId: req.params.orderId,
            state: response.state,
        });
    } catch (err) {
        console.error('Order Status Error:', err);
        res.status(500).json({ error: 'Failed to check order status' });
    }
});

// Callback from PhonePe
app.post('/api/phonepe-callback', async (req, res) => {
    try {
        const authorization = req.headers['x-verify'];
        const bodyString = JSON.stringify(req.body);

        const callbackResponse = client.validateCallback(
            CALLBACK_USERNAME,
            CALLBACK_PASSWORD,
            authorization,
            bodyString
        );

        // You can persist callbackResponse.payload to DB here
        console.log('PhonePe Callback:', callbackResponse.payload);

        res.status(200).send('Callback verified');
    } catch (err) {
        console.error('Invalid Callback:', err);
        res.status(400).send('Invalid callback');
    }
});

// Server Start
app.listen(PORT, () => {
    console.log(`🚀 PhonePe backend running on port ${PORT}`);
});
