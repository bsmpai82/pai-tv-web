// Política de senha do painel: mínimo 12 caracteres e pelo menos 3 tipos
// diferentes de caracteres (minúsculas, maiúsculas, números, símbolos).

const MIN_LENGTH = 12;
const MIN_TIPOS = 3;

const TIPOS = [
    /[a-z]/,          // minúsculas
    /[A-Z]/,          // maiúsculas
    /[0-9]/,          // números
    /[^a-zA-Z0-9]/,   // símbolos (qualquer outro caractere)
];

// Retorna null se a senha é válida, ou a mensagem de erro para exibir ao usuário.
function validatePassword(password) {
    if (!password || password.length < MIN_LENGTH) {
        return `Senha muito curta (mínimo ${MIN_LENGTH} caracteres).`;
    }
    const tiposPresentes = TIPOS.filter(re => re.test(password)).length;
    if (tiposPresentes < MIN_TIPOS) {
        return `Senha fraca: use pelo menos ${MIN_TIPOS} tipos de caracteres (minúsculas, maiúsculas, números e símbolos).`;
    }
    return null;
}

const PASSWORD_HINT = `mínimo ${MIN_LENGTH} caracteres, ${MIN_TIPOS} tipos (Aa/0-9/símbolo)`;

module.exports = { validatePassword, MIN_LENGTH, MIN_TIPOS, PASSWORD_HINT };
