const dotenv = require('dotenv');
const mysql = require('mysql');

dotenv.config({
    path: './.env'
});

const connection = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    insecureAuth : true,
    database: process.env.DATABASE,
    multipleStatements: true
});

module.exports = connection;