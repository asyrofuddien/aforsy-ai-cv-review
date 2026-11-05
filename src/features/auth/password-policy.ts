export const passwordRequirements = (password: string) => [
  {
    key: 'length',
    label: '12–128 characters',
    met: password.length >= 12 && password.length <= 128,
  },
  { key: 'lowercase', label: 'A lowercase letter (a–z)', met: /[a-z]/.test(password) },
  { key: 'uppercase', label: 'An uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
  { key: 'number', label: 'A number (0–9)', met: /[0-9]/.test(password) },
  {
    key: 'special',
    label: 'A special character (for example !@#$)',
    met: /[^\p{L}\p{N}\s]/u.test(password),
  },
];

export const isStrongPassword = (password: unknown): password is string =>
  typeof password === 'string' && passwordRequirements(password).every((rule) => rule.met);
