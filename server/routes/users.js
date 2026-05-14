const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const requireRole = require('../middleware/requireRole');
const router = express.Router();

// Apenas master e admin acessam /users
router.use(requireRole('master', 'admin'));

// Lista usuários
// master vê todos; admin vê apenas usuários comuns
router.get('/', (req, res) => {
    const isMaster = req.user.role === 'master';
    const users = isMaster
        ? db.prepare(`SELECT id, username, email, role, ativo, created_at FROM users ORDER BY role, username`).all()
        : db.prepare(`SELECT id, username, email, role, ativo, created_at FROM users WHERE role = 'user' ORDER BY username`).all();

    res.render('users', { title: 'Usuários', users, message: req.query.msg || null, error: req.query.err || null });
});

// Formulário de novo usuário
router.get('/novo', (req, res) => {
    const devices = db.prepare('SELECT id, name, device_uuid FROM devices ORDER BY name').all();
    res.render('user-edit', { title: 'Novo Usuário', editUser: null, devices, selectedDevices: [], message: null, error: null });
});

// Cria usuário
router.post('/', async (req, res) => {
    const { username, password, email, role } = req.body;

    if (!username || !password) {
        return res.redirect('/users?err=Usuário e senha são obrigatórios.');
    }
    if (password.length < 6) {
        return res.redirect('/users?err=Senha muito curta (mínimo 6 caracteres).');
    }

    // Admin só pode criar usuários comuns
    const targetRole = role === 'master' && req.user.role !== 'master' ? 'user'
        : role === 'admin' && req.user.role !== 'master' ? 'user'
        : (role || 'user');

    try {
        const hash = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)')
            .run(username.trim(), hash, email?.trim() || null, targetRole);
        res.redirect('/users?msg=Usuário criado com sucesso.');
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.redirect('/users?err=Nome de usuário já existe.');
        }
        res.redirect('/users?err=Erro ao criar usuário.');
    }
});

// Formulário de edição
router.get('/:id/editar', (req, res) => {
    const editUser = db.prepare('SELECT id, username, email, role, ativo FROM users WHERE id = ?').get(req.params.id);
    if (!editUser) return res.redirect('/users?err=Usuário não encontrado.');

    // Admin não pode editar masters ou admins
    if (req.user.role === 'admin' && editUser.role !== 'user') {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }
    // Nenhum usuário edita a si mesmo por aqui (evitar auto-bloqueio)
    if (editUser.id === req.user.id) {
        return res.redirect('/users?err=Use /perfil para editar seus próprios dados.');
    }

    const devices = db.prepare('SELECT id, name, device_uuid FROM devices ORDER BY name').all();
    const selectedDevices = db.prepare('SELECT device_id FROM user_devices WHERE user_id = ?')
        .all(req.params.id).map(r => r.device_id);

    res.render('user-edit', { title: 'Editar Usuário', editUser, devices, selectedDevices, message: null, error: null });
});

// Salva edição
router.post('/:id', async (req, res) => {
    const { username, password, email, role, ativo, devices } = req.body;
    const targetId = parseInt(req.params.id);

    const editUser = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
    if (!editUser) return res.redirect('/users?err=Usuário não encontrado.');
    if (req.user.role === 'admin' && editUser.role !== 'user') {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }

    // Define role final (admin não pode promover acima de 'user')
    const targetRole = req.user.role === 'master' ? (role || editUser.role) : 'user';
    const isAtivo = ativo === '1' ? 1 : 0;

    try {
        if (password && password.length >= 6) {
            const hash = await bcrypt.hash(password, 10);
            db.prepare('UPDATE users SET username = ?, password_hash = ?, email = ?, role = ?, ativo = ? WHERE id = ?')
                .run(username.trim(), hash, email?.trim() || null, targetRole, isAtivo, targetId);
        } else {
            db.prepare('UPDATE users SET username = ?, email = ?, role = ?, ativo = ? WHERE id = ?')
                .run(username.trim(), email?.trim() || null, targetRole, isAtivo, targetId);
        }

        // Atualiza dispositivos permitidos (apenas para role 'user')
        db.prepare('DELETE FROM user_devices WHERE user_id = ?').run(targetId);
        if (targetRole === 'user' && devices) {
            const ids = Array.isArray(devices) ? devices : [devices];
            const insert = db.prepare('INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)');
            for (const deviceId of ids) {
                insert.run(targetId, parseInt(deviceId));
            }
        }

        res.redirect('/users?msg=Usuário atualizado.');
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.redirect(`/users/${targetId}/editar?err=Nome de usuário já existe.`);
        }
        res.redirect('/users?err=Erro ao atualizar usuário.');
    }
});

// Deleta usuário
router.post('/:id/deletar', (req, res) => {
    const targetId = parseInt(req.params.id);

    if (targetId === req.user.id) {
        return res.redirect('/users?err=Você não pode deletar sua própria conta.');
    }

    const editUser = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
    if (!editUser) return res.redirect('/users?err=Usuário não encontrado.');
    if (req.user.role === 'admin' && editUser.role !== 'user') {
        return res.redirect('/users?err=Sem permissão para deletar este usuário.');
    }
    // Protege o último master
    if (editUser.role === 'master') {
        const masterCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'master' AND ativo = 1`).get().c;
        if (masterCount <= 1) {
            return res.redirect('/users?err=Não é possível deletar o único usuário master.');
        }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.redirect('/users?msg=Usuário removido.');
});

module.exports = router;
