const bcrypt = require('bcrypt');
const readline = require('readline');
const { validatePassword, PASSWORD_HINT } = require('./services/passwordPolicy');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    const isProduction = process.env.NODE_ENV === 'production';

    const envFile = path.join(__dirname, '.env');
    let secret = crypto.randomBytes(32).toString('hex');

    // Lê o .env existente: preserva variáveis não gerenciadas e usa valores existentes como defaults
    const MANAGED_KEYS = new Set(['SESSION_SECRET', 'ADMIN_PASSWORD_HASH']);
    const preservedVars = {};
    const existingEnv = {};
    if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
            const eqIdx = line.indexOf('=');
            if (eqIdx < 1) continue;
            const key = line.slice(0, eqIdx).trim();
            const val = line.slice(eqIdx + 1).trim();
            if (!key) continue;
            existingEnv[key] = val;
            if (key === 'SESSION_SECRET') { secret = val; continue; }
            if (!MANAGED_KEYS.has(key)) preservedVars[key] = val;
        }
    }

    // Usa valores do .env existente como defaults (permite homolog ter PORT=3001, DB_PATH próprio, etc.)
    const port = existingEnv['PORT'] || '3000';
    const videosPath = existingEnv['VIDEOS_PATH'] || (isProduction ? '/srv/pai_tv/videos' : './uploads');
    const dbPath = existingEnv['DB_PATH'] || (isProduction ? '/srv/pai_tv/pai_tv.db' : './db/pai_tv.db');

    console.log('\n=== PAI TV — Setup inicial ===\n');

    const username = (await ask('Nome de usuário master [admin]: ')).trim() || 'admin';
    const password = (await ask(`Senha do usuário master (${PASSWORD_HINT}): `)).trim();

    rl.close();

    const passwordError = validatePassword(password);
    if (passwordError) {
        console.error(passwordError);
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    // Grava .env preservando variáveis externas (Gmail, etc.)
    const lines = [
        `PORT=${port}`,
        `SESSION_SECRET=${secret}`,
        `VIDEOS_PATH=${videosPath}`,
        `DB_PATH=${dbPath}`,
        ...Object.entries(preservedVars).filter(([k]) => !['PORT','VIDEOS_PATH','DB_PATH'].includes(k)).map(([k, v]) => `${k}=${v}`),
    ];
    fs.writeFileSync(envFile, lines.join('\n') + '\n');

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
