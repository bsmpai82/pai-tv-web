function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).render('error', { title: 'Acesso negado', message: 'Você não tem permissão para acessar esta página.' });
        }
        next();
    };
}

module.exports = requireRole;
