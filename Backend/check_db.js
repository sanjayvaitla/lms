const fs = require('fs');
const { Client } = require('pg');
const c = new Client('postgresql://postgres:postgres@localhost:5432/lms_db');
c.connect().then(() => {
  c.query("SELECT i.id, i.amount, i.installment_key, u.email FROM invoices i JOIN users u ON u.id = i.student_id WHERE u.email = 'shreyas15gowda@gmail.com'").then(res => {
    fs.writeFileSync('student_invoices.txt', JSON.stringify(res.rows, null, 2));
    c.end();
  }).catch(err => {
    fs.writeFileSync('student_invoices.txt', err.toString());
    c.end();
  });
});
