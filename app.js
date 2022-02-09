const path = require('path');
const mysql = require('mysql');
const multer = require('multer');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const express = require('express');
const passport = require('passport');
const local = require('passport-local');
const bodyParser = require('body-parser');
const nodemailer  = require('nodemailer');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');

const flash = require('connect-flash');
const isAdmin = require('./middlewares/index').isAdmin;
const isLoggedIn = require('./middlewares/index').isLoggedIn;

const connection = require('./utils/database');
const { query } = require('express');

dotenv.config({
    path: './.env'
});

const localStrategy = local.Strategy;

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'images');
    },
    filename: (req, file, cb) => {
      cb(null, new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    if (
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'image/jpeg'
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
};

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true}));
app.use(multer({ storage: fileStorage, fileFilter: fileFilter }).single('img'));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(flash());
app.use(cookieParser());
app.use(session({
    secret: 'baraa',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => {
    done(null, user.email);
});
passport.deserializeUser((email, done) => {
    connection.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        done(err, results[0]);
    });
});
passport.use('local-users-signin', new localStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, (req, email, password, done) => {
    connection.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if(err){
            return done(err);
        }
        else if(!results.length){
            return done(null, false, req.flash('error', 'Email or Password is incorrect.'));
        }
        bcrypt.compare(password, results[0].password).then(match => {
            if(match){
                return done(null, results[0], req.flash('success', 'Signed In Successfully.'));
            }
            else{
                return done(null, false, req.flash('error', 'Email or Password is incorrect.'));
            }
        }).catch(err => {
            return done(err);
        });
    });
}));

app.use(methodOverride('_method'));

app.use((req, res, next) => {
    res.locals.error = req.flash('error');
    res.locals.success = req.flash('success');
    res.locals.user = req.user;
    next();
});

app.get('/', (req, res) => {
    connection.query('SELECT * FROM products WHERE qty > 0 LIMIT 8', (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        res.render('home', {products : results, title: '/'});
    });
});

app.get('/signin', (req, res) => {
    res.render('signin');
});

app.post('/signin', passport.authenticate('local-users-signin', {
    successRedirect: '/',
    failureRedirect: '/signin',
    failureFlash: true,
    successFlash: true
}));

app.get('/logout', (req, res) => {
    req.logOut();
    res.redirect('/');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', (req, res) => {
    const user = req.body.user;
    const confirmPassword = req.body.confirmPassword;
    connection.query('SELECT * FROM users WHERE email = ?', [user.email], async (err, results) => {
        if(err){
           return res.status(500).render('500');
        }
        else if(results.length > 0){
            //req.flash('error', 'Email is already in use!');
            return res.render('signup', {info: user, confirmPassword: confirmPassword, error: 'Email is already in use!'});
        }
        if(user.password !== confirmPassword){
            //req.flash('error', 'Passwords don\'t match!');
            return res.render('signup', {info: user, confirmPassword: confirmPassword, error: 'Passwords don\'t match!'});
        }
        else{
            const hashedPassword = await bcrypt.hash(user.password, 12);
            user.password = hashedPassword;
            connection.query('INSERT INTO users SET ?', user, (err, results) => {
  
                if(err){
                    return res.status(500).render('500');
                }
                req.flash('success', 'User Registered Successfully.');
                console.log(user);
                res.redirect('/signin');
            });
        }
    });
});

app.get('/shop', (req, res) => {
    const category = req.query.cat;
    if(!category){
        connection.query('SELECT * FROM products INNER JOIN colors ON colors.id = products.colorId WHERE qty > 0', (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            res.render('shop', {products: results, cat: category, title: 'shop'});
        });
    }
    else{
        connection.query('SELECT * FROM products INNER JOIN colors ON colors.id = products.colorId WHERE products.categoryId = ? AND products.qty > 0', category, (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            res.render('shop', {products: results, cat: category, title: 'shop'});
        });
    }
});

app.get('/cart', isLoggedIn, (req, res) => {
    const userid=req.user.id;
    connection.query('SELECT * FROM cart INNER JOIN products ON products.productId = cart.productId WHERE cart.userId = ?', [userid], (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        res.render('cart', {products: results, title: 'shop', total: 0});
    });
});

app.post('/cart/:productId', isLoggedIn, (req, res) => {
    const qty = req.body.qty;
    const user = req.user;
    const productQty = req.body.productQty;
    const productId = req.params.productId;
    let quantity = qty ? +qty : 1;
    if(quantity > productQty){
        req.flash('error', `Only ${productQty} Remains.`);
        return res.redirect('back');
    }
    connection.query('SELECT * FROM cart WHERE cart.productId = ? AND cart.userId = ?', [productId, user.id], (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        if(results.length > 0){
            quantity += +results[0].quantity;
            connection.query('UPDATE cart SET quantity = ? WHERE cart.userId = ? AND cart.productId = ?', [quantity, user.id, productId], (err, results) => {
                if(err){
                    return res.status(500).render('500');
                }
                req.flash('success', 'Product Is Added To The Cart Successfully.');
                res.redirect('back');
            });
        }
        else{
            connection.query('INSERT INTO cart (userId, productId, quantity) VALUEs(?, ?, ?)', [user.id, productId, quantity], (err, results) => {
                if(err){
                    return res.status(500).render('500');
                }
                req.flash('success', 'Product Is Added To The Cart Successfully.');
                res.redirect('back');
            });
        }
    });
});

app.delete('/cart/:productId', (req, res) => {
    const userId = req.user.id;
    const productId = req.params.productId;
    connection.query('DELETE FROM cart WHERE userId = ? AND productId = ?', [userId, productId], (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        req.flash('success', 'Product Is Deleted From The Cart Successfully.');
        res.redirect('back');
    });
});

app.get('/checkout', isLoggedIn, (req, res) => {
    const userid = req.user.id;
    connection.query('SELECT * FROM cart INNER JOIN products ON products.productId = cart.productId where cart.userId=?',[userid],(err, results) => {
        if(err){
            return res.status(500).render('500');
        }
         res.render('checkout', {products: results, title: 'shop',total: 0});
});
});

app.post('/checkout', isLoggedIn, (req, res) => {
    const userid = req.user.id;
    const order = req.body.orders;
    
    connection.query('SELECT * FROM cart INNER JOIN products ON products.productId = cart.productId WHERE cart.userId = ?', [userid], (err, products) => {
        if(err){
            return res.status(500).render('500');
        }
        else if(products.length === 0){
            req.flash('error', 'Cart Is Empty.');
            return res.redirect('back');
        }
        let totalPrice = 0;
        products.forEach(product => totalPrice += product.price * product.quantity);
        order.totalPrice = totalPrice;
        connection.query('INSERT INTO address SET ?', req.body.address, (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            order.addressId = results.insertId;
            order.userId = userid;
            connection.query('INSERT INTO orders SET ?', order, (err, results) => {
                if(err){
                    console.log(err);
                    return res.status(500).render('500');
                }
                const orderId = results.insertId;
                const orderDetails = [];
                let queries = ' ';
                products.forEach(product => {
                    orderDetails.push([orderId, product.productId, product.quantity, product.price]);
                    queries += mysql.format(`UPDATE products set products.qty = products.qty - ${product.quantity} where products.productId = ${product.productId} ; `);
                });
                connection.query('INSERT INTO orderdetails (orderId, productId, quantity, price) VALUES ?', [orderDetails], (err, results) => {
                    if(err){
                        return res.status(500).render('500');
                    }
                    connection.query('DELETE FROM cart WHERE userId = ?', userid, (err, results) => {
                        if(err){
                            return res.status(500).render('500');
                        }
                        connection.query(queries, (err, results) => {
                            if(err){
                                console.log(err);
                                return res.status(500).render('500');
                            }
                            req.flash('success', 'Order Is Set Successfully.');
                            res.redirect('back');
                        });
                    
                    });
                });
            });
        });
    });
});

app.get('/orders', isLoggedIn, (req, res) => {
    let query = `SELECT * FROM orders WHERE userId = ${req.user.id}`
    if(req.user.admin){
        query = 'SELECT * FROM orders'
    }
    connection.query(query, (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        res.render('orders', {orders: results, title: 'shop'});
    });
});

app.get('/orders/:id', isLoggedIn, (req, res) => {
    let query = 'select p.productId,p.name,od.quantity,od.price,a.country,a.city,a.addressline,a.postalcode,o.userid,o.firstname,o.lastname,o.companyname,o.phonenumber from orders o join orderdetails od on o.orderId = od.orderId join products p on p.productID = od.productId join address a on a.addressId = o.addressID where o.orderId = ?'
    if(!req.user.admin){
        query = `select p.productId,p.name,od.quantity,od.price,a.country,a.city,a.addressline,a.postalcode,o.userid,o.firstname,o.lastname,o.companyname,o.phonenumber from orders o join orderdetails od on o.orderId = od.orderId join products p on p.productID = od.productId join address a on a.addressId = o.addressID where o.userId = ${req.user.id} and o.orderId = ?`
    }
    connection.query(query, [req.params.id], (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        if(results.length === 0 && !req.user.admin){
            req.flash('error', 'You don\'t have authorization to access this.');
            return res.redirect('back');
        }
        res.render('order-details', {order: results, title: 'shop'});
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', {title: 'contact'});
});
app.post('/contact', (req, res) => {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'itech5256@gmail.com', // generated ethereal user
          pass: 'test44332211', // generated ethereal password
        },
    });
    
    let mailoptions= {
        from: `${req.email}<itech5256@gmail.com>`,
        to: "itech5256@gmail.com", 
        subject: req.body.subject, 
        text: req.body.message, 
    }
    transporter.sendMail(mailoptions,function(err,data){
        if(err){
            return res.status(500).render('500');
        }
      });
    res.redirect('/');
});

app.get('/add-product',  isLoggedIn, isAdmin, (req, res) => {
    res.render('add-product', {edit: false, title: 'Add Product'});
});

app.get('/edit-product/:id',  isLoggedIn, isAdmin, (req, res) => {
    connection.query('SELECT * FROM products LEFT JOIN specifications ON products.specificationsId = specifications.id WHERE productId = ?', [req.params.id], (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        res.render('add-product', {edit: true, title: 'Edit Product', product: results[0]});
    });
});

app.post('/add-product', isLoggedIn, isAdmin, (req, res) => {
    const image = req.file;
    const spec = req.body.spec;
    const product = req.body.product;
    product.image = image.path;
    product.specificationsId = null;
    if(product.categoryId === 'C1' || product.categoryId === 'C2'){
        connection.query('INSERT INTO specifications SET ?', spec, (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            product.specificationsId = results.insertId;
            connection.query('INSERT INTO products SET ?', product, (err, results) => {
                if(err){
                    return res.status(500).render('500');
                }
                return res.redirect('/');
            });
        });
    }
    else{
        connection.query('INSERT INTO products SET ?', product, (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            res.redirect('/');
        });
    }
});

app.post('/edit-product/:id', isLoggedIn, isAdmin, (req, res) => {
    const image = req.file;
    const spec = req.body.spec;
    const specId = req.body.specId;
    const product = req.body.product;
    product.image = image.path;
    const update = "UPDATE specifications SET CPU = ?, GPU = ?, RAM = ?, HardDisk = ? WHERE id = ?";
    if(!specId && (product.categoryId === 'C1' || product.categoryId === 'C2')){
        connection.query('INSERT INTO specifications SET ?', spec, (err, results) => {
            if(err){
                console.log(err);
                return res.status(500).render('500');
            }
            product.specificationsId = results.insertId;
            connection.query('UPDATE products SET ? WHERE productId = ?', [product, req.params.id], (err, results) => {
                if(err){
                    return res.status(500).render('500');
                }
                res.redirect('/');
            });
        });
    }
    else if(specId){
        connection.query(update, [spec.CPU, spec.GPU, spec.RAM, spec.HardDisk, specId], (err, results) => {
            if(err){
                return res.status(500).render('500');
            }
            product.specificationsId = specId;
            connection.query('UPDATE products SET ? WHERE productId = ?', [product, req.params.id], (err, results) => {
                if(err){
                    return res.status(500).render('500');
                }
                res.redirect('/');
            });
        });
    }
    else{
        product.specificationsId = null;
            connection.query('UPDATE products SET ? WHERE productId = ?', [product, req.params.id], (err, results) => {
                if(err){
                    console.log(err);
                    return res.status(500).render('500');
                }
                res.redirect('/');
            });
    }
});

app.get('/product/:id', (req, res) => {
    const id = req.params.id;
    connection.query(`SELECT products.productId, products.name, products.qty, products.description, 
    products.price, products.specificationsId, products.image, categories.name as category, colors.color, specifications.CPU, 
    specifications.GPU, specifications.RAM, specifications.HardDisk FROM products INNER JOIN categories ON categories.id = products.categoryId 
    INNER JOIN colors ON colors.id = products.colorId LEFT JOIN specifications ON specifications.id = products.specificationsId 
    WHERE products.productId = ? AND products.qty > 0`, id, (err, results) => {
        if(err){
            return res.status(500).render('500');
        }
        res.render('single-product', {product : results[0], title: 'shop'});
    });
});

app.use('/', (req, res) => {
    res.status(404).render('404');
});

app.listen(3000);