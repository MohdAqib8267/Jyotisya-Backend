

import ExpressServer from "./utils/common/expressServer";
import mysql from 'mysql';

const server = new ExpressServer(parseInt(process.env.PORT || "9999", 10));
server.start();

const connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: 'jyotisya',
    user: 'root',
    password: 'Aqib8267@',
});
   
connection.connect(function(err) { 
  if (err) {
    console.error("Error connecting:", err);
    return;
  }
  console.log('Connected as id', connection.threadId);
});

