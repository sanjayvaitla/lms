const axios = require('axios');

async function run() {
  try {
    const res = await axios.post('http://localhost:6000/api/v1/auth/login', {
      email: 'student@example.com',
      password: 'password' // replace with real student credentials if possible, but actually we don't have them easily.
    });
    console.log(res.data);
  } catch(e) {
    console.error(e.response?.data || e.message);
  }
}
run();
