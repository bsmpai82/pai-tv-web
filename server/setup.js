const bcrypt = require('bcrypt');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    const isProduction = process.env.NODE_ENV === 'production';
    const videosPath = isProduction ? '/srv/pai_tv/videos' : './uploads';
    const dbPath = isProduction ? '/srv/pai_tv/pai_tv.db' : './db/pai_tv.db';

    const envFile = path.join(__dirname, '.env');
    let secret = crypto.randomBytes(32).toString('hex');

    // Preserva SESSION_SECRET se .env já existe
    if (fs.existsSync(envFile)) {
        const existing = fs.readFileSync(envFile, 'utf8');
        const match = existing.match(/^SESSION_SECRET=(.+)$/m);
        if (match) secret = match[1];
    }

    console.log('\n=== PAI TV — Setup inicial ===\n');

    const username = (await ask('Nome de usuário master [admin]: ')).trim() || 'admin';
    const password = (await ask('Senha do usuário master (mínimo 6 caracteres): ')).trim();

    rl.close();

    if (password.length < 6) {
        console.error('Senha muito curta. Mínimo 6 caracteres.');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    // Grava .env (sem ADMIN_PASSWORD_HASH — autenticação agora é pelo banco)
    const envContent = [
        `PORT=3000`,
        `SESSION_SECRET=${secret}`,
        `VIDEOS_PATH=${videosPath}`,
        `DB_PATH=${dbPath}`,
    ].join('\n') + '\n';

    fs.writeFileSync(envFile, envContent);

    // Inicializa banco e cria usuário master
    process.env.DB_PATH = dbPath;
    const db = require('./db/database');

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        db.prepare('UPDATE users SET password_hash = ?, role = ?, ativo = 1 WHERE username = ?')
            .run(hash, 'master', username);
        console.log(`\nUsuário master "${username}" atualizado.`);
    } else {
        db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
            .run(username, hash, 'master');
        console.log(`\nUsuário master "${username}" criado.`);
    }

    console.log(`  Vídeos em: ${videosPath}`);
    console.log(`  Banco em:  ${dbPath}`);
    console.log('\nInicie o servidor com: npm start\n');
}

main().catch(err => { console.error(err); process.exit(1); });
