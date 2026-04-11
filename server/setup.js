const bcrypt = require('bcryptjs');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Digite a senha do painel (mínimo 6 caracteres): ', async (password) => {
    rl.close();

    if (!password || password.trim().length < 6) {
        console.error('Senha muito curta. Mínimo 6 caracteres.');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password.trim(), 10);
    const secret = crypto.randomBytes(32).toString('hex');

    const isProduction = process.env.NODE_ENV === 'production';
    const videosPath = isProduction ? '/srv/pai_tv/videos' : './uploads';
    const dbPath = isProduction ? '/srv/pai_tv/pai_tv.db' : './db/pai_tv.db';

    const envContent = [
        `PORT=3000`,
        `SESSION_SECRET=${secret}`,
        `ADMIN_PASSWORD_HASH=${hash}`,
        `VIDEOS_PATH=${videosPath}`,
        `DB_PATH=${dbPath}`,
    ].join('\n') + '\n';

    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    console.log('\n.env criado com sucesso!');
    console.log(`  Vídeos em: ${videosPath}`);
    console.log(`  Banco em:  ${dbPath}`);
    console.log('\nInicie o servidor com: npm start\n');
});
