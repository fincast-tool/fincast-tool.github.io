const crypto = require('crypto');
const password = 'Nikolai1988!';
const hash = crypto.createHash('md5').update(password).digest('hex');
console.log(hash);
