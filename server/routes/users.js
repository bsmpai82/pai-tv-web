const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const requireRole = require('../middleware/requireRole');
const { sendWelcomeEmail } = require('../services/mailer');
const { validatePassword } = require('../services/passwordPolicy');
const router = express.Router();

// Gestão de usuários (criar, deletar) exige master/admin;
// usuário comum acessa /users apenas para ver a si mesmo e trocar a própria senha
const requireAdmin = requireRole('master', 'admin');

// Lista usuários
// master vê todos; admin vê apenas usuários comuns; usuário comum vê só a si mesmo
router.get('/', (req, res) => {
    const users = req.user.role === 'user'
        ? db.prepare(`SELECT id, username, email, role, ativo, created_at, password_changed_at FROM users WHERE id = ?`).all(req.user.id)
        : req.user.role === 'master'
            ? db.prepare(`SELECT id, username, email, role, ativo, created_at, password_changed_at FROM users ORDER BY role, username`).all()
            : db.prepare(`SELECT id, username, email, role, ativo, created_at, password_changed_at FROM users WHERE role = 'user' OR id = ? ORDER BY username`).all(req.user.id);

    res.render('users', { title: 'Usuários', users, message: req.query.msg || null, error: req.query.err || null });
});

// Formulário de novo usuário
router.get('/novo', requireAdmin, (req, res) => {
    const devices = db.prepare('SELECT id, name, device_uuid FROM devices ORDER BY name').all();
    res.render('user-edit', { title: 'Novo Usuário', editUser: null, devices, selectedDevices: [], message: null, error: null });
});

// Cria usuário
router.post('/', requireAdmin, async (req, res) => {
    const { username, password, email, role } = req.body;

    if (!username || !password) {
        return res.redirect('/users?err=Usuário e senha são obrigatórios.');
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
        return res.redirect('/users?err=' + encodeURIComponent(passwordError));
    }

    // Admin só pode criar usuários comuns
    const targetRole = role === 'master' && req.user.role !== 'master' ? 'user'
        : role === 'admin' && req.user.role !== 'master' ? 'user'
        : (role || 'user');

    try {
        const hash = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO users (username, password_hash, email, role, password_changed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
            .run(username.trim(), hash, email?.trim() || null, targetRole);
        const newUser = db.prepare('SELECT id, username, email, role FROM users WHERE username = ?').get(username.trim());
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        sendWelcomeEmail(newUser, baseUrl);
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

    const isSelf = editUser.id === req.user.id;
    // Usuário comum só pode editar a si mesmo
    if (req.user.role === 'user' && !isSelf) {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }
    // Admin só pode editar usuários comuns (ou a si mesmo)
    if (req.user.role === 'admin' && !isSelf && editUser.role !== 'user') {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }

    const devices = db.prepare('SELECT id, name, device_uuid FROM devices ORDER BY name').all();
    const selectedDevices = db.prepare('SELECT device_id FROM user_devices WHERE user_id = ?')
        .all(req.params.id).map(r => r.device_id);

    res.render('user-edit', { title: 'Editar Usuário', editUser, devices, selectedDevices, isSelf, message: req.query.msg || null, error: req.query.err || null });
});

// Salva edição
router.post('/:id', async (req, res) => {
    const { username, password, currentPassword, email, role, ativo, devices } = req.body;
    const targetId = parseInt(req.params.id);

    const editUser = db.prepare('SELECT id, role, password_hash FROM users WHERE id = ?').get(targetId);
    if (!editUser) return res.redirect('/users?err=Usuário não encontrado.');
    const isSelf = targetId === req.user.id;
    if (req.user.role === 'user' && !isSelf) {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }
    if (req.user.role === 'admin' && !isSelf && editUser.role !== 'user') {
        return res.redirect('/users?err=Sem permissão para editar este usuário.');
    }

    // Trocar a própria senha exige confirmar a senha atual (todos os perfis)
    if (password && isSelf) {
        const confirmado = currentPassword && await bcrypt.compare(currentPassword, editUser.password_hash);
        if (!confirmado) {
            return res.redirect(`/users/${targetId}/editar?err=` + encodeURIComponent('Senha atual incorreta.'));
        }
    }

    // Usuário comum altera apenas a própria senha e o próprio e-mail —
    // username/role/ativo/dispositivos permanecem os do banco
    if (req.user.role === 'user') {
        if (password) {
            const passwordError = validatePassword(password);
            if (passwordError) {
                return res.redirect(`/users/${targetId}/editar?err=` + encodeURIComponent(passwordError));
            }
            const hash = await bcrypt.hash(password, 10);
            db.prepare('UPDATE users SET password_hash = ?, email = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, email?.trim() || null, targetId);
        } else {
            db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email?.trim() || null, targetId);
        }
        return res.redirect('/users?msg=' + encodeURIComponent('Dados atualizados com sucesso.'));
    }

    // Auto-edição preserva role e ativo atuais (impede auto-bloqueio)
    const targetRole = isSelf ? editUser.role
        : req.user.role === 'master' ? (role || editUser.role) : 'user';
    const isAtivo = isSelf ? 1 : (ativo === '1' ? 1 : 0);

    try {
        if (password) {
            const passwordError = validatePassword(password);
            if (passwordError) {
                return res.redirect(`/users/${targetId}/editar?err=` + encodeURIComponent(passwordError));
            }
            const hash = await bcrypt.hash(password, 10);
            db.prepare('UPDATE users SET username = ?, password_hash = ?, email = ?, role = ?, ativo = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?')
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
router.post('/:id/deletar', requireAdmin, (req, res) => {
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
