const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

mongoose.connect('mongodb+srv://akhildhiman1897:vz5ByPwHTV809uLY@cluster1.hkbchks.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    image: [String],
});
const Product = mongoose.model('Product', productSchema);


const cartSchema = new mongoose.Schema({
    userId: String,
    items: [
        {
            productId: String,
            quantity: Number,
        },
    ],
});
const Cart = mongoose.model('Cart', cartSchema);


app.post('/api/seed-products', async (req, res) => {
    await Product.deleteMany({});

    const products = [
        {
            name: "facewash",
            price: 2499.99,
            image: ["../images/facewash1.jpg"],
        },
        {
            name: "anti-aging-cream",
            price: 799.50,
            image: ["../images/Anti-aging1.jpg"],
        },
        {
            name: "Classic Wrist Watch",
            // price: 1599.00,
            image: ["../images/comingSoon.jpg"],
        },
    ];

    await Product.insertMany(products);
    res.send("Products seeded");
});


app.get('/api/products', async (req, res) => {
    const products = await Product.find();
    res.json(products);
});


app.get('/api/cart', async (req, res) => {
    const { userId } = req.query;
    let cart = await Cart.findOne({ userId });
    if (!cart) {
        cart = new Cart({ userId, items: [] });
        await cart.save();
    }


    const productIds = cart.items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    const enrichedItems = cart.items.map(item => {
        const product = products.find(p => p._id.toString() === item.productId);
        return {
            ...item.toObject(),
            name: product?.name || "Unknown Product",
            price: product?.price || 0,
            image: product?.image || [],
        };
    });

    res.json({ userId: cart.userId, items: enrichedItems });
});


app.post('/api/cart', async (req, res) => {
    const { userId, productId, quantity } = req.body;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
        cart = new Cart({ userId, items: [] });
    }

    const index = cart.items.findIndex(item => item.productId === productId);
    if (index >= 0) {
        cart.items[index].quantity = quantity;
    } else {
        cart.items.push({ productId, quantity });
    }

    await cart.save();
    res.json(cart);
});


app.delete('/api/cart', async (req, res) => {
    const { userId, productId } = req.body;

    let cart = await Cart.findOne({ userId });
    if (cart) {
        cart.items = cart.items.filter(item => item.productId !== productId);
        await cart.save();
    }

    res.json(cart);
});


app.listen(5000, () => console.log('Server running on port 5000'));
