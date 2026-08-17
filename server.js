const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

// بيانات تيليجرام
const TELEGRAM_BOT_TOKEN = '8968473502:AAHKxKML-5rXbnKpc9e5bK-cWeMeNWs4Hhs';
const ADMIN_CHAT_ID = '6980001843'; // تأكد أنه رقمك الصحيح

const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";

const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(publicDir, 'uploads');
const productsFile = path.join(__dirname, 'products.json');
const ordersFile = path.join(__dirname, 'orders.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(productsFile)) fs.writeFileSync(productsFile, JSON.stringify([]));
if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, JSON.stringify([]));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// دالة إرسال التيليجرام التلقائية المضمونة
function sendTelegramNotification(message) {
    const data = JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            console.log("Telegram Response:", responseData);
        });
    });

    req.on('error', (error) => {
        console.error('Telegram Error:', error);
    });

    req.write(data);
    req.end();
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) res.json({ success: true });
    else res.status(401).json({ success: false });
});

// Products APIs
app.get('/api/products', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(productsFile, 'utf8') || '[]'));
});

app.post('/api/products', upload.single('image'), (req, res) => {
    const products = JSON.parse(fs.readFileSync(productsFile, 'utf8') || '[]');
    products.push({
        id: Date.now(),
        name: req.body.name,
        price: req.body.price,
        desc: req.body.desc,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : ''
    });
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
    res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
    let products = JSON.parse(fs.readFileSync(productsFile, 'utf8') || '[]');
    products = products.filter(p => p.id !== Number(req.params.id));
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
    res.json({ success: true });
});

// Orders APIs (متوافق مع الـ Checkout وإشعار تيليجرام)
app.get('/api/orders', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(ordersFile, 'utf8') || '[]'));
});

app.post('/api/orders', upload.single('receiptImage'), (req, res) => {
    try {
        const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8') || '[]');
        
        let customerData = {};
        let cartItems = [];
        let totalAmount = 0;

        if (req.body.orderData) {
            const parsedData = JSON.parse(req.body.orderData);
            customerData = parsedData.customer || {};
            cartItems = parsedData.items || [];
            totalAmount = parsedData.totalAmount || 0;
        }

        const newOrder = {
            id: Date.now(),
            customer: customerData,
            items: cartItems,
            totalAmount: totalAmount,
            receiptUrl: req.file ? `/uploads/${req.file.filename}` : ''
        };

        orders.push(newOrder);
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));

        // تجهيز المنتجات لعرضها في التيليجرام
        let productsList = cartItems.map(item => `▪️ ${item.name} (الكمية: ${item.quantity || 1})`).join('\n');

        // تجهيز رسالة التيليجرام
        const message = `
🚨 **أوردر جديد في Sohyla Brand!**
👤 **العميل:** ${customerData.name || 'غير معروف'}
📞 **الهاتف:** ${customerData.phone || 'بدون'}
🏙️ **المدينة:** ${customerData.city || 'بدون'}
📍 **العنوان:** ${customerData.address || 'بدون'}
💰 **المبلغ الإجمالي:** ${totalAmount} EGP

🛒 **المنتجات المطلوبة:**
${productsList}
        `.trim();

        // إرسال الإشعار لتيليجرام تلقائياً
        sendTelegramNotification(message);

        res.json({ success: true });
    } catch (error) {
        console.error("Error processing order:", error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));