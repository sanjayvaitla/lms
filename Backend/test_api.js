const http = require('http');
const fs = require('fs');
const req = http.request({
  hostname: 'localhost',
  port: 6000,
  path: '/api/v1/invoices/student/mine',
  method: 'GET'
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('api_response.txt', `STATUS: ${res.statusCode}\n\n${data}`);
  });
});
req.on('error', e => fs.writeFileSync('api_response.txt', e.toString()));
req.end();
